# NTerminal - ZDOTDIR koprusu (3/4: yalnizca etkilesimli kabuklarda)
#
# Sira burada kritik: KULLANICININ .zshrc'si once, entegrasyon SONRA.
# Tema (oh-my-zsh, powerlevel10k, starship) PS1'i kullanicinin .zshrc'sinde
# kuruyor; entegrasyonu once yuklersek isaretimizin ustune yaziliyor ve komut
# metni hic okunamiyor.

# HISTFILE'i KULLANICININ klasorune tasi.
#
# OLCULEN HATA: uygulamanin zsh sekmelerinde `HISTFILE` kullanicinin
# `~/.zsh_history`'si degil, uygulamanin kendi `shell-integration/zdotdir/`
# klasorundeki bir dosyaya gidiyordu (kurulu uygulamada 266 satir birikmisti,
# gercek gecmis 1012 satirdi). Ctrl+R, yukari ok ve zsh-autosuggestions
# kullanicinin gercek gecmisini gormuyor, digger terminallerdeki komutlar buraya
# gelmiyordu.
#
# ZINCIR: macOS'un `/etc/zshrc`si kullanicinin .zshrc'sinden ONCE kosuyor ve
# `HISTFILE=${ZDOTDIR:-$HOME}/.zsh_history` yaziyor; o an ZDOTDIR bizim
# koprumuzu gosteriyor. Kullanicinin kendi .zshrc'si HISTFILE'i yazarsa zaten
# ustune yaziyor, bu satir yalnizca SISTEMIN verdigini duzeltiyor.
#
# Yalnizca bizim klasorumuzun altindaysa dokunuyoruz: baska bir yere isaret
# eden (kullanicinin .zshenv'inde kurulmus) bir deger oldugu gibi kalir.
if [[ -n $HISTFILE && -n $NTERMINAL_OWN_ZDOTDIR && $HISTFILE == ${NTERMINAL_OWN_ZDOTDIR}/* ]]; then
  HISTFILE=$NTERMINAL_USER_ZDOTDIR/${HISTFILE#${NTERMINAL_OWN_ZDOTDIR}/}
fi

(( $+functions[__nterm_source_user] )) && \
  __nterm_source_user "$NTERMINAL_USER_ZDOTDIR/.zshrc"

# `:h` zsh'in dirname'i. Betik zdotdir'in bir ust klasorunde duruyor.
if [[ -r ${NTERMINAL_OWN_ZDOTDIR:h}/nterminal.zsh ]]; then
  source "${NTERMINAL_OWN_ZDOTDIR:h}/nterminal.zsh"
fi

# ZDOTDIR'i kullaniciya geri ver - gerekcesi .zshenv icinde.
#
# Login kabuklarinda bundan sonra .zlogin okunuyor; ZDOTDIR artik kullanicida
# oldugu icin zsh DOGRUDAN onun .zlogin'ini aciyor ve bizim koprumuz devreye
# girmiyor. Iki kez yuklenme olmuyor, zincir yine tam.
(( $+functions[__nterm_restore_zdotdir] )) && __nterm_restore_zdotdir
