mod binary_discovery;
mod command_ops;
mod encoder_ops;
mod frame_ops;
mod models;
mod path_ops;
mod persistence;
mod preview_ops;
mod probe_ops;
mod settings_ops;
mod trim_ops;

use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use base64::Engine;
use models::{AppSettings, ClipMeta, ProbeError, TrimDonePayload, TrimMode};
use persistence::{JsonFileStore, Persistence};
use probe_ops::clip_meta_from_ffprobe_json;
use settings_ops::verify_ffmpeg_paths as verify_ffmpeg_paths_impl;
use tauri::{Emitter, Manager};

struct PreviewState {
    sidecar: Option<PathBuf>,
    generation_dir: Option<PathBuf>,
}

pub struct AppState {
    settings: Mutex<AppSettings>,
    store: Arc<dyn Persistence + Send + Sync>,
    preview: Mutex<PreviewState>,
    still_child: Mutex<Option<Child>>,
    last_meta: Mutex<Option<ClipMeta>>,
    trim_running: AtomicBool,
    trim_cancelled: AtomicBool,
    trim_completed_ok: AtomicBool,
    trim_child: Mutex<Option<Child>>,
    trim_output: Mutex<Option<PathBuf>>,
}

fn lock_settings(state: &AppState) -> Result<std::sync::MutexGuard<'_, AppSettings>, String> {
    state
        .settings
        .lock()
        .map_err(|e| format!("settings lock poisoned: {e}"))
}

fn lock_preview(state: &AppState) -> Result<std::sync::MutexGuard<'_, PreviewState>, String> {
    state
        .preview
        .lock()
        .map_err(|e| format!("preview lock poisoned: {e}"))
}

fn ffmpeg_bin(state: &AppState) -> Result<String, String> {
    let settings = lock_settings(state)?;
    if settings.ffmpeg_path.is_empty() {
        Ok("ffmpeg".to_string())
    } else {
        Ok(settings.ffmpeg_path.clone())
    }
}

#[tauri::command]
fn ping() -> String {
    "pong".into()
}

#[tauri::command]
fn load_settings(state: tauri::State<AppState>) -> Result<AppSettings, String> {
    let mut settings = lock_settings(&state)?;
    if settings.ffmpeg_path.is_empty() || settings.ffprobe_path.is_empty() {
        let ffmpeg_was_empty = settings.ffmpeg_path.is_empty();
        let ffprobe_was_empty = settings.ffprobe_path.is_empty();
        verify_ffmpeg_paths_impl(&mut settings);
        let discovered = (ffmpeg_was_empty && !settings.ffmpeg_path.is_empty())
            || (ffprobe_was_empty && !settings.ffprobe_path.is_empty());
        if discovered {
            state.store.save_settings(&settings)?;
        }
    }
    Ok(settings.clone())
}

#[tauri::command]
fn save_settings(new_settings: AppSettings, state: tauri::State<AppState>) -> Result<(), String> {
    let mut settings = lock_settings(&state)?;
    *settings = new_settings;
    state.store.save_settings(&settings)
}

#[tauri::command]
fn verify_ffmpeg_paths(state: tauri::State<AppState>) -> Result<(bool, bool), String> {
    let mut settings = lock_settings(&state)?;
    let flags = verify_ffmpeg_paths_impl(&mut settings);
    state.store.save_settings(&settings)?;
    Ok(flags)
}

#[tauri::command]
fn probe_clip(path: String, state: tauri::State<AppState>) -> Result<ClipMeta, String> {
    let ffprobe = {
        let settings = lock_settings(&state)?;
        if settings.ffprobe_path.is_empty() {
            "ffprobe".to_string()
        } else {
            settings.ffprobe_path.clone()
        }
    };

    let output = std::process::Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("ffprobe failed with status {}", output.status)
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    match clip_meta_from_ffprobe_json(&stdout) {
        Ok(mut meta) => {
            meta.path = path;
            {
                let mut last = state
                    .last_meta
                    .lock()
                    .map_err(|e| format!("last_meta lock poisoned: {e}"))?;
                *last = Some(meta.clone());
            }
            Ok(meta)
        }
        Err(ProbeError::NoVideoStream) => Err("No video stream".into()),
        Err(e) => Err(e.to_string()),
    }
}

fn list_available_encoders(ffmpeg: &str) -> Result<std::collections::HashSet<String>, String> {
    let output = std::process::Command::new(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(encoder_ops::parse_encoder_names(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn emit_trim_log(app: &tauri::AppHandle, line: &str) {
    let _ = app.emit("trim-log", line);
}

fn emit_trim_done(app: &tauri::AppHandle, payload: TrimDonePayload) {
    let _ = app.emit("trim-done", payload);
}

fn finish_trim(state: &AppState) {
    // Kill then wait if a live child remains; never drop std::process::Child live.
    let _ = trim_ops::kill_child(&state.trim_child);
    state.trim_running.store(false, Ordering::SeqCst);
    if let Ok(mut out) = state.trim_output.lock() {
        *out = None;
    }
}

#[tauri::command]
fn describe_encoder(state: tauri::State<AppState>) -> Result<String, String> {
    let meta = {
        let last = state
            .last_meta
            .lock()
            .map_err(|e| format!("last_meta lock poisoned: {e}"))?;
        last.clone()
    };
    let Some(meta) = meta else {
        return Ok(String::new());
    };
    let (ffmpeg, cpu_only, mode) = {
        let settings = lock_settings(&state)?;
        let ffmpeg = if settings.ffmpeg_path.is_empty() {
            "ffmpeg".to_string()
        } else {
            settings.ffmpeg_path.clone()
        };
        (ffmpeg, settings.cpu_only, settings.trim_mode)
    };
    if mode == TrimMode::Fast {
        return Ok(encoder_ops::will_use_label(mode, ""));
    }
    let available = list_available_encoders(&ffmpeg)?;
    let choice = encoder_ops::pick_encoder(&meta, cpu_only, &available);
    Ok(encoder_ops::will_use_label(mode, &choice.name))
}

#[tauri::command]
fn output_exists(path: String) -> bool {
    path_ops::output_exists(Path::new(&path))
}

#[tauri::command]
fn trimmed_output_path(path: String) -> String {
    path_ops::trimmed_output_path(Path::new(&path))
        .to_string_lossy()
        .into_owned()
}

#[tauri::command]
fn start_trim(
    path: String,
    in_frame: u64,
    out_frame: u64,
    output_path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    if path_ops::paths_equal(Path::new(&path), Path::new(&output_path)) {
        return Err("Cannot trim a file onto itself".to_string());
    }
    if state.trim_running.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    state.trim_cancelled.store(false, Ordering::SeqCst);
    state.trim_completed_ok.store(false, Ordering::SeqCst);

    let started =
        (|| -> Result<(String, TrimMode, ClipMeta, encoder_ops::EncoderChoice), String> {
            let meta = {
                let last = state
                    .last_meta
                    .lock()
                    .map_err(|e| format!("last_meta lock poisoned: {e}"))?;
                last.clone()
            }
            .ok_or_else(|| "No clip probed".to_string())?;
            let (ffmpeg, cpu_only, mode) = {
                let settings = lock_settings(&state)?;
                let ffmpeg = if settings.ffmpeg_path.is_empty() {
                    "ffmpeg".to_string()
                } else {
                    settings.ffmpeg_path.clone()
                };
                (ffmpeg, settings.cpu_only, settings.trim_mode)
            };
            let available = list_available_encoders(&ffmpeg)?;
            let encoder = encoder_ops::pick_encoder(&meta, cpu_only, &available);
            let out_buf = PathBuf::from(&output_path);
            {
                let mut slot = state
                    .trim_output
                    .lock()
                    .map_err(|e| format!("trim_output lock poisoned: {e}"))?;
                *slot = Some(out_buf);
            }
            Ok((ffmpeg, mode, meta, encoder))
        })();

    let (ffmpeg, mode, meta, encoder) = match started {
        Ok(v) => v,
        Err(e) => {
            finish_trim(&state);
            return Err(e);
        }
    };

    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let cancelled = || state.trim_cancelled.load(Ordering::SeqCst);
        let mut encoder = encoder;
        let mut retried = false;

        let emit_ok = |app: &tauri::AppHandle, output_path: &str| {
            emit_trim_done(
                app,
                TrimDonePayload {
                    ok: true,
                    output_path: output_path.to_string(),
                    error: None,
                },
            );
        };
        let emit_cancelled = |app: &tauri::AppHandle, output_path: &str| {
            trim_ops::delete_output_if_exists(Path::new(output_path));
            emit_trim_log(app, "Cancelled");
            emit_trim_done(
                app,
                TrimDonePayload {
                    ok: false,
                    output_path: output_path.to_string(),
                    error: Some("Cancelled".into()),
                },
            );
        };

        loop {
            if cancelled() {
                if state.trim_completed_ok.load(Ordering::SeqCst) {
                    emit_ok(&app, &output_path);
                } else {
                    emit_cancelled(&app, &output_path);
                }
                finish_trim(&state);
                return;
            }

            let args = command_ops::build_trim_args(
                &path,
                &output_path,
                in_frame,
                out_frame,
                meta.fps,
                mode,
                &encoder,
            );

            let mut child = match trim_ops::spawn_ffmpeg(&ffmpeg, &args) {
                Ok(c) => c,
                Err(e) => {
                    emit_trim_done(
                        &app,
                        TrimDonePayload {
                            ok: false,
                            output_path: output_path.clone(),
                            error: Some(e),
                        },
                    );
                    finish_trim(&state);
                    return;
                }
            };

            if let Some(stderr) = child.stderr.take() {
                let app_log = app.clone();
                std::thread::spawn(move || {
                    trim_ops::read_stderr_lines(stderr, |line| emit_trim_log(&app_log, &line));
                });
            }

            // Store immediately. If cancelled during spawn, kill the new child before drop.
            match trim_ops::store_spawned_child(&state.trim_child, child, cancelled()) {
                Ok(true) => {}
                Ok(false) => {
                    emit_cancelled(&app, &output_path);
                    finish_trim(&state);
                    return;
                }
                Err(e) => {
                    emit_trim_done(
                        &app,
                        TrimDonePayload {
                            ok: false,
                            output_path: output_path.clone(),
                            error: Some(e),
                        },
                    );
                    finish_trim(&state);
                    return;
                }
            }

            let status = match trim_ops::wait_child(
                &state.trim_child,
                cancelled,
                &state.trim_completed_ok,
            ) {
                Ok(s) => s,
                Err(e) => {
                    emit_trim_done(
                        &app,
                        TrimDonePayload {
                            ok: false,
                            output_path: output_path.clone(),
                            error: Some(e),
                        },
                    );
                    finish_trim(&state);
                    return;
                }
            };

            if state.trim_completed_ok.load(Ordering::SeqCst) {
                emit_ok(&app, &output_path);
                finish_trim(&state);
                return;
            }

            let Some(status) = status else {
                // Empty slot / killed. Re-check completed_ok: apply_cancel may have
                // reaped a successful exit and set the flag before we observed None.
                if trim_ops::should_delete_incomplete_output(
                    state.trim_completed_ok.load(Ordering::SeqCst),
                ) {
                    emit_cancelled(&app, &output_path);
                } else {
                    emit_ok(&app, &output_path);
                }
                finish_trim(&state);
                return;
            };

            if status.success() {
                emit_ok(&app, &output_path);
                finish_trim(&state);
                return;
            }

            let gpu_fail = mode == TrimMode::Accurate
                && encoder_ops::should_retry_with_software(false, &encoder.name);
            if !retried && gpu_fail {
                retried = true;
                encoder = encoder_ops::software_encoder(&meta);
                emit_trim_log(&app, "Retrying with software encoder");
                continue;
            }

            if trim_ops::should_delete_incomplete_output(false) {
                trim_ops::delete_output_if_exists(Path::new(&output_path));
            }
            emit_trim_done(
                &app,
                TrimDonePayload {
                    ok: false,
                    output_path: output_path.clone(),
                    error: Some(format!("ffmpeg exited with status {status}")),
                },
            );
            finish_trim(&state);
            return;
        }
    });

    Ok(())
}

#[tauri::command]
fn cancel_trim(state: tauri::State<AppState>) -> Result<(), String> {
    if !state.trim_running.load(Ordering::SeqCst) {
        return Ok(());
    }
    let output = match state.trim_output.lock() {
        Ok(g) => g.clone(),
        Err(e) => return Err(format!("trim_output lock poisoned: {e}")),
    };
    trim_ops::apply_cancel(
        &state.trim_cancelled,
        &state.trim_completed_ok,
        &state.trim_child,
        output.as_deref(),
    )
}

#[tauri::command]
fn prepare_preview(path: String, state: tauri::State<AppState>) -> Result<Option<String>, String> {
    let ffmpeg = ffmpeg_bin(&state)?;
    let previous_dir = {
        let mut preview = lock_preview(&state)?;
        preview.sidecar = None;
        preview.generation_dir.take()
    };
    if let Some(dir) = previous_dir {
        preview_ops::cleanup_generation(&dir)?;
    }

    let generation = uuid::Uuid::new_v4().to_string();
    let gen_dir = preview_ops::create_generation_dir(&generation)?;
    let sidecar = preview_ops::extract_sidecar(&ffmpeg, &path, &gen_dir)?;

    {
        let mut preview = lock_preview(&state)?;
        preview.generation_dir = Some(gen_dir);
        preview.sidecar = sidecar.clone();
    }

    Ok(sidecar.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
fn preview_pcm(
    start_sec: f64,
    duration_sec: f64,
    state: tauri::State<AppState>,
) -> Result<Vec<f32>, String> {
    let ffmpeg = ffmpeg_bin(&state)?;
    let sidecar = {
        let preview = lock_preview(&state)?;
        preview.sidecar.clone()
    };
    preview_ops::decode_pcm_grain(&ffmpeg, sidecar.as_deref(), start_sec, duration_sec)
}

#[tauri::command]
fn cleanup_preview(state: tauri::State<AppState>) -> Result<(), String> {
    let dir = {
        let mut preview = lock_preview(&state)?;
        preview.sidecar = None;
        preview.generation_dir.take()
    };
    if let Some(dir) = dir {
        preview_ops::cleanup_generation(&dir)?;
    }
    Ok(())
}

#[tauri::command]
fn get_still(
    path: String,
    frame: u64,
    fps: f64,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let ffmpeg = ffmpeg_bin(&state)?;
    let jpeg = preview_ops::extract_still(&ffmpeg, &path, frame, fps, &state.still_child)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(jpeg))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = JsonFileStore::new().expect("Failed to create JsonFileStore");
    let settings = store.load_settings().unwrap_or(AppSettings {
        ffmpeg_path: String::new(),
        ffprobe_path: String::new(),
        trim_mode: TrimMode::Accurate,
        cpu_only: false,
        open_when_done: true,
    });
    let state = AppState {
        settings: Mutex::new(settings),
        store: Arc::new(store),
        preview: Mutex::new(PreviewState {
            sidecar: None,
            generation_dir: None,
        }),
        still_child: Mutex::new(None),
        last_meta: Mutex::new(None),
        trim_running: AtomicBool::new(false),
        trim_cancelled: AtomicBool::new(false),
        trim_completed_ok: AtomicBool::new(false),
        trim_child: Mutex::new(None),
        trim_output: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            ping,
            load_settings,
            save_settings,
            verify_ffmpeg_paths,
            probe_clip,
            prepare_preview,
            preview_pcm,
            cleanup_preview,
            get_still,
            describe_encoder,
            output_exists,
            trimmed_output_path,
            start_trim,
            cancel_trim,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
                    .map_err(|e| format!("window icon: {e}"))?;
                window.set_icon(icon).map_err(|e| format!("set_icon: {e}"))?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
