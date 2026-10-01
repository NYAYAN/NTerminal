# Oturum sonu istegi: Windows Installer'in (Restart Manager) acik uygulamaya
# yaptigi, ya da oturum kapanirken Windows'un. NOTLAR.md bolum 2.6.
#
#   -Mode api    Gercek Restart Manager (RmShutdown). SURUM yapisi gerekir:
#                gelistirme yapisi konsol alt sistemli, RM onu "Console"
#                sayiyor ve pencere iletisi hic gondermiyor.
#   -Mode ileti  RM'nin GUI uygulamaya yaptigini taklit eder: surecin butun ust
#                duzey pencerelerine WM_QUERYENDSESSION, hepsi evet derse
#                WM_ENDSESSION (wParam TRUE, lParam ENDSESSION_CLOSEAPP).
#                Gelistirme yapisinda da calisir.
#
# KAPSAM: yalnizca -Exe yolundaki dosyayi calistiran surec. Kurulu uygulama
# (C:\Program Files\N-Terminal\nterminal.exe) baska bir dosya, kapsam disinda.
# RM listesinde o yoldan baska bir surec gorunurse ya da yolu calistiran surec
# tam bir tane degilse HICBIR SEY gonderilmiyor.
#
# Ornek (yalitilmis ornek acikken, bkz. SKILL.md "Kurulu uygulama acikken"):
#   .\.claude\skills\calistir\oturum-sonu.ps1 -Exe "$PWD\src-tauri\target\debug\nterminal.exe" -Mode ileti
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [ValidateSet("api", "ileti")][string]$Mode = "ileti"
)
$ErrorActionPreference = "Stop"
$Exe = (Resolve-Path $Exe).Path

$procs = @(Get-CimInstance Win32_Process -Filter "Name='nterminal.exe'" | Where-Object { $_.ExecutablePath -eq $Exe })
if ($procs.Count -ne 1) { throw "$Exe yolunu calistiran $($procs.Count) surec var (1 bekleniyordu); hicbir sey gonderilmedi." }
$target = [int]$procs[0].ProcessId

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class NtSessionEnd {
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
    public int ApplicationType; public uint AppStatus; public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] public static extern int RmStartSession(out uint h, int flags, StringBuilder key);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] public static extern int RmRegisterResources(uint h, uint nFiles, string[] files, uint nApps, RM_UNIQUE_PROCESS[] apps, uint nSvc, string[] svc);
  [DllImport("rstrtmgr.dll")] public static extern int RmGetList(uint h, out uint needed, ref uint count, [In, Out] RM_PROCESS_INFO[] apps, ref uint reasons);
  [DllImport("rstrtmgr.dll")] public static extern int RmShutdown(uint h, uint flags, IntPtr status);
  [DllImport("rstrtmgr.dll")] public static extern int RmEndSession(uint h);

  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeoutW(IntPtr h, uint msg, UIntPtr w, IntPtr l, uint flags, uint timeout, out UIntPtr result);
  public static List<IntPtr> Windows(uint target) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid); if (pid == target) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static string ClassOf(IntPtr h) { var c = new StringBuilder(256); GetClassNameW(h, c, 256); return c.ToString(); }
}
"@

if ($Mode -eq "api") {
    $key = New-Object System.Text.StringBuilder 64
    $session = [uint32]0
    if ([NtSessionEnd]::RmStartSession([ref]$session, 0, $key) -ne 0) { throw "RmStartSession basarisiz" }
    try {
        if ([NtSessionEnd]::RmRegisterResources($session, 1, [string[]]@($Exe), 0, $null, 0, $null) -ne 0) { throw "RmRegisterResources basarisiz" }
        $needed = [uint32]0; $count = [uint32]16; $reasons = [uint32]0
        $apps = New-Object 'NtSessionEnd+RM_PROCESS_INFO[]' 16
        if ([NtSessionEnd]::RmGetList($session, [ref]$needed, [ref]$count, $apps, [ref]$reasons) -ne 0) { throw "RmGetList basarisiz" }
        $types = @{ 1 = "MainWindow"; 2 = "OtherWindow"; 3 = "Service"; 4 = "Explorer"; 5 = "Console"; 1000 = "Critical" }
        $listed = if ($count -gt 0) { @($apps[0..([int]$count - 1)]) } else { @() }
        foreach ($a in $listed) { "RM listesi: pid=$($a.Process.dwProcessId) tur=$($types[$a.ApplicationType]) ad='$($a.strAppName)'" }
        $others = @($listed | Where-Object { $_.Process.dwProcessId -ne $target })
        if ($listed.Count -eq 0 -or $others.Count -gt 0) { throw "RM listesinde beklenmeyen surec var; kapatma GONDERILMEDI." }
        if ($listed[0].ApplicationType -eq 5) { throw "RM sureci Console sayiyor (gelistirme yapisi): ileti gondermez. -Mode ileti kullan ya da surum yapisini dene." }
        $t0 = Get-Date
        $rc = [NtSessionEnd]::RmShutdown($session, 0, [IntPtr]::Zero)
        "RmShutdown rc=$rc ($([int]((Get-Date) - $t0).TotalMilliseconds) ms)"
    }
    finally { [void][NtSessionEnd]::RmEndSession($session) }
}
else {
    $WM_QUERYENDSESSION = 0x11; $WM_ENDSESSION = 0x16; $ENDSESSION_CLOSEAPP = 0x1; $SMTO_ABORTIFHUNG = 0x2
    $wins = [NtSessionEnd]::Windows([uint32]$target)
    foreach ($h in $wins) {
        $r = [UIntPtr]::Zero
        $sent = [NtSessionEnd]::SendMessageTimeoutW($h, $WM_QUERYENDSESSION, [UIntPtr]::Zero, [IntPtr]$ENDSESSION_CLOSEAPP, $SMTO_ABORTIFHUNG, 5000, [ref]$r)
        "WM_QUERYENDSESSION -> '$([NtSessionEnd]::ClassOf($h))': $(if ($sent -ne [IntPtr]::Zero) { "yanit $r" } else { 'yanit yok' })"
        if ($sent -eq [IntPtr]::Zero -or $r -eq [UIntPtr]::Zero) { throw "Bir pencere hayir dedi ya da yanit vermedi; WM_ENDSESSION gonderilmedi." }
    }
    foreach ($h in $wins) {
        $r = [UIntPtr]::Zero
        $cls = [NtSessionEnd]::ClassOf($h)
        [void][NtSessionEnd]::SendMessageTimeoutW($h, $WM_ENDSESSION, (New-Object UIntPtr ([uint32]1)), [IntPtr]$ENDSESSION_CLOSEAPP, $SMTO_ABORTIFHUNG, 5000, [ref]$r)
        "WM_ENDSESSION -> '$cls'"
    }
}
Start-Sleep -Seconds 2
$alive = [bool](Get-CimInstance Win32_Process -Filter "ProcessId=$target")
"surec $target $(if ($alive) { 'HALA CALISIYOR' } else { 'cikti' })"
