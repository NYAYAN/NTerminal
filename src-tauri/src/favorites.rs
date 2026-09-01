//! Favori komutlar.
//!
//! Gecmisten ayri bir depo: gecmis otomatik birikiyor ve sinir asilinca en
//! eskiler siliniyor, favoriler ise kullanicinin bilincli olarak sakladigi ve
//! elle sirladigi kayitlar - ikisini ayni yerde tutmak favorilerin gecmis
//! temizliginde kaybolmasi anlamina gelirdi.
//!
//! Dosya kucuk kaldigi icin (onlarca kayit) tek bir JSON dizisi olarak atomik
//! yaziliyor; gecmisteki append-only gunluk karmasikligina gerek yok.

use crate::paths::DataPaths;
use crate::store::{new_id, now_ms, write_atomic};
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    pub id: String,
    /// Calistirilacak komut.
    pub command: String,
    /// Kullanicinin verdigi kisa ad. Bossa komut gosterilir.
    #[serde(default)]
    pub label: Option<String>,
    /// Serbest not: "yalnizca staging'de calistir" gibi.
    #[serde(default)]
    pub note: Option<String>,
    /// Yalnizca bu SEKME grubunda gosterilsin. None = her yerde.
    ///
    /// `folder` ile karistirmayin: bu bir SUZGEC (hangi sekme grubunda
    /// calisirken gorunsun), oteki bir DUZEN (listede hangi baslik altinda).
    #[serde(default)]
    pub group_id: Option<String>,
    /// Favorinin ait oldugu klasor; liste bu baslikla gruplaniyor.
    ///
    /// Serbest metin, ayri bir varlik degil: klasor listesi favorilerden
    /// TURETILIYOR. Boylece klasor olusturmak icin ayri bir ekleme/silme akisi
    /// gerekmiyor - ad yazmak yetiyor, son favori tasininca klasor kendiliginden
    /// kayboluyor. Bos birakilan favoriler "gruplanmamis" basligi altinda.
    #[serde(default)]
    pub folder: Option<String>,
    /// Bu klasorde calistirilsin. None = aktif sekmenin klasoru.
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub used_count: u32,
    #[serde(default)]
    pub last_used_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewFavorite {
    pub command: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub group_id: Option<String>,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
}

/// Duzenlenebilir alanlar. `None` = "dokunma", `Some(None)` = "temizle".
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoritePatch {
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub label: Option<Option<String>>,
    #[serde(default)]
    pub note: Option<Option<String>>,
    #[serde(default)]
    pub group_id: Option<Option<String>>,
    #[serde(default)]
    pub folder: Option<Option<String>>,
    #[serde(default)]
    pub cwd: Option<Option<String>>,
}

fn clean(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub struct FavoriteStore {
    inner: Mutex<Inner>,
}

struct Inner {
    paths: DataPaths,
    /// Sira kullanicinin belirledigi sira; dizinin kendisi bu bilgiyi tutuyor.
    items: Vec<Favorite>,
}

impl FavoriteStore {
    pub fn load(paths: DataPaths) -> Self {
        let items = match std::fs::read_to_string(paths.favorites_file()) {
            Ok(text) => serde_json::from_str::<Vec<Favorite>>(&text).unwrap_or_else(|err| {
                eprintln!("[nterminal] favorites.json okunamadi ({err}); bos baslatiliyor");
                Vec::new()
            }),
            Err(_) => Vec::new(),
        };
        Self {
            inner: Mutex::new(Inner { paths, items }),
        }
    }

    pub fn list(&self) -> Vec<Favorite> {
        self.inner.lock().items.clone()
    }

    pub fn add(&self, req: NewFavorite) -> Result<Favorite> {
        let mut inner = self.inner.lock();
        let command = req.command.trim().to_string();
        if command.is_empty() {
            anyhow::bail!("bos komut favoriye eklenemez");
        }
        // Ayni komut zaten favorideyse tekrar eklemiyoruz; kullanici yildiza
        // iki kez bastiginda liste kirlenmesin.
        if let Some(existing) = inner.items.iter().find(|f| f.command == command) {
            return Ok(existing.clone());
        }
        let favorite = Favorite {
            id: new_id("fav"),
            command,
            label: clean(req.label),
            note: clean(req.note),
            group_id: clean(req.group_id),
            folder: clean(req.folder),
            cwd: clean(req.cwd),
            created_at: now_ms(),
            used_count: 0,
            last_used_at: None,
        };
        inner.items.push(favorite.clone());
        inner.flush()?;
        Ok(favorite)
    }

    pub fn update(&self, id: &str, patch: FavoritePatch) -> Result<Option<Favorite>> {
        let mut inner = self.inner.lock();
        let Some(item) = inner.items.iter_mut().find(|f| f.id == id) else {
            return Ok(None);
        };
        if let Some(command) = patch.command {
            let trimmed = command.trim().to_string();
            if trimmed.is_empty() {
                anyhow::bail!("komut bos birakilamaz");
            }
            item.command = trimmed;
        }
        if let Some(label) = patch.label {
            item.label = clean(label);
        }
        if let Some(note) = patch.note {
            item.note = clean(note);
        }
        if let Some(group_id) = patch.group_id {
            item.group_id = clean(group_id);
        }
        if let Some(folder) = patch.folder {
            item.folder = clean(folder);
        }
        if let Some(cwd) = patch.cwd {
            item.cwd = clean(cwd);
        }
        let updated = item.clone();
        inner.flush()?;
        Ok(Some(updated))
    }

    pub fn remove(&self, ids: &[String]) -> Result<usize> {
        let mut inner = self.inner.lock();
        let before = inner.items.len();
        let set: std::collections::HashSet<&String> = ids.iter().collect();
        inner.items.retain(|f| !set.contains(&f.id));
        let removed = before - inner.items.len();
        if removed > 0 {
            inner.flush()?;
        }
        Ok(removed)
    }

    /// Komuta gore favoriyi kaldirir (gecmisteki yildiza tekrar basmak).
    pub fn remove_by_command(&self, command: &str) -> Result<usize> {
        let target = command.trim();
        let mut inner = self.inner.lock();
        let before = inner.items.len();
        inner.items.retain(|f| f.command != target);
        let removed = before - inner.items.len();
        if removed > 0 {
            inner.flush()?;
        }
        Ok(removed)
    }

    /// Verilen kimlik sirasina gore yeniden dizer. Listede olmayan kimlikler
    /// yok sayilir, sirada gecmeyen kayitlar sona eklenir - boylece arayuzun
    /// eski bir kopyayla gonderdigi sira veri kaybettirmiyor.
    pub fn reorder(&self, ids: &[String]) -> Result<()> {
        let mut inner = self.inner.lock();
        let mut ordered: Vec<Favorite> = Vec::with_capacity(inner.items.len());
        for id in ids {
            if let Some(pos) = inner.items.iter().position(|f| &f.id == id) {
                ordered.push(inner.items.remove(pos));
            }
        }
        ordered.append(&mut inner.items);
        inner.items = ordered;
        inner.flush()
    }

    /// Kullanim sayacini artirir. "En cok kullanilan" siralamasi icin.
    pub fn mark_used(&self, id: &str) -> Result<()> {
        let mut inner = self.inner.lock();
        if let Some(item) = inner.items.iter_mut().find(|f| f.id == id) {
            item.used_count = item.used_count.saturating_add(1);
            item.last_used_at = Some(now_ms());
            inner.flush()?;
        }
        Ok(())
    }

    /// Disa aktarma icin tam liste.
    pub fn snapshot(&self) -> Vec<Favorite> {
        self.inner.lock().items.clone()
    }

    /// Ice alma. `replace` false ise ayni komuta sahip kayitlar atlanir.
    pub fn ingest(&self, incoming: Vec<Favorite>, replace: bool) -> Result<usize> {
        let mut inner = self.inner.lock();
        if replace {
            inner.items.clear();
        }
        let mut added = 0;
        for favorite in incoming {
            let exists = inner
                .items
                .iter()
                .any(|f| f.id == favorite.id || f.command == favorite.command);
            if exists {
                continue;
            }
            inner.items.push(favorite);
            added += 1;
        }
        inner.flush()?;
        Ok(added)
    }
}

impl Inner {
    fn flush(&self) -> Result<()> {
        let text = serde_json::to_string_pretty(&self.items)?;
        write_atomic(&self.paths.favorites_file(), &text)
    }
}

#[cfg(test)]
#[path = "favorites_tests.rs"]
mod tests;
