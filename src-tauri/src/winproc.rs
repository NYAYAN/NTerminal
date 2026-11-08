//! Windows'ta kabugun surec agaci (Toolhelp32).
//!
//! Tam ekran cubugu (`KeyBar`) on plandaki programin adini gosteriyor. Unix'te
//! bunu terminalin on plan grubu veriyor (tcgetpgrp); ConPTY'de o kavram yok.
//! Yerine kabugun torunlarinin EN DERINDEKI aliniyor: `git pull` -> git.exe ->
//! sh.exe -> vim.exe zincirinde vim.
//!
//! Dosya yalnizca standart kitapliga dayaniyor: mac'te Windows hedefine gore
//! tek basina denetlenebilsin (`rustc --target x86_64-pc-windows-msvc`).
//! Uygulamanin tamami orada derlenemiyor - Tauri'nin kaynak derleyicisi
//! (`llvm-rc`) gerekiyor.

/// Kabugun en derin torununun adi (`vim.exe`). Torun yoksa (istem) None.
#[cfg(windows)]
pub fn deepest_descendant(shell: u32) -> Option<String> {
    deepest(&ffi::snapshot()?, shell)
}

/// Konsolun kendi surecleri: ConPTY'nin ana makinesi kabugun cocugu
/// olabiliyor ama ekrani yoneten program degil.
const CONSOLE_HOSTS: [&str; 2] = ["conhost.exe", "openconsole.exe"];

/// Saf kisim: `(pid, ebeveyn, ad)` listesinde kokun en derin torunu.
///
/// Ayni derinlikte birden cok surec varsa buyuk pid; sonuc kararli olmali.
/// Pid'ler yeniden kullanildigi icin ebeveyn zinciri dongu kurabiliyor (olmus
/// bir ebeveynin pid'i baska bir surece verilmis); gezilen pid bir daha
/// gezilmiyor. Konsol ana makinesi ve altindakiler atlaniyor.
pub(crate) fn deepest(procs: &[(u32, u32, String)], root: u32) -> Option<String> {
    let mut seen = std::collections::HashSet::from([root]);
    let mut level = vec![root];
    let mut best: Option<&(u32, u32, String)> = None;
    loop {
        let next: Vec<&(u32, u32, String)> = procs
            .iter()
            .filter(|(pid, parent, name)| {
                level.contains(parent)
                    && !CONSOLE_HOSTS.iter().any(|host| name.eq_ignore_ascii_case(host))
                    && seen.insert(*pid)
            })
            .collect();
        if next.is_empty() {
            break;
        }
        best = next.iter().copied().max_by_key(|(pid, _, _)| *pid);
        level = next.iter().map(|(pid, _, _)| *pid).collect();
    }
    best.map(|(_, _, name)| name.clone())
}

#[cfg(windows)]
mod ffi {
    use std::ffi::c_void;

    type Handle = *mut c_void;

    const TH32CS_SNAPPROCESS: u32 = 0x0000_0002;
    const MAX_PATH: usize = 260;

    /// `PROCESSENTRY32W`.
    #[repr(C)]
    struct ProcessEntry32W {
        dw_size: u32,
        cnt_usage: u32,
        th32_process_id: u32,
        th32_default_heap_id: usize,
        th32_module_id: u32,
        cnt_threads: u32,
        th32_parent_process_id: u32,
        pc_pri_class_base: i32,
        dw_flags: u32,
        sz_exe_file: [u16; MAX_PATH],
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, process_id: u32) -> Handle;
        fn Process32FirstW(snapshot: Handle, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: Handle, entry: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    /// Sistemdeki surecler: (pid, ebeveyn pid, exe adi).
    pub fn snapshot() -> Option<Vec<(u32, u32, String)>> {
        // SAFETY: bayrak gecerli; pid 0 "butun surecler" demek.
        let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        // Hata degeri INVALID_HANDLE_VALUE (-1).
        if snap.is_null() || snap as isize == -1 {
            return None;
        }
        let mut out = Vec::new();
        // SAFETY: duz veri yapisi; sifirlanmis hali gecerli, boyut asagida.
        let mut entry: ProcessEntry32W = unsafe { std::mem::zeroed() };
        entry.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
        // SAFETY: anlik goruntu acik, yapinin boyutu yazili.
        let mut more = unsafe { Process32FirstW(snap, &mut entry) } != 0;
        while more {
            let len = entry.sz_exe_file.iter().position(|&c| c == 0).unwrap_or(MAX_PATH);
            out.push((
                entry.th32_process_id,
                entry.th32_parent_process_id,
                String::from_utf16_lossy(&entry.sz_exe_file[..len]),
            ));
            // SAFETY: yukaridaki gibi.
            more = unsafe { Process32NextW(snap, &mut entry) } != 0;
        }
        // SAFETY: tutamac bizim, bir kez kapatiliyor.
        unsafe { CloseHandle(snap) };
        Some(out)
    }
}

#[cfg(test)]
#[path = "winproc_tests.rs"]
mod tests;
