@echo off
rem NTerminal - cmd.exe kabuk entegrasyonu (kismi)
rem
rem cmd.exe'nin PROMPT degiskeni her istemde yeniden degerlendirilir, ama
rem %ERRORLEVEL% gibi degiskenler PROMPT atanirken bir kez cozulur. Bu yuzden
rem cmd icin cikis kodu bildirilemiyor; istem/dizin isaretleri gonderiliyor,
rem komut metni ise uygulamanin tus yakalama yedegiyle toplaniyor.
rem
rem $E = ESC, $P = gecerli dizin, $G = '>'

if defined NTERMINAL_INTEGRATION_LOADED goto :eof
set NTERMINAL_INTEGRATION_LOADED=1

rem Git mesajlari kutuda: GIT_EDITOR yardimci betige (gerekcesi nterminal.zsh,
rem bolum 4b). Git'in bash'i calistiriyor; yol ileri egik cizgiyle. Yalnizca
rem ayar aciksa ve kullanici kendisi ayarlamadiysa; ust NTerminal sekmesinden
rem miras kalan deger siliniyor.
if defined GIT_EDITOR if not "%GIT_EDITOR:nterminal-edit.sh=%"=="%GIT_EDITOR%" set "GIT_EDITOR="
set "NTERM_EDIT=%~dp0nterminal-edit.sh"
if not defined GIT_EDITOR if "%NTERMINAL_GIT_EDITOR%"=="1" if exist "%NTERM_EDIT%" set "GIT_EDITOR=bash '%NTERM_EDIT:\=/%'"
set "NTERM_EDIT="

prompt $E]133;D$E\$E]633;P;Cwd=$P$E\$E]7;file:///$P$E\$E]133;A$E\$P$G$E]133;B$E\
