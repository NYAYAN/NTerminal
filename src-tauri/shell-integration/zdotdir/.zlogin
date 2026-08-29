# NTerminal - ZDOTDIR koprusu (4/4: yalnizca login kabuklarinda, en son)
#
# Etkilesimli bir login kabugunda buraya HIC gelinmiyor: .zshrc ZDOTDIR'i
# kullaniciya geri verdigi icin zsh onun .zlogin'ini dogrudan aciyor.
#
# Bu dosya etkilesimli OLMAYAN login kabuklari icin var (`zsh -l -c ...`):
# orada .zshrc okunmuyor, dolayisiyla ZDOTDIR hala bizde ve kullanicinin
# .zlogin'i bu kopru olmadan atlanirdi.

(( $+functions[__nterm_source_user] )) && \
  __nterm_source_user "$NTERMINAL_USER_ZDOTDIR/.zlogin"

(( $+functions[__nterm_restore_zdotdir] )) && __nterm_restore_zdotdir
