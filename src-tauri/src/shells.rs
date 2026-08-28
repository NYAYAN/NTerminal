//! Makinede kurulu kabuklarin tespiti.
//!
//! Ilk acilista profil listesini doldurmak ve "Ayarlar > Profiller > Tara"
//! dugmesini beslemek icin kullaniliyor. Ayrica ice alinan (import) bir
//! yapilandirmada exe yolu bu makinede yoksa yerine ne konabilecegini
//! bulmakta ise yariyor.

use crate::model::{Profile, ShellKind};
use crate::store::new_id;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var_os(key).map(PathBuf::from)
}

fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| p.is_file()).cloned()
}

/// Windows PowerShell 5.1 - her Windows kurulumunda var.
fn find_windows_powershell() -> Option<PathBuf> {
    let sysroot = env_path("SystemRoot").unwrap_or_else(|| PathBuf::from("C:\\Windows"));
    first_existing(&[
        sysroot.join("System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
        sysroot.join("SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe"),
    ])
}

/// PowerShell 7+ (pwsh). MSI, Store ve winget kurulumlarini kapsar.
fn find_pwsh() -> Option<PathBuf> {
    let pf = env_path("ProgramFiles").unwrap_or_else(|| PathBuf::from("C:\\Program Files"));
    let mut candidates = vec![pf.join("PowerShell\\7\\pwsh.exe")];

    // PowerShell\<surum>\pwsh.exe - 8, 9 ... gelecek surumler icin tara.
    if let Ok(entries) = std::fs::read_dir(pf.join("PowerShell")) {
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort();
        dirs.reverse(); // en yeni surum once
        for dir in dirs {
            candidates.push(dir.join("pwsh.exe"));
        }
    }
    if let Some(local) = env_path("LOCALAPPDATA") {
        candidates.push(local.join("Microsoft\\WindowsApps\\pwsh.exe"));
    }
    first_existing(&candidates)
}

fn find_cmd() -> Option<PathBuf> {
    let sysroot = env_path("SystemRoot").unwrap_or_else(|| PathBuf::from("C:\\Windows"));
    first_existing(&[sysroot.join("System32\\cmd.exe")])
}

/// Git for Windows ile gelen bash.
fn find_git_bash() -> Option<PathBuf> {
    let pf = env_path("ProgramFiles").unwrap_or_else(|| PathBuf::from("C:\\Program Files"));
    let pf86 = env_path("ProgramFiles(x86)")
        .unwrap_or_else(|| PathBuf::from("C:\\Program Files (x86)"));
    let mut candidates = vec![
        pf.join("Git\\bin\\bash.exe"),
        pf86.join("Git\\bin\\bash.exe"),
    ];
    if let Some(local) = env_path("LOCALAPPDATA") {
        candidates.push(local.join("Programs\\Git\\bin\\bash.exe"));
    }
    first_existing(&candidates)
}

fn find_wsl() -> Option<PathBuf> {
    let sysroot = env_path("SystemRoot").unwrap_or_else(|| PathBuf::from("C:\\Windows"));
    first_existing(&[sysroot.join("System32\\wsl.exe")])
}

/// `wsl.exe -l -q` cikisini okur. WSL kurulu degilse veya hic dagitim yoksa
/// bos liste doner; hata durumunda sessizce gecilir.
fn wsl_distros() -> Vec<String> {
    let Some(wsl) = find_wsl() else {
        return Vec::new();
    };
    let output = Command::new(wsl).args(["-l", "-q"]).output();
    let Ok(out) = output else { return Vec::new() };
    if !out.status.success() {
        return Vec::new();
    }
    // wsl.exe cikisini UTF-16LE verir.
    let text = decode_utf16le(&out.stdout);
    text.lines()
        .map(|l| l.trim().trim_end_matches('\0').to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

fn decode_utf16le(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes.iter().skip(1).step_by(2).take(8).all(|b| *b == 0) {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}

fn profile(name: &str, kind: ShellKind, exe: &Path, args: Vec<&str>, color: &str, icon: &str) -> Profile {
    Profile {
        id: new_id("prof"),
        name: name.to_string(),
        kind,
        shell: exe.to_string_lossy().to_string(),
        args: args.into_iter().map(String::from).collect(),
        cwd: None,
        env: BTreeMap::new(),
        shell_integration: kind.supports_integration(),
        color: Some(color.to_string()),
        icon: Some(icon.to_string()),
        unavailable: false,
    }
}

/// Kurulu kabuklardan profil listesi uretir. Sira onemli: ilk eleman
/// varsayilan profil olur.
pub fn detect_profiles() -> Vec<Profile> {
    let mut out = Vec::new();

    if let Some(exe) = find_pwsh() {
        out.push(profile("PowerShell 7", ShellKind::Pwsh, &exe, vec![], "#2f6fba", "powershell"));
    }
    if let Some(exe) = find_windows_powershell() {
        out.push(profile(
            "Windows PowerShell",
            ShellKind::PowerShell,
            &exe,
            vec![],
            "#0e4d92",
            "powershell",
        ));
    }
    if let Some(exe) = find_cmd() {
        out.push(profile("Komut Istemi", ShellKind::Cmd, &exe, vec![], "#6b7280", "cmd"));
    }
    if let Some(exe) = find_git_bash() {
        out.push(profile("Git Bash", ShellKind::Bash, &exe, vec!["--login", "-i"], "#c9603a", "bash"));
    }
    if let Some(wsl) = find_wsl() {
        for distro in wsl_distros() {
            let mut p = profile(
                &format!("WSL: {distro}"),
                ShellKind::Wsl,
                &wsl,
                vec!["-d"],
                "#7a3e9d",
                "linux",
            );
            p.args.push(distro);
            p.args.push("--cd".into());
            p.args.push("~".into());
            out.push(p);
        }
    }

    // Hicbir sey bulunamadiysa (cok olasi degil) en azindan cmd yaz.
    if out.is_empty() {
        out.push(Profile {
            id: new_id("prof"),
            name: "Komut Istemi".into(),
            kind: ShellKind::Cmd,
            shell: "cmd.exe".into(),
            args: vec![],
            cwd: None,
            env: BTreeMap::new(),
            shell_integration: true,
            color: Some("#6b7280".into()),
            icon: Some("cmd".into()),
            unavailable: false,
        });
    }
    out
}

/// Verilen exe yolunun bu makinede calistirilabilir olup olmadigini soyler.
/// Mutlak yol degilse PATH uzerinde arar.
pub fn executable_available(exe: &str) -> bool {
    let trimmed = exe.trim();
    if trimmed.is_empty() {
        return false;
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return path.is_file();
    }
    if let Some(paths) = std::env::var_os("PATH") {
        let exts: Vec<String> = std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into())
            .split(';')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        for dir in std::env::split_paths(&paths) {
            let direct = dir.join(trimmed);
            if direct.is_file() {
                return true;
            }
            for ext in &exts {
                if direct.with_extension(ext.trim_start_matches('.')).is_file() {
                    return true;
                }
            }
        }
    }
    false
}
