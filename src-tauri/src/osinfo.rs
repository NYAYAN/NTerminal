//! Windows surum numarasi.
//!
//! Neden gerekli: xterm.js'in ConPTY uyumluluk anahtari `windowsPty`, satir
//! akisi (reflow) davranisini yapi numarasina gore seciyor. Sozlesmesi soyle:
//!
//!   !(backend == 'conpty' && buildNumber >= 21376)  ->  reflow kapali,
//!   ayrica satirin son karakteri bosluk degilse "bu satir kaydirilmis" varsayimi
//!
//! Yapi numarasini bildirmezsek uygulama Windows 11'de bile kalici olarak eski
//! kipte kalir: pencere yeniden boyutlandirildiginda uzun satirlar dogru akmaz
//! ve alakasiz satirlar birlesmis gorunur.
//!
//! `RtlGetVersion` kullaniyoruz: `GetVersionExW` uygulama bildirimi (manifest)
//! olmadan kirpilmis surum dondurur, RtlGetVersion gercek degeri verir. Tek bir
//! FFI bildirimi yeni bir bagimlilik eklemekten ucuz.

#[cfg(windows)]
#[repr(C)]
struct OsVersionInfoW {
    size: u32,
    major: u32,
    minor: u32,
    build: u32,
    platform_id: u32,
    csd_version: [u16; 128],
}

#[cfg(windows)]
#[link(name = "ntdll")]
unsafe extern "system" {
    fn RtlGetVersion(info: *mut OsVersionInfoW) -> i32;
}

/// Windows yapi numarasi (ornek: 26200). Okunamazsa 0.
#[cfg(windows)]
pub fn build_number() -> u32 {
    let mut info = OsVersionInfoW {
        size: std::mem::size_of::<OsVersionInfoW>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform_id: 0,
        csd_version: [0; 128],
    };
    // SAFETY: info gecerli ve boyutu dogru bildirilmis bir OSVERSIONINFOW;
    // RtlGetVersion yalnizca bu yapiyi doldurur ve STATUS_SUCCESS (0) doner.
    let status = unsafe { RtlGetVersion(&mut info) };
    if status == 0 {
        info.build
    } else {
        0
    }
}

#[cfg(not(windows))]
pub fn build_number() -> u32 {
    0
}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(windows)]
    fn yapi_numarasi_makul() {
        let build = super::build_number();
        // Windows 10 1809 (ConPTY'nin geldigi surum) 17763.
        assert!(
            build >= 17763,
            "beklenmeyen yapi numarasi: {build} (ConPTY icin en az 17763 gerekli)"
        );
    }
}
