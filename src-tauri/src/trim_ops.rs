use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

pub fn spawn_ffmpeg(ffmpeg: &str, args: &[String]) -> Result<Child, String> {
    Command::new(ffmpeg)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn ffmpeg: {e}"))
}

/// Kill then wait. Never drop a live `Child`.
pub fn kill_owned_child(mut child: Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn lock_child(
    slot: &Mutex<Option<Child>>,
) -> Result<std::sync::MutexGuard<'_, Option<Child>>, String> {
    slot.lock()
        .map_err(|e| format!("trim child lock poisoned: {e}"))
}

pub fn kill_child(slot: &Mutex<Option<Child>>) -> Result<(), String> {
    if let Some(child) = lock_child(slot)?.take() {
        kill_owned_child(child);
    }
    Ok(())
}

/// If the process already exited, return that status (do not pretend we cancelled).
/// If it is still running, `kill()` then `wait()`. Missing slot → `None`.
///
/// Holds the slot lock across `try_wait`. On a successful exit, sets `completed_ok`
/// *before* releasing the child so a concurrent `wait_child` cannot observe an empty
/// slot and treat the encode as cancelled.
pub fn reap_or_kill(
    slot: &Mutex<Option<Child>>,
    completed_ok: &AtomicBool,
) -> Result<Option<ExitStatus>, String> {
    let mut guard = lock_child(slot)?;
    let Some(child) = guard.as_mut() else {
        return Ok(None);
    };
    match child.try_wait() {
        Ok(Some(status)) => {
            mark_ok_if_success(Some(status), completed_ok);
            let _ = guard.take();
            Ok(Some(status))
        }
        Ok(None) => {
            let child = guard.take().expect("child was Some after try_wait");
            drop(guard);
            kill_owned_child(child);
            Ok(None)
        }
        Err(e) => {
            if let Some(child) = guard.take() {
                drop(guard);
                kill_owned_child(child);
            }
            Err(e.to_string())
        }
    }
}

fn mark_ok_if_success(status: Option<ExitStatus>, completed_ok: &AtomicBool) {
    if matches!(status, Some(s) if s.success()) {
        completed_ok.store(true, Ordering::SeqCst);
    }
}

pub fn wait_child(
    slot: &Mutex<Option<Child>>,
    cancelled: impl Fn() -> bool,
    completed_ok: &AtomicBool,
) -> Result<Option<ExitStatus>, String> {
    loop {
        if cancelled() {
            // Kill then wait, or return the natural exit if encode already finished.
            // Do not return Ok(None) while a live Child remains in the slot.
            return reap_or_kill(slot, completed_ok);
        }
        let mut guard = lock_child(slot)?;
        match guard.as_mut() {
            None => return Ok(None),
            Some(child) => match child.try_wait() {
                Ok(Some(status)) => {
                    mark_ok_if_success(Some(status), completed_ok);
                    let _ = guard.take();
                    return Ok(Some(status));
                }
                Ok(None) => {}
                Err(e) => {
                    if let Some(child) = guard.take() {
                        kill_owned_child(child);
                    }
                    return Err(e.to_string());
                }
            },
        }
        drop(guard);
        std::thread::sleep(Duration::from_millis(40));
    }
}

/// Store immediately after spawn. If already cancelled (or lock fails), kill before drop.
/// Returns `false` when the child was killed instead of stored.
pub fn store_spawned_child(
    slot: &Mutex<Option<Child>>,
    child: Child,
    cancelled: bool,
) -> Result<bool, String> {
    if cancelled {
        kill_owned_child(child);
        return Ok(false);
    }
    match slot.lock() {
        Ok(mut guard) => {
            *guard = Some(child);
            Ok(true)
        }
        Err(e) => {
            kill_owned_child(child);
            Err(format!("trim child lock poisoned: {e}"))
        }
    }
}

/// Set cancelled, kill if still running, delete output only when encode has not succeeded.
pub fn apply_cancel(
    cancelled: &AtomicBool,
    completed_ok: &AtomicBool,
    child_slot: &Mutex<Option<Child>>,
    output: Option<&Path>,
) -> Result<(), String> {
    cancelled.store(true, Ordering::SeqCst);
    reap_or_kill(child_slot, completed_ok)?;
    if !completed_ok.load(Ordering::SeqCst) {
        if let Some(path) = output {
            delete_output_if_exists(path);
        }
    }
    Ok(())
}

pub fn delete_output_if_exists(path: &Path) {
    if path.is_file() {
        let _ = std::fs::remove_file(path);
    }
}

pub fn should_delete_incomplete_output(encode_succeeded: bool) -> bool {
    !encode_succeeded
}

pub fn read_stderr_lines<F>(stderr: std::process::ChildStderr, mut on_line: F)
where
    F: FnMut(String),
{
    let reader = BufReader::new(stderr);
    for line in reader.lines().map_while(Result::ok) {
        if !line.is_empty() {
            on_line(line);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_file(bytes: &[u8]) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "trimtown_del_{}_{}.bin",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn delete_output_removes_file() {
        let p = temp_file(b"partial");
        assert!(p.is_file());
        delete_output_if_exists(&p);
        assert!(!p.exists());
    }

    #[test]
    fn delete_output_missing_is_ok() {
        delete_output_if_exists(Path::new("/this/does/not/exist/trimtown_partial.mp4"));
    }

    #[test]
    fn failed_encode_should_delete_incomplete_output() {
        assert!(should_delete_incomplete_output(false));
        assert!(!should_delete_incomplete_output(true));
    }

    #[test]
    fn kill_child_empty_slot() {
        let slot: Mutex<Option<Child>> = Mutex::new(None);
        kill_child(&slot).unwrap();
        assert!(slot.lock().unwrap().is_none());
    }

    fn spawn_long_child() -> Child {
        Command::new("python")
            .args(["-c", "import time; time.sleep(30)"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn long-running python child")
    }

    fn pid_is_alive(pid: u32) -> bool {
        #[cfg(windows)]
        {
            let output = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
                .output()
                .expect("tasklist");
            String::from_utf8_lossy(&output.stdout).contains(&format!("{pid}"))
        }
        #[cfg(not(windows))]
        {
            Command::new("kill")
                .args(["-0", &pid.to_string()])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        }
    }

    fn spawn_ok_child() -> Child {
        Command::new("python")
            .args(["-c", "pass"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn successful python child")
    }

    #[test]
    fn wait_child_kills_live_process_when_cancelled() {
        let child = spawn_long_child();
        let pid = child.id();
        assert!(pid_is_alive(pid), "fixture process should be running");
        let slot = Mutex::new(Some(child));
        let completed_ok = AtomicBool::new(false);
        let status = wait_child(&slot, || true, &completed_ok).expect("wait_child");
        assert!(status.is_none(), "cancel should not report a natural exit");
        assert!(
            slot.lock().unwrap().is_none(),
            "child must be taken from slot"
        );
        assert!(
            !pid_is_alive(pid),
            "ffmpeg-like child must be killed, not dropped live"
        );
        assert!(!completed_ok.load(Ordering::SeqCst));
    }

    #[test]
    fn wait_child_late_cancel_reports_successful_exit() {
        let child = spawn_ok_child();
        let slot = Mutex::new(Some(child));
        std::thread::sleep(Duration::from_millis(300));
        let completed_ok = AtomicBool::new(false);
        let status = wait_child(&slot, || true, &completed_ok).expect("wait_child");
        assert!(
            status.map(|s| s.success()).unwrap_or(false),
            "late cancel must not hide a successful encode"
        );
        assert!(completed_ok.load(Ordering::SeqCst));
    }

    #[test]
    fn apply_cancel_deletes_partial_when_child_still_running() {
        let child = spawn_long_child();
        let pid = child.id();
        let slot = Mutex::new(Some(child));
        let cancelled = AtomicBool::new(false);
        let completed_ok = AtomicBool::new(false);
        let p = temp_file(b"partial");
        apply_cancel(&cancelled, &completed_ok, &slot, Some(&p)).unwrap();
        assert!(cancelled.load(Ordering::SeqCst));
        assert!(!completed_ok.load(Ordering::SeqCst));
        assert!(!p.exists());
        assert!(!pid_is_alive(pid));
    }

    #[test]
    fn apply_cancel_keeps_file_when_encode_already_succeeded() {
        let child = spawn_ok_child();
        let slot = Mutex::new(Some(child));
        std::thread::sleep(Duration::from_millis(300));
        let cancelled = AtomicBool::new(false);
        let completed_ok = AtomicBool::new(false);
        let p = temp_file(b"complete");
        apply_cancel(&cancelled, &completed_ok, &slot, Some(&p)).unwrap();
        assert!(cancelled.load(Ordering::SeqCst));
        assert!(completed_ok.load(Ordering::SeqCst));
        assert!(p.is_file(), "late cancel must not delete successful output");
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn apply_cancel_keeps_file_when_completed_ok_already_set() {
        let slot: Mutex<Option<Child>> = Mutex::new(None);
        let cancelled = AtomicBool::new(false);
        let completed_ok = AtomicBool::new(true);
        let p = temp_file(b"complete");
        apply_cancel(&cancelled, &completed_ok, &slot, Some(&p)).unwrap();
        assert!(p.is_file());
        let _ = std::fs::remove_file(&p);
    }

    /// Worker: `wait_child` returned `Ok(None)` (empty slot). Delete only if encode did not succeed.
    fn worker_deletes_after_wait_none(completed_ok: bool) -> bool {
        should_delete_incomplete_output(completed_ok)
    }

    #[test]
    fn wait_none_must_not_delete_if_completed_ok() {
        assert!(!worker_deletes_after_wait_none(true));
        assert!(worker_deletes_after_wait_none(false));
    }

    #[test]
    fn late_cancel_take_then_wait_none_must_not_delete_successful_output() {
        // apply_cancel: take child, successful try_wait, set completed_ok, release lock.
        // Concurrent wait_child then sees empty slot → Ok(None). Worker re-checks completed_ok.
        let child = spawn_ok_child();
        let slot = Mutex::new(Some(child));
        std::thread::sleep(Duration::from_millis(300));
        let cancelled = AtomicBool::new(false);
        let completed_ok = AtomicBool::new(false);
        let p = temp_file(b"complete");

        apply_cancel(&cancelled, &completed_ok, &slot, Some(&p)).unwrap();
        assert!(completed_ok.load(Ordering::SeqCst));
        assert!(slot.lock().unwrap().is_none());

        let status = wait_child(&slot, || true, &completed_ok).expect("wait_child");
        assert!(status.is_none(), "empty slot after successful reap");
        if worker_deletes_after_wait_none(completed_ok.load(Ordering::SeqCst)) {
            delete_output_if_exists(&p);
        }
        assert!(
            p.is_file(),
            "wait_child Ok(None) must not delete after successful exit"
        );
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn concurrent_late_cancel_and_wait_child_keep_successful_output() {
        let child = spawn_ok_child();
        let slot = Mutex::new(Some(child));
        std::thread::sleep(Duration::from_millis(300));
        let cancelled = AtomicBool::new(false);
        let completed_ok = AtomicBool::new(false);
        let p = temp_file(b"complete");

        std::thread::scope(|s| {
            s.spawn(|| {
                apply_cancel(&cancelled, &completed_ok, &slot, Some(&p)).unwrap();
            });
            s.spawn(|| {
                let status = wait_child(&slot, || cancelled.load(Ordering::SeqCst), &completed_ok)
                    .expect("wait_child");
                if status.is_none()
                    && worker_deletes_after_wait_none(completed_ok.load(Ordering::SeqCst))
                {
                    delete_output_if_exists(&p);
                }
            });
        });

        assert!(completed_ok.load(Ordering::SeqCst));
        assert!(
            p.is_file(),
            "late cancel racing successful exit must not delete output"
        );
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn store_spawned_child_kills_when_cancelled_before_store() {
        let child = spawn_long_child();
        let pid = child.id();
        let slot: Mutex<Option<Child>> = Mutex::new(None);
        let stored = store_spawned_child(&slot, child, true).unwrap();
        assert!(!stored);
        assert!(slot.lock().unwrap().is_none());
        assert!(
            !pid_is_alive(pid),
            "spawn-then-store race must kill, not drop, the new child"
        );
    }

    #[test]
    fn store_spawned_child_keeps_live_child_when_not_cancelled() {
        let child = spawn_long_child();
        let pid = child.id();
        let slot: Mutex<Option<Child>> = Mutex::new(None);
        let stored = store_spawned_child(&slot, child, false).unwrap();
        assert!(stored);
        assert!(pid_is_alive(pid));
        kill_child(&slot).unwrap();
        assert!(!pid_is_alive(pid));
    }
}
