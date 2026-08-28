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

prompt $E]133;D$E\$E]633;P;Cwd=$P$E\$E]7;file:///$P$E\$E]133;A$E\$P$G$E]133;B$E\
