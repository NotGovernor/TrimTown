use std::path::PathBuf;

use crate::models::AppSettings;

const APP_CONFIG_DIR_NAME: &str = "com.trimtown.app";

pub trait Persistence {
    fn load_settings(&self) -> Option<AppSettings>;
    fn save_settings(&self, settings: &AppSettings) -> Result<(), String>;
}

pub struct JsonFileStore {
    config_dir: PathBuf,
}

impl JsonFileStore {
    pub fn new() -> Result<Self, String> {
        let dir = dirs::config_dir()
            .ok_or("Failed to determine config directory")?
            .join(APP_CONFIG_DIR_NAME);
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
        Ok(Self { config_dir: dir })
    }

    pub fn with_dir(config_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
        Ok(Self { config_dir })
    }

    fn settings_path(&self) -> PathBuf {
        self.config_dir.join("settings.json")
    }
}

impl Persistence for JsonFileStore {
    fn load_settings(&self) -> Option<AppSettings> {
        let content = std::fs::read_to_string(self.settings_path()).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn save_settings(&self, settings: &AppSettings) -> Result<(), String> {
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        std::fs::write(self.settings_path(), json)
            .map_err(|e| format!("Failed to write settings: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AppSettings, TrimMode};

    #[test]
    fn json_file_store_round_trips_settings() {
        let temp_dir = std::env::temp_dir().join(format!(
            "trimtown_test_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let store =
            JsonFileStore::with_dir(temp_dir.clone()).expect("store creation should succeed");
        let original = AppSettings {
            ffmpeg_path: "/custom/ffmpeg".to_string(),
            ffprobe_path: "/custom/ffprobe".to_string(),
            trim_mode: TrimMode::Fast,
            cpu_only: true,
            open_when_done: true,
        };

        assert!(
            store.load_settings().is_none(),
            "initial load should be None"
        );

        store.save_settings(&original).expect("save should succeed");
        let loaded = store.load_settings().expect("load should return Some");
        assert_eq!(loaded, original);
        assert_eq!(loaded.trim_mode, TrimMode::Fast);
        assert!(loaded.cpu_only);

        let store2 = JsonFileStore::with_dir(temp_dir.clone())
            .expect("second store creation should succeed");
        let loaded2 = store2
            .load_settings()
            .expect("load from new instance should return Some");
        assert_eq!(loaded2, original);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
