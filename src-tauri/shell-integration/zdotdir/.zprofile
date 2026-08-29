# NTerminal - ZDOTDIR koprusu (2/4: yalnizca login kabuklarinda)
#
# macOS'ta bu dosya onemli: PATH'i /etc/paths ve /etc/paths.d uzerinden
# `path_helper` kuruyor ve pek cok kullanici Homebrew'un `shellenv` satirini
# .zprofile'a yaziyor. Atlanirsa "brew kurdum ama komut bulunamiyor" oluyor.

(( $+functions[__nterm_source_user] )) && \
  __nterm_source_user "$NTERMINAL_USER_ZDOTDIR/.zprofile"
