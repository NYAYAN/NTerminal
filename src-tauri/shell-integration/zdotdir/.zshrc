# NTerminal - ZDOTDIR koprusu (3/4: yalnizca etkilesimli kabuklarda)
#
# Sira burada kritik: KULLANICININ .zshrc'si once, entegrasyon SONRA.
# Tema (oh-my-zsh, powerlevel10k, starship) PS1'i kullanicinin .zshrc'sinde
# kuruyor; entegrasyonu once yuklersek isaretimizin ustune yaziliyor ve komut
# metni hic okunamiyor.

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
