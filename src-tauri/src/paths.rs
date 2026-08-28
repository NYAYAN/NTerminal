//! Veri dizini çözümlemesi.
//!
//! Öncelik sırası:
//!   1. `NTERMINAL_DATA_DIR` ortam değişkeni
//!   2. exe'nin yanındaki `nterminal-data/` klasörü (taşınabilir / USB kullanımı)
//!   3. `%APPDATA%\NTerminal`
//!
//! 2. madde bilinçli: kullanıcı ayarlarını iki makine arasında taşıyabilsin diye
//! uygulamayı klasörüyle birlikte kopyalamak yeterli olsun istiyoruz.

use std::path::{Path, PathBuf};

pub const PORTABLE_MARKER: &str = "nterminal-data";

#[derive(Debug, Clone)]
pub struct DataPaths {
    pub root: PathBuf,
    pub portable: bool,
}

impl DataPaths {
    pub fn resolve() -> Self {
        if let Some(dir) = std::env::var_os("NTERMINAL_DATA_DIR") {
            let root = PathBuf::from(dir);
            return Self { root, portable: true };
        }

        if let Some(exe_dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
            let candidate = exe_dir.join(PORTABLE_MARKER);
            if candidate.is_dir() {
                return Self { root: candidate, portable: true };
            }
        }

        let root = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("NTerminal");
        Self { root, portable: false }
    }

    pub fn ensure(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.root)?;
        std::fs::create_dir_all(self.scrollback_dir())?;
        Ok(())
    }

    pub fn settings_file(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    pub fn workspace_file(&self) -> PathBuf {
        self.root.join("workspace.json")
    }

    pub fn history_file(&self) -> PathBuf {
        self.root.join("history.jsonl")
    }

    pub fn favorites_file(&self) -> PathBuf {
        self.root.join("favorites.json")
    }

    pub fn scrollback_dir(&self) -> PathBuf {
        self.root.join("scrollback")
    }

    pub fn scrollback_file(&self, tab_id: &str) -> PathBuf {
        self.scrollback_dir().join(format!("{}.ansi", sanitize(tab_id)))
    }

    pub fn integration_dir(&self) -> PathBuf {
        self.root.join("shell-integration")
    }
}

/// Sekme kimliklerini dosya adı olarak kullanmadan önce temizler; kimlikler UUID
/// olsa da içe alınan (import) dosyalardan gelen değerlere güvenmiyoruz.
pub fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .take(120)
        .collect()
}
