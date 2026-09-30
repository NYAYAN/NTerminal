//! Komut gecmisi deposu.
//!
//! Tasarim: bellekte tam liste + diskte append-only JSONL gunlugu.
//!
//! Neden SQLite degil: kayit sayisi on binler mertebesinde kaliyor, tam liste
//! bellekte rahat duruyor ve arama JS tarafinda degil burada, tek gecisle
//! yapiliyor. Ayrica gecmis dosyasinin duz JSON olmasi disa/ice aktarmayi
//! (export/import) bedava hale getiriyor ve native bir bagimlilik eklemiyor.
//!
//! Her komut icin iki kayit yazilir: baslarken `add`, bitince `fin`. Boylece
//! her komut sonunda butun dosyayi yeniden yazmak gerekmiyor. Gunluk sisince
//! sikistirilir (compact).

use crate::model::{HistoryEntry, HistoryRecord};
use crate::paths::DataPaths;
use crate::store::{new_id, now_ms, write_atomic};
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};

/// Gunluk, canli kayit sayisinin bu katina ulasinca sikistirilir.
const COMPACT_RATIO: usize = 3;
const COMPACT_MIN_LINES: usize = 2_000;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFilter {
    /// Sadece bu sekmenin kayitlari.
    #[serde(default)]
    pub tab_id: Option<String>,
    /// Sadece bu grubun kayitlari.
    #[serde(default)]
    pub group_id: Option<String>,
    /// Serbest metin aramasi; komut ve dizin alanlarinda gecer.
    #[serde(default)]
    pub query: Option<String>,
    /// Yalnizca komutu TAM OLARAK bu olan kayitlar (buyuk/kucuk harf dahil).
    ///
    /// `query`den ayri cunku sorusu baska: o "icinde gecen", bu "tam bu komut".
    /// Oneri panelinden bir komutu silerken `query` kullanmak `ls` icin
    /// `false`, `tools/...` ve dizininde `ls` gecen her kaydi getirirdi.
    #[serde(default)]
    pub command: Option<String>,
    /// true: sadece basarili (exit 0), false: sadece hatali, None: hepsi.
    #[serde(default)]
    pub only_succeeded: Option<bool>,
    /// Ayni komutu tek satirda topla (en yeni kayit temsil eder).
    #[serde(default)]
    pub dedupe: bool,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub entries: Vec<HistoryEntry>,
    /// Filtreye uyan toplam kayit (sayfalamadan once).
    pub total: usize,
    /// Depodaki tum kayit sayisi.
    pub grand_total: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStats {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub running: usize,
    pub file_bytes: u64,
    pub oldest_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewHistoryEntry {
    pub command: String,
    #[serde(default)]
    pub tab_id: String,
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub profile_id: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

pub struct HistoryStore {
    inner: Mutex<Inner>,
}

struct Inner {
    paths: DataPaths,
    entries: Vec<HistoryEntry>,
    /// id -> entries icindeki indeks.
    index: HashMap<String, usize>,
    /// Diskteki gunluk satir sayisi; sikistirma karari icin.
    log_lines: usize,
    limit: usize,
}

impl HistoryStore {
    pub fn load(paths: DataPaths, limit: u32) -> Self {
        let mut inner = Inner {
            paths,
            entries: Vec::new(),
            index: HashMap::new(),
            log_lines: 0,
            limit: limit.max(100) as usize,
        };
        inner.replay_log();
        Self { inner: Mutex::new(inner) }
    }

    pub fn set_limit(&self, limit: u32) {
        let mut inner = self.inner.lock();
        inner.limit = limit.max(100) as usize;
        inner.enforce_limit();
    }

    /// Komut basladi. Donen id, `finish` icin gerekli.
    pub fn add(&self, req: NewHistoryEntry) -> Result<HistoryEntry> {
        let mut inner = self.inner.lock();
        let entry = HistoryEntry {
            id: new_id("h"),
            command: req.command.trim().to_string(),
            tab_id: req.tab_id,
            group_id: req.group_id,
            profile_id: req.profile_id,
            cwd: req.cwd,
            started_at: now_ms(),
            duration_ms: None,
            exit_code: None,
            source: req.source.unwrap_or_else(|| "integration".into()),
        };
        inner.append(&HistoryRecord::Add(entry.clone()))?;
        let slot = inner.entries.len();
        inner.index.insert(entry.id.clone(), slot);
        inner.entries.push(entry.clone());
        inner.enforce_limit();
        inner.maybe_compact()?;
        Ok(entry)
    }

    /// Komut bitti: cikis kodu ve suresi islenir.
    pub fn finish(&self, id: &str, exit_code: Option<i32>, duration_ms: Option<u64>) -> Result<()> {
        let mut inner = self.inner.lock();
        let Some(&idx) = inner.index.get(id) else {
            return Ok(()); // gecmiste yok (temizlenmis olabilir) - sessizce gec
        };
        let duration = duration_ms.or_else(|| {
            let started = inner.entries[idx].started_at;
            let delta = now_ms() - started;
            if delta >= 0 { Some(delta as u64) } else { None }
        });
        {
            let e = &mut inner.entries[idx];
            e.exit_code = exit_code;
            e.duration_ms = duration;
        }
        inner.append(&HistoryRecord::Fin {
            id: id.to_string(),
            exit_code,
            duration_ms: duration,
        })?;
        Ok(())
    }

    pub fn query(&self, filter: &HistoryFilter) -> HistoryPage {
        let inner = self.inner.lock();
        let grand_total = inner.entries.len();
        let needle = filter
            .query
            .as_deref()
            .map(|q| q.trim().to_lowercase())
            .filter(|q| !q.is_empty());
        let exact = filter
            .command
            .as_deref()
            .map(str::trim)
            .filter(|c| !c.is_empty());

        // En yeniden eskiye dogru dolas.
        let mut matched: Vec<&HistoryEntry> = Vec::new();
        let mut seen_commands: std::collections::HashSet<&str> = Default::default();
        for entry in inner.entries.iter().rev() {
            if let Some(tab) = &filter.tab_id {
                if &entry.tab_id != tab {
                    continue;
                }
            }
            if let Some(group) = &filter.group_id {
                if &entry.group_id != group {
                    continue;
                }
            }
            if let Some(command) = exact {
                if entry.command.trim() != command {
                    continue;
                }
            }
            if let Some(ok) = filter.only_succeeded {
                match entry.exit_code {
                    Some(0) if !ok => continue,
                    Some(code) if code != 0 && ok => continue,
                    None => continue, // henuz bitmemis komutlar filtreye takilir
                    _ => {}
                }
            }
            if let Some(q) = &needle {
                let hit = entry.command.to_lowercase().contains(q)
                    || entry
                        .cwd
                        .as_deref()
                        .map(|c| c.to_lowercase().contains(q))
                        .unwrap_or(false);
                if !hit {
                    continue;
                }
            }
            if filter.dedupe && !seen_commands.insert(entry.command.as_str()) {
                continue;
            }
            matched.push(entry);
        }

        let total = matched.len();
        let offset = filter.offset.unwrap_or(0).min(total);
        let limit = filter.limit.unwrap_or(500);
        let entries = matched
            .into_iter()
            .skip(offset)
            .take(limit)
            .cloned()
            .collect();

        HistoryPage { entries, total, grand_total }
    }

    pub fn delete(&self, ids: &[String]) -> Result<usize> {
        let mut inner = self.inner.lock();
        let set: std::collections::HashSet<&String> = ids.iter().collect();
        let before = inner.entries.len();
        inner.entries.retain(|e| !set.contains(&e.id));
        let removed = before - inner.entries.len();
        if removed > 0 {
            inner.reindex();
            inner.append(&HistoryRecord::Del { ids: ids.to_vec() })?;
            // Gunluk HEMEN sikistiriliyor, sisince degil. `del` satiri kaydi
            // yalnizca yeniden oynatirken gizliyor; komutun metni eski `add`
            // satirinda diskte durmaya devam ediyordu. Kullanici "sil" dediyse
            // verinin diskte kalmasini beklemiyor - gecmisten tek tek silinen
            // komut cogu zaman yanlislikla yazilmis bir parola ya da anahtar.
            // `del` once yaziliyor: sikistirma duserse silme yine kalici.
            inner.compact()?;
        }
        Ok(removed)
    }

    /// Filtreye uyan tum kayitlari siler. Bos filtre = tum gecmisi temizle.
    pub fn clear(&self, filter: &HistoryFilter) -> Result<usize> {
        let ids: Vec<String> = {
            let page = self.query(&HistoryFilter {
                tab_id: filter.tab_id.clone(),
                group_id: filter.group_id.clone(),
                query: filter.query.clone(),
                command: filter.command.clone(),
                only_succeeded: filter.only_succeeded,
                dedupe: false,
                limit: Some(usize::MAX),
                offset: None,
            });
            page.entries.into_iter().map(|e| e.id).collect()
        };
        if ids.is_empty() {
            return Ok(0);
        }
        // Gunlugu `delete` sikistiriyor.
        self.delete(&ids)
    }

    pub fn stats(&self) -> HistoryStats {
        let inner = self.inner.lock();
        let mut succeeded = 0;
        let mut failed = 0;
        let mut running = 0;
        for e in &inner.entries {
            match e.exit_code {
                Some(0) => succeeded += 1,
                Some(_) => failed += 1,
                None => running += 1,
            }
        }
        HistoryStats {
            total: inner.entries.len(),
            succeeded,
            failed,
            running,
            file_bytes: std::fs::metadata(inner.paths.history_file())
                .map(|m| m.len())
                .unwrap_or(0),
            oldest_at: inner.entries.first().map(|e| e.started_at),
        }
    }

    /// Disa aktarma icin tam liste.
    pub fn snapshot(&self) -> Vec<HistoryEntry> {
        self.inner.lock().entries.clone()
    }

    /// Ice alma: gelen kayitlari mevcut listeye ekler. `replace` true ise
    /// once mevcut gecmis silinir. Ayni id yeniden gelirse atlanir.
    pub fn ingest(&self, incoming: Vec<HistoryEntry>, replace: bool) -> Result<usize> {
        let mut inner = self.inner.lock();
        if replace {
            inner.entries.clear();
            inner.index.clear();
        }
        let mut added = 0;
        for entry in incoming {
            if inner.index.contains_key(&entry.id) {
                continue;
            }
            let slot = inner.entries.len();
            inner.index.insert(entry.id.clone(), slot);
            inner.entries.push(entry);
            added += 1;
        }
        // Zaman sirasini koru; ice alinan kayitlar araya girebilir.
        inner.entries.sort_by_key(|e| e.started_at);
        inner.reindex();
        inner.enforce_limit();
        inner.compact()?;
        Ok(added)
    }
}

impl Inner {
    fn replay_log(&mut self) {
        let file = self.paths.history_file();
        let Ok(handle) = std::fs::File::open(&file) else {
            return;
        };
        let reader = BufReader::new(handle);
        let mut lines = 0usize;
        for line in reader.lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            lines += 1;
            match serde_json::from_str::<HistoryRecord>(&line) {
                Ok(HistoryRecord::Add(entry)) => {
                    if self.index.contains_key(&entry.id) {
                        continue;
                    }
                    self.index.insert(entry.id.clone(), self.entries.len());
                    self.entries.push(entry);
                }
                Ok(HistoryRecord::Fin { id, exit_code, duration_ms }) => {
                    if let Some(&idx) = self.index.get(&id) {
                        let e = &mut self.entries[idx];
                        e.exit_code = exit_code;
                        e.duration_ms = duration_ms;
                    }
                }
                Ok(HistoryRecord::Del { ids }) => {
                    let set: std::collections::HashSet<String> = ids.into_iter().collect();
                    self.entries.retain(|e| !set.contains(&e.id));
                    self.reindex();
                }
                Err(_) => {
                    // Yarim yazilmis son satir olabilir; gormezden gel.
                }
            }
        }
        self.log_lines = lines;
        self.enforce_limit();
    }

    fn reindex(&mut self) {
        self.index.clear();
        for (i, e) in self.entries.iter().enumerate() {
            self.index.insert(e.id.clone(), i);
        }
    }

    fn enforce_limit(&mut self) {
        if self.entries.len() <= self.limit {
            return;
        }
        let excess = self.entries.len() - self.limit;
        self.entries.drain(0..excess);
        self.reindex();
    }

    fn append(&mut self, record: &HistoryRecord) -> Result<()> {
        let file = self.paths.history_file();
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut handle = OpenOptions::new().create(true).append(true).open(&file)?;
        let line = serde_json::to_string(record)?;
        handle.write_all(line.as_bytes())?;
        handle.write_all(b"\n")?;
        self.log_lines += 1;
        Ok(())
    }

    fn maybe_compact(&mut self) -> Result<()> {
        let live = self.entries.len().max(1);
        if self.log_lines > COMPACT_MIN_LINES && self.log_lines > live * COMPACT_RATIO {
            self.compact()?;
        }
        Ok(())
    }

    /// Gunlugu canli kayitlarin tek `add` satirlarina indirger.
    fn compact(&mut self) -> Result<()> {
        let mut buf = String::with_capacity(self.entries.len() * 200);
        for entry in &self.entries {
            buf.push_str(&serde_json::to_string(&HistoryRecord::Add(entry.clone()))?);
            buf.push('\n');
        }
        write_atomic(&self.paths.history_file(), &buf)?;
        self.log_lines = self.entries.len();
        Ok(())
    }
}

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;
