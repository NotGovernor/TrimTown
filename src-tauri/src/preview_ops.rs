use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use crate::frame_ops::frame_to_seconds;

const APP_CACHE_DIR_NAME: &str = "com.trimtown.app";

pub fn preview_cache_root() -> Result<PathBuf, String> {
    Ok(dirs::cache_dir()
        .ok_or_else(|| "Failed to determine cache directory".to_string())?
        .join(APP_CACHE_DIR_NAME))
}

pub fn create_generation_dir(generation_uuid: &str) -> Result<PathBuf, String> {
    let dir = preview_cache_root()?.join(generation_uuid);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create preview cache: {e}"))?;
    Ok(dir)
}

pub fn cleanup_generation(dir: &Path) -> Result<(), String> {
    if dir.exists() {
        std::fs::remove_dir_all(dir)
            .map_err(|e| format!("Failed to cleanup preview cache: {e}"))?;
    }
    Ok(())
}

pub fn clamp_grain_start(start_sec: f64) -> f64 {
    if start_sec.is_finite() {
        start_sec.max(0.0)
    } else {
        0.0
    }
}

pub fn grain_ffmpeg_args(sidecar: &str, start_sec: f64, duration_sec: f64) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-ss".into(),
        clamp_grain_start(start_sec).to_string(),
        "-t".into(),
        duration_sec.to_string(),
        "-i".into(),
        sidecar.to_string(),
        "-f".into(),
        "f32le".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "pipe:1".into(),
    ]
}

fn sidecar_extract_args(input: &str, output: &Path, codec: &str, bitrate: &str) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-y".into(),
        "-i".into(),
        input.to_string(),
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        "-c:a".into(),
        codec.to_string(),
        "-b:a".into(),
        bitrate.to_string(),
        output.to_string_lossy().into_owned(),
    ]
}

fn file_nonempty(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false)
}

fn spawn_ffmpeg(ffmpeg: &str, args: &[String]) -> Option<bool> {
    let output = Command::new(ffmpeg).args(args).output().ok()?;
    Some(output.status.success())
}

/// Extract a disposable mono sidecar. Opus first, AAC fallback. `Ok(None)` if both fail.
pub fn extract_sidecar(
    ffmpeg: &str,
    input: &str,
    out_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    let ogg = out_dir.join("preview.ogg");
    if spawn_ffmpeg(ffmpeg, &sidecar_extract_args(input, &ogg, "libopus", "24k")).unwrap_or(false)
        && file_nonempty(&ogg)
    {
        return Ok(Some(ogg));
    }
    let _ = std::fs::remove_file(&ogg);

    let m4a = out_dir.join("preview.m4a");
    if spawn_ffmpeg(ffmpeg, &sidecar_extract_args(input, &m4a, "aac", "32k")).unwrap_or(false)
        && file_nonempty(&m4a)
    {
        return Ok(Some(m4a));
    }
    let _ = std::fs::remove_file(&m4a);

    Ok(None)
}

/// Decode a PCM grain as f32le mono 16 kHz. Empty vec if no sidecar.
pub fn decode_pcm_grain(
    ffmpeg: &str,
    sidecar: Option<&Path>,
    start_sec: f64,
    duration_sec: f64,
) -> Result<Vec<f32>, String> {
    let Some(sidecar) = sidecar else {
        return Ok(Vec::new());
    };
    let sidecar = sidecar.to_string_lossy();
    let args = grain_ffmpeg_args(&sidecar, start_sec, duration_sec);
    let output = Command::new(ffmpeg)
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("ffmpeg failed with status {}", output.status)
        } else {
            stderr
        });
    }
    Ok(f32le_samples(&output.stdout))
}

fn f32le_samples(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes(chunk.try_into().expect("chunks_exact(4)")))
        .collect()
}

pub fn still_ffmpeg_args(path: &str, frame: u64, fps: f64) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        path.to_string(),
        "-ss".into(),
        frame_to_seconds(frame, fps).to_string(),
        "-frames:v".into(),
        "1".into(),
        "-f".into(),
        "image2pipe".into(),
        "-vcodec".into(),
        "mjpeg".into(),
        "pipe:1".into(),
    ]
}

pub fn kill_still_child(slot: &mut Option<Child>) {
    if let Some(mut prev) = slot.take() {
        let _ = prev.kill();
        let _ = prev.wait();
    }
}

pub fn extract_still(
    ffmpeg: &str,
    path: &str,
    frame: u64,
    fps: f64,
    still_child: &Mutex<Option<Child>>,
) -> Result<Vec<u8>, String> {
    let pid;
    let mut stdout;
    let mut stderr;
    {
        let mut slot = still_child
            .lock()
            .map_err(|e| format!("still lock poisoned: {e}"))?;
        kill_still_child(&mut slot);
        let mut child = Command::new(ffmpeg)
            .args(still_ffmpeg_args(path, frame, fps))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        stdout = child
            .stdout
            .take()
            .ok_or_else(|| "ffmpeg still missing stdout".to_string())?;
        stderr = child
            .stderr
            .take()
            .ok_or_else(|| "ffmpeg still missing stderr".to_string())?;
        pid = child.id();
        *slot = Some(child);
    }

    let mut jpeg = Vec::new();
    stdout.read_to_end(&mut jpeg).map_err(|e| e.to_string())?;
    let mut err_buf = Vec::new();
    let _ = stderr.read_to_end(&mut err_buf);

    let status = {
        let mut slot = still_child
            .lock()
            .map_err(|e| format!("still lock poisoned: {e}"))?;
        match slot.as_ref().map(|c| c.id()) {
            Some(id) if id == pid => {
                let mut child = slot.take().expect("still child");
                child.wait().map_err(|e| e.to_string())?
            }
            _ => return Err("still cancelled".into()),
        }
    };

    if !status.success() {
        let stderr = String::from_utf8_lossy(&err_buf).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("ffmpeg failed with status {status}")
        } else {
            stderr
        });
    }
    Ok(jpeg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grain_start_clamps_negative_to_zero() {
        assert_eq!(clamp_grain_start(-1.5), 0.0);
        assert_eq!(clamp_grain_start(-0.01), 0.0);
        let args = grain_ffmpeg_args("preview.ogg", -2.25, 0.08);
        let ss = args.iter().position(|a| a == "-ss").expect("-ss");
        assert_eq!(args[ss + 1], "0");
    }

    #[test]
    fn grain_start_keeps_non_negative() {
        assert_eq!(clamp_grain_start(0.0), 0.0);
        assert_eq!(clamp_grain_start(1.25), 1.25);
        let args = grain_ffmpeg_args("preview.ogg", 1.25, 0.08);
        let ss = args.iter().position(|a| a == "-ss").expect("-ss");
        assert_eq!(args[ss + 1], "1.25");
    }

    #[test]
    fn decode_pcm_grain_without_sidecar_is_empty() {
        let pcm = decode_pcm_grain("ffmpeg", None, -1.0, 0.08).expect("no sidecar");
        assert!(pcm.is_empty());
    }

    #[test]
    fn f32le_samples_round_trip() {
        let values = [0.0f32, -1.0, 0.5];
        let mut bytes = Vec::new();
        for v in values {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        assert_eq!(f32le_samples(&bytes), values);
    }

    #[test]
    fn still_args_seek_after_input_to_frame_time() {
        let args = still_ffmpeg_args("clip.mp4", 25, 25.0);
        assert_eq!(
            args,
            [
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "clip.mp4",
                "-ss",
                "1",
                "-frames:v",
                "1",
                "-f",
                "image2pipe",
                "-vcodec",
                "mjpeg",
                "pipe:1",
            ]
        );
    }

    #[test]
    fn still_args_frame_zero_is_zero_seconds() {
        let args = still_ffmpeg_args("a.mov", 0, 24.0);
        let ss = args.iter().position(|a| a == "-ss").expect("-ss");
        assert_eq!(args[ss + 1], "0");
    }

    #[test]
    fn kill_still_child_clears_empty_slot() {
        let mut slot: Option<std::process::Child> = None;
        kill_still_child(&mut slot);
        assert!(slot.is_none());
    }

    #[test]
    #[ignore]
    fn extract_still_spawns_ffmpeg() {
        let slot = std::sync::Mutex::new(None);
        let result = extract_still("ffmpeg", "this-file-does-not-exist.mp4", 0, 24.0, &slot);
        assert!(result.is_err());
        assert!(slot.lock().expect("lock").is_none());
    }

    #[test]
    #[ignore]
    fn extract_sidecar_spawns_ffmpeg() {
        let dir = std::env::temp_dir().join(format!(
            "trimtown_preview_it_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let result = extract_sidecar("ffmpeg", "this-file-does-not-exist.mp4", &dir);
        let _ = std::fs::remove_dir_all(&dir);
        assert!(matches!(result, Ok(None)));
    }
}
