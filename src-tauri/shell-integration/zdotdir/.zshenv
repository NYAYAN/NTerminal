# NTerminal - ZDOTDIR koprusu (1/4: her zaman okunur)
#
# zsh'in `--init-file` karsiligi YOK. Entegrasyonu yuklemenin tek yolu ZDOTDIR'i
# bizim klasorumuze cevirmek. Ama o zaman kullanicinin
# .zshenv / .zprofile / .zshrc / .zlogin dosyalarinin HICBIRI okunmaz: PATH
# kurulmaz, alias'lar gider, tema yuklenmez. Bu dort kopru dosyasi her birini
# kendi sirasinda yukleyip zinciri kurtariyor.
#
# Rust tarafi iki degisken yaziyor:
#   ZDOTDIR            -> bizim klasor (<veri>/shell-integration/zdotdir)
#   NTERMINAL_ZDOTDIR  -> kullanicinin gercek ZDOTDIR'i, yoksa bos ($HOME)

NTERMINAL_OWN_ZDOTDIR=$ZDOTDIR
NTERMINAL_USER_ZDOTDIR=${NTERMINAL_ZDOTDIR:-$HOME}

# Kullanicinin baslangic dosyalarindan birini yukler.
#
# Yuklerken ZDOTDIR gecici olarak kullanicinin klasorune cevriliyor: kendi
# dosyalari `$ZDOTDIR/...` yaziyorsa kendi klasorunu gormeleri gerekiyor.
# Sonrasinda bize geri donuyor, yoksa zincirin kalani okunamaz.
__nterm_source_user() {
  local file=$1
  [[ -f $file ]] || return 0
  ZDOTDIR=$NTERMINAL_USER_ZDOTDIR
  source "$file"
  # Kullanicinin dosyasi ZDOTDIR'i kendisi degistirdiyse (nadir ama olur)
  # bundan sonraki dosyalari ORADAN yuklemeliyiz.
  if [[ $ZDOTDIR != $NTERMINAL_USER_ZDOTDIR ]]; then
    NTERMINAL_USER_ZDOTDIR=$ZDOTDIR
  fi
  ZDOTDIR=$NTERMINAL_OWN_ZDOTDIR
  return 0
}

# ZDOTDIR'i kullaniciya geri verir.
#
# Neden sart: ZDOTDIR bizim klasoru gosterirken kalirsa, kullanicinin
# .zshrc'sine satir ekleyen bir kurulum betigi (nvm, conda, rustup) BIZIM
# klasorumuze yazar - ve biz o klasoru her acilista uzerine yaziyoruz. Yaptigi
# ayar sessizce kaybolur.
#
# Bedeli: terminalde elle `zsh` yazip ic ice kabuk acildiginda entegrasyon o
# kabukta calismaz. Bilincli takas - veri kaybi riskinden iyidir.
__nterm_restore_zdotdir() {
  if [[ -n $NTERMINAL_ZDOTDIR ]]; then
    ZDOTDIR=$NTERMINAL_ZDOTDIR
  else
    unset ZDOTDIR
  fi
  return 0
}

__nterm_source_user "$NTERMINAL_USER_ZDOTDIR/.zshenv"
