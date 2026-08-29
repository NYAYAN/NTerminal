//! Makinede kurulu kabuklarin tespiti.
//!
//! Ilk acilista profil listesini doldurmak ve "Ayarlar > Profiller > Tara"
//! dugmesini beslemek icin kullaniliyor. Ayrica ice alinan (import) bir
//! yapilandirmada exe yolu bu makinede yoksa yerine ne konabilecegini
//! bulmakta ise yariyor.
//!
//! Platform basina bir modul: aranan yerler ve "calistirilabilir mi" sorusunun
//! cevabi taban taban farkli. Windows PATHEXT ile uzanti deniyor, POSIX izin
//! bitine bakiyor; ikisini tek fonksiyonda birlestirmek her iki tarafi da
//! yanlis yapar.

use crate::model::{Profile, ShellKind};
use crate::store::new_id;
use std::collections::BTreeMap;
use std::path::Path;

#[cfg(windows)]
pub use win::{detect_profiles, executable_available};

#[cfg(unix)]
pub use nix::{detect_profiles, executable_available};

/// Profil govdesi - platformdan bagimsiz.
fn profile(
    name: &str,
    kind: ShellKind,
    exe: &Path,
    args: Vec<&str>,
    color: &str,
    icon: &str,
) -> Profile {
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

// ============================================================ Windows

#[cfg(windows)]
mod win {
    use super::{profile, Profile, ShellKind};
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
}

// ============================================================ macOS / POSIX

#[cfg(unix)]
mod nix {
    use super::{profile, Profile, ShellKind};
    use crate::store::new_id;
    use std::collections::BTreeMap;
    use std::path::{Path, PathBuf};

    /// Homebrew Apple Silicon'da `/opt/homebrew`, Intel'de `/usr/local` kullaniyor;
    /// ikisi de denenmeli. Sira onemli: Homebrew surumu sistemdekinden yeni.
    const BREW_PREFIXES: [&str; 2] = ["/opt/homebrew", "/usr/local"];

    fn is_executable(path: &Path) -> bool {
        use std::os::unix::fs::PermissionsExt;
        let Ok(meta) = std::fs::metadata(path) else {
            return false;
        };
        // Dizin de "izin biti acik" gorunebilir; dosya olmasi sart.
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }

    /// Kabuk aranan dizinler. Sira onemli: Homebrew surumu sistemdekinden yeni
    /// oldugu icin once geliyor (mac'in sistem bash'i 3.2, Homebrew 5.x).
    const SHELL_DIRS: [&str; 4] = ["/opt/homebrew/bin", "/usr/local/bin", "/bin", "/usr/bin"];

    /// Aradigimiz kabuklar - tercih sirasiyla.
    ///
    /// `sh` bilincli olarak yok: mac'te `/bin/sh` zaten POSIX kipinde bash ve
    /// listeye girseydi ikinci bir "Bash" satiri olarak gorunurdu. Kaybimiz yok,
    /// `/bin/bash` her mac'te var.
    const SHELL_NAMES: [&str; 3] = ["zsh", "bash", "fish"];

    /// PowerShell 7 mac'te Homebrew cask ya da .pkg ile kuruluyor.
    fn find_pwsh() -> Option<PathBuf> {
        let mut candidates: Vec<PathBuf> = BREW_PREFIXES
            .iter()
            .map(|prefix| PathBuf::from(format!("{prefix}/bin/pwsh")))
            .collect();
        // .pkg kurulumu buraya aciyor, symlink her zaman olusmuyor.
        candidates.push(PathBuf::from("/usr/local/microsoft/powershell/7/pwsh"));
        candidates.into_iter().find(|p| is_executable(p))
    }

    /// `/etc/shells` - sistemin gecerli login kabuklari listesi. Kullanicinin
    /// Homebrew ile kurup `chsh` ile kaydettigi kabuklar burada gorunur, bizim
    /// sabit listemizde gorunmeyebilir.
    fn etc_shells() -> Vec<PathBuf> {
        let Ok(text) = std::fs::read_to_string("/etc/shells") else {
            return Vec::new();
        };
        text.lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .map(PathBuf::from)
            .filter(|p| is_executable(p))
            .collect()
    }

    /// Yol adindan kabuk turunu cikarir.
    fn kind_of(path: &Path) -> ShellKind {
        match path.file_name().and_then(|n| n.to_str()).unwrap_or("") {
            "zsh" => ShellKind::Zsh,
            "bash" | "sh" => ShellKind::Bash,
            "fish" => ShellKind::Fish,
            "pwsh" => ShellKind::Pwsh,
            _ => ShellKind::Custom,
        }
    }

    fn style(kind: ShellKind) -> (&'static str, &'static str) {
        match kind {
            ShellKind::Zsh => ("#4d9375", "zsh"),
            ShellKind::Bash => ("#c9603a", "bash"),
            ShellKind::Fish => ("#3d8fd1", "fish"),
            ShellKind::Pwsh => ("#2f6fba", "powershell"),
            _ => ("#6b7280", "shell"),
        }
    }

    /// Gorunen ad: "zsh" degil "Zsh", ayrica Homebrew surumu ayirt edilebilsin.
    fn display_name(path: &Path, kind: ShellKind) -> String {
        let base = match kind {
            ShellKind::Zsh => "Zsh",
            ShellKind::Bash => "Bash",
            ShellKind::Fish => "Fish",
            ShellKind::Pwsh => "PowerShell 7",
            _ => return path.to_string_lossy().to_string(),
        };
        let text = path.to_string_lossy();
        // Ayni kabugun iki surumu listede yan yana durabiliyor (sistem bash 3.2
        // ile Homebrew bash 5.x gibi); hangisi oldugu ad'dan anlasilmali.
        if BREW_PREFIXES.iter().any(|p| text.starts_with(p)) && kind != ShellKind::Pwsh {
            format!("{base} (Homebrew)")
        } else {
            base.to_string()
        }
    }

    /// Etkilesimli kabuk icin baslatma argumanlari.
    fn default_args(kind: ShellKind) -> Vec<&'static str> {
        match kind {
            // -l: login kabugu. mac'te SART - PATH'i /etc/paths ve
            // /etc/paths.d uzerinden path_helper kuruyor, login olmayan bir
            // kabukta Homebrew binleri PATH'te olmuyor ve kullanici "brew
            // yuklu ama bulunamiyor" ile karsilasiyor.
            ShellKind::Zsh | ShellKind::Bash => vec!["-l"],
            ShellKind::Fish => vec!["-l"],
            _ => vec![],
        }
    }

    /// Profili listeye ekler - yinelenenleri ve tanimadigimiz kabuklari atlar.
    fn push(out: &mut Vec<Profile>, seen: &mut Vec<PathBuf>, path: PathBuf) {
        if seen.iter().any(|s| s == &path) {
            return;
        }
        let kind = kind_of(&path);
        if kind == ShellKind::Custom {
            // Tanimadigimiz bir kabuga entegrasyon uyduramayiz; profil olarak
            // eklemek "acildi ama yarim calisiyor" demek olur. Kullanici elle
            // Custom profil tanimlayabilir.
            return;
        }
        let (color, icon) = style(kind);
        seen.push(path.clone());
        out.push(profile(
            &display_name(&path, kind),
            kind,
            &path,
            default_args(kind),
            color,
            icon,
        ));
    }

    /// Kurulu kabuklardan profil listesi uretir. Sira onemli: ilk eleman
    /// varsayilan profil olur.
    ///
    /// Ilk sirada kullanicinin GERCEK login kabugu (`$SHELL`) geliyor. Sabit bir
    /// tercih listesi yazmak yerine bunu okumak dogru olan: bash'e gecmis bir
    /// kullaniciya zsh acmak, ayarladigi her seyi gormezden gelmek olur.
    pub fn detect_profiles() -> Vec<Profile> {
        let mut out: Vec<Profile> = Vec::new();
        let mut seen: Vec<PathBuf> = Vec::new();

        // 1) Kullanicinin login kabugu.
        if let Some(shell) = std::env::var_os("SHELL").map(PathBuf::from) {
            if is_executable(&shell) {
                push(&mut out, &mut seen, shell);
            }
        }

        // 2) Bilinen kabuklar. Ayni kabugun hem Homebrew hem sistem surumu
        //    varsa IKISI de listeye giriyor; ad'da ayirt ediliyor.
        for name in SHELL_NAMES {
            for dir in SHELL_DIRS {
                let path = PathBuf::from(format!("{dir}/{name}"));
                if is_executable(&path) {
                    push(&mut out, &mut seen, path);
                }
            }
        }
        if let Some(path) = find_pwsh() {
            push(&mut out, &mut seen, path);
        }

        // 3) /etc/shells - yukaridakilerin kacirdigi kurulumlar.
        for path in etc_shells() {
            push(&mut out, &mut seen, path);
        }

        // Hicbir sey bulunamadiysa (neredeyse imkansiz: /bin/sh her POSIX
        // sistemde var) en azindan bir sey yaz.
        if out.is_empty() {
            out.push(Profile {
                id: new_id("prof"),
                name: "Zsh".into(),
                kind: ShellKind::Zsh,
                shell: "/bin/zsh".into(),
                args: vec!["-l".into()],
                cwd: None,
                env: BTreeMap::new(),
                shell_integration: true,
                color: Some("#4d9375".into()),
                icon: Some("zsh".into()),
                unavailable: false,
            });
        }
        out
    }

    /// Verilen yolun calistirilabilir olup olmadigini soyler. Mutlak yol
    /// degilse PATH uzerinde arar.
    ///
    /// Windows'tan farki: uzanti denemesi YOK (PATHEXT POSIX'te yok) ama izin
    /// biti denetimi VAR - `is_file()` tek basina yeterli degil, okunabilir ama
    /// calistirilamaz bir dosya "var" gorunurdu.
    pub fn executable_available(exe: &str) -> bool {
        let trimmed = exe.trim();
        if trimmed.is_empty() {
            return false;
        }
        let path = Path::new(trimmed);
        if path.is_absolute() {
            return is_executable(path);
        }
        // Icinde ayirici varsa (./x, a/b) PATH'te aranmaz - kabugun kurali.
        if trimmed.contains('/') {
            return is_executable(path);
        }
        if let Some(paths) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&paths) {
                if is_executable(&dir.join(trimmed)) {
                    return true;
                }
            }
        }
        false
    }
}
