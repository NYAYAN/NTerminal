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
rem
rem `goto` SART, `if defined` yetmiyor: satir calismadan ONCE aciliyor ve
rem tanimsiz degiskende degistirmeli acilim bozuk metne donuyor - CI'da cmd
rem "set was unexpected at this time." deyip betigi yarida kesti, istem
rem isaretleri hic gelmedi. Atlanan satir hic ayristirilmiyor.
if not defined GIT_EDITOR goto nterm_git_editor_bos
if not "%GIT_EDITOR:nterminal-edit.sh=%"=="%GIT_EDITOR%" set "GIT_EDITOR="
:nterm_git_editor_bos
set "NTERM_EDIT=%~dp0nterminal-edit.sh"
if not defined GIT_EDITOR if "%NTERMINAL_GIT_EDITOR%"=="1" if exist "%NTERM_EDIT%" set "GIT_EDITOR=bash '%NTERM_EDIT:\=/%'"
set "NTERM_EDIT="

rem Isaret anahtari (NTERMINAL_NONCE): uygulama yalnizca bu anahtari tasiyan
rem isaretleri kabul ediyor; ciktinin icine gomulu sahte isaretler sayilmiyor
rem (gerekcesi nterminal.zsh, bolum 1). Her dizinin SON alani. `%NTERM_KEY%`
rem bu satir calisirken aciliyor, PROMPT'a metin olarak giriyor; ic ice acilan
rem cmd PROMPT'u oldugu gibi miras aliyor.
set "NTERM_KEY="
if defined NTERMINAL_NONCE set "NTERM_KEY=;%NTERMINAL_NONCE%"
prompt $E]133;D%NTERM_KEY%$E\$E]633;P;Cwd=$P%NTERM_KEY%$E\$E]7;file:///$P%NTERM_KEY%$E\$E]133;A%NTERM_KEY%$E\$P$G$E]133;B%NTERM_KEY%$E\
set "NTERM_KEY="
