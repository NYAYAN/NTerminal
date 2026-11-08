//! Windows'ta on plandaki programi kabugun surec agacindan secme kurali.
//!
//! Saf kisim her platformda sinaniyor; Toolhelp32 cagrisi yalnizca Windows'ta.

use super::*;

fn p(pid: u32, parent: u32, name: &str) -> (u32, u32, String) {
    (pid, parent, name.to_string())
}

#[test]
fn en_derin_torun_seciliyor() {
    // `git pull` birlestirme mesaji icin vim aciyor: git.exe -> sh.exe ->
    // vim.exe. Ekrani yoneten zincirin sonundaki.
    let procs = vec![
        p(1, 0, "nterminal.exe"),
        p(10, 1, "pwsh.exe"),
        p(20, 10, "git.exe"),
        p(30, 20, "sh.exe"),
        p(40, 30, "vim.exe"),
    ];
    assert_eq!(deepest(&procs, 10).as_deref(), Some("vim.exe"));
}

#[test]
fn torun_yoksa_program_yok() {
    // Kabuk istemde: cubuk "Tam ekran program" diyor, bir ad uydurmuyor.
    let procs = vec![p(1, 0, "nterminal.exe"), p(10, 1, "pwsh.exe")];
    assert_eq!(deepest(&procs, 10), None);
}

#[test]
fn konsol_ana_makinesi_ve_alti_atlaniyor() {
    // ConPTY'nin ana makinesi kabugun cocugu olabiliyor ama programi o
    // calistirmiyor; altindaki surec de kabugun isi degil.
    let procs = vec![
        p(10, 1, "cmd.exe"),
        p(11, 10, "OpenConsole.exe"),
        p(12, 11, "derin.exe"),
        p(13, 10, "less.exe"),
    ];
    assert_eq!(deepest(&procs, 10).as_deref(), Some("less.exe"));
}

#[test]
fn ayni_derinlikte_buyuk_pid_kazaniyor() {
    let procs = vec![p(10, 1, "pwsh.exe"), p(20, 10, "a.exe"), p(25, 10, "b.exe")];
    assert_eq!(deepest(&procs, 10).as_deref(), Some("b.exe"));
}

#[test]
fn pid_dongusu_takilmiyor() {
    // Kabugun ebeveyn pid'i olmus bir surecindi ve o pid kabugun cocuguna
    // verildi: 10 -> 40 -> 10 dongusu. Gezilen pid tekrar gezilmemeli.
    let procs = vec![p(10, 40, "pwsh.exe"), p(40, 10, "eski.exe")];
    assert_eq!(deepest(&procs, 10).as_deref(), Some("eski.exe"));
}
