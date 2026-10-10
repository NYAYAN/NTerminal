# NTerminal - zsh kabuk entegrasyonu (macOS varsayilan kabugu)
#
# `zdotdir/.zshrc` tarafindan, KULLANICININ kendi .zshrc'sinden SONRA
# yukleniyor. Sira onemli: temanin (oh-my-zsh, powerlevel10k, starship) PS1'i
# kurmasini bekliyoruz, yoksa isaretimizi ustune yaziyorlar.
#
# Bildirilen diziler bash betigiyle birebir ayni - ayristirici tek
# (`src/lib/osc.ts`):
#   OSC 133;A        istem basliyor
#   OSC 133;B        istem bitti, komut girisi burada (PS1'in sonunda)
#   OSC 133;C        komut calismaya basladi
#   OSC 133;D;<kod>  komut bitti, cikis kodu
#   OSC 633;E;<cmd>  calistirilan komut metni (kacisli)
#   OSC 633;P;Cwd=   gecerli dizin
#   OSC 7;file://    gecerli dizin (standart bicim)
#
# zsh'in bash'e gore avantaji: `preexec` kancasi komut satirini DOGRUDAN
# argüman olarak veriyor. bash tarafinda bunun icin DEBUG tuzagi + sentinel
# bayragi gerekiyordu (bkz. nterminal.sh); burada o karmasa yok.

# `${X-}`: kullanici `setopt nounset` actiysa tanimsiz bir
# degiskene erismek betigi yarida keser ve entegrasyon hic yuklenmez (olculdu:
# "parameter not set"). Bu betikteki tanimsiz olabilen erisimler bu bicimde.
if [[ -n ${NTERMINAL_INTEGRATION_LOADED-} ]]; then
  return 0
fi
NTERMINAL_INTEGRATION_LOADED=1

# --- 1) yardimcilar ---------------------------------------------------------

__nterm_osc() { printf '\033]%s\007' "$1" }

# OSC yukunde ';' ayirici oldugu icin kaciyoruz. Arayuz ayni kurali tersine
# uygular (`unescapeOsc`).
#
# Ters egik cizgi bir DEGISKENDEN geliyor ve desen tirnak icinde: zsh'te
# `${v//desen/...}` deseni GLOB olarak yorumluyor, `\` ise glob'da kacis
# karakteri. Tirnaklamak ("$bs") zsh'e "bunu harfi harfine ara" dedirtiyor.
# Duz yazimla (`${v//\\/\\\\}`) bash ve zsh farkli sayida ters egik cizgi
# uretiyor - bu yolla iki kabukta da ayni sonuc cikiyor.
__nterm_escape() {
  local v=$1
  local bs=$'\\'
  # Ters egik cizgi ONCE: sonra ekledigimiz kacislari tekrar kacirmayalim.
  v=${v//"$bs"/"$bs$bs"}
  v=${v//";"/"${bs}x3B"}
  v=${v//$'\n'/"${bs}x0A"}
  v=${v//$'\r'/"${bs}x0D"}
  v=${v//$'\e'/"${bs}x1B"}
  v=${v//$'\a'/"${bs}x07"}
  printf '%s' "$v"
}

__nterm_report_cwd() {
  __nterm_osc "633;P;Cwd=$(__nterm_escape "$PWD")"
  # $HOST zsh'in yerlesik degiskeni (bash'te $HOSTNAME).
  __nterm_osc "7;file://${HOST:-localhost}${PWD}"
}

# --- 2) kancalar ------------------------------------------------------------

__nterm_in_cmd=""

# Enter'a basildiktan sonra, komut calismadan once. $1 = yazildigi haliyle
# komut satiri (bash'in `history 1` numarasinin karsiligi, ondan daha guvenilir:
# HISTCONTROL / setopt HIST_IGNORE_DUPS gecmisi susturdugunda da dolu geliyor).
__nterm_preexec() {
  __nterm_in_cmd=1
  local cmd=$1
  if [[ -n $cmd ]]; then
    __nterm_osc "633;E;$(__nterm_escape "$cmd")"
  fi
  __nterm_osc "133;C"
  return 0
}

# Her istemden once. `precmd_functions` dizisinin BASINDA olmasi sart:
# $? bir sonraki kancaya kadar yasiyor, once baska bir kanca kosarsa okudugumuz
# deger onun cikis kodu olur.
__nterm_precmd() {
  local code=$?

  if [[ -n $__nterm_in_cmd ]]; then
    __nterm_osc "133;D;$code"
    __nterm_in_cmd=""
  else
    # Bos Enter: komut kosmadi, kod bildirmiyoruz.
    __nterm_osc "133;D"
  fi

  __nterm_report_cwd
  __nterm_osc "133;A"
  return 0
}

# Istemin bittigini PS1'in SONUNA isaretliyoruz.
#
# Neden her istemde kontrol ediliyor: powerlevel10k ve starship gibi temalar
# PS1'i her istemde YENIDEN kuruyor. Tek seferlik eklemek o temalarda ilk
# istemden sonra kaybolurdu - komut metni okunamaz, gecmis bos kalirdi.
#
# `%{ %}` zsh'e "bu bolge ekranda yer kaplamiyor" der (bash'teki `\[ \]`).
# Olmazsa satir uzunlugu yanlis hesaplanip imlec kayiyor.
__nterm_ps1_mark() {
  if [[ $PS1 != *'133;B'* ]]; then
    PS1="${PS1}%{"$'\e]133;B\a'"%}"
  fi
  return 0
}

# --- 3) kancalari kur -------------------------------------------------------

typeset -ga precmd_functions preexec_functions

# precmd EN BASTA ($? icin), ps1_mark EN SONDA (tema PS1'i kurduktan sonra).
# `${dizi[(r)deger]}` zsh'in ters indeksi: eleman varsa kendisini doner.
if [[ -z ${precmd_functions[(r)__nterm_precmd]-} ]]; then
  precmd_functions=(__nterm_precmd $precmd_functions __nterm_ps1_mark)
fi
if [[ -z ${preexec_functions[(r)__nterm_preexec]-} ]]; then
  preexec_functions=(__nterm_preexec $preexec_functions)
fi

# --- 3b) renkli varsayilan istem --------------------------------------------
#
# macOS'un zsh varsayilani (`%n@%m %1~ %# `, /etc/zshrc) duz metin: ekran
# gecmisinde bir komutun NEREDE basladigini gozle bulmak zor. Kullanicinin
# bilerek kurdugu istem (oh-my-zsh, starship, kendi PROMPT'u) DEGISMEZ:
# yalnizca isletim sisteminin verdigi varsayilanin AYNISI ise renkleniyor. Bu
# betik kullanicinin .zshrc'sinden SONRA yuklendigi icin o an PS1 zaten
# kullanicinin son hali.
#
# Renkler paletten (`green` = ANSI 2, `blue` = ANSI 4): gercek tonu tema
# belirliyor, yani her temada okunabilir. Kalin + yesil kullanici@makine, kalin
# mavi dizin: Debian/Ubuntu'nun varsayilan renkli istemiyle ayni duzen.
#
# NTERMINAL_PROMPT_COLOR=0 (Ayarlar > Terminal > Renkli istem kapali) ise
# dokunmuyoruz. Degisken yoksa (eski uygulama surumu) renkleniyor.
#
# Renkleri KULLANICI secebiliyor (Ayarlar > Terminal > Istem renkleri): uygulama
# `NTERMINAL_PROMPT_USER_RGB` (kullanici@makine) ve `NTERMINAL_PROMPT_DIR_RGB`
# (dizin) degiskenlerine `R;G;B` yaziyor (bkz. `promptColors.ts`; terminal
# zeminine karsi okunur hale getirilmis). Deger bir KACIS DIZISININ icine
# yazildigi icin kati dogrulaniyor: yalniz rakam, tam iki `;`. Bos ya da bozuk
# bir deger sessizce palet rengine (yesil / mavi) dusuyor; ham SGR `%{ %}` icinde
# cunku zsh'in "bu karakterler ekranda yer kaplamaz" isareti bu.
#
# Degiskenler `${X-}` ile okunuyor: kullanici `setopt nounset` actiysa (.zshrc bu
# betikten ONCE yuklendi) tanimsiz bir degisken betigi yarida keserdi.
#
# Karsilastirma harfi harfine: sag taraf tirnak icinde, glob degil.
__nterm_rgb_ok() {
  case $1 in
    '' | *[!0-9\;]* | \;* | *\; | *\;\;*) return 1 ;;
  esac
  [[ ${1//[^;]/} == ';;' ]]
}
if [[ ${NTERMINAL_PROMPT_COLOR-} != 0 && $PS1 == '%n@%m %1~ %# ' ]]; then
  __nterm_uc='%F{green}' __nterm_uf='%f' __nterm_dc='%F{blue}' __nterm_df='%f'
  if __nterm_rgb_ok "${NTERMINAL_PROMPT_USER_RGB-}"; then
    __nterm_uc=$'%{\e[38;2;'"${NTERMINAL_PROMPT_USER_RGB}"$'m%}'
    __nterm_uf=$'%{\e[39m%}'
  fi
  if __nterm_rgb_ok "${NTERMINAL_PROMPT_DIR_RGB-}"; then
    __nterm_dc=$'%{\e[38;2;'"${NTERMINAL_PROMPT_DIR_RGB}"$'m%}'
    __nterm_df=$'%{\e[39m%}'
  fi
  PS1="%B${__nterm_uc}%n@%m${__nterm_uf}%b %B${__nterm_dc}%1~${__nterm_df}%b %# "
  unset __nterm_uc __nterm_uf __nterm_dc __nterm_df
fi
unfunction __nterm_rgb_ok

# --- 4) komut onerisi -------------------------------------------------------
#
# zsh'te PSReadLine karsiligi `zsh-autosuggestions`. Eklenti uygulamayla
# birlikte GELIYOR, yani kullanicinin hicbir sey kurmasi gerekmiyor.
#
# Onceki davranis eksigi bildirmekle yetiniyordu ve cozumu kullaniciya
# birakiyordu: ipucu `brew install zsh-autosuggestions` diyordu, yani once
# Homebrew kurmak gerekiyordu. Bir ozelligin calismasi icin paket yoneticisi
# kurmasini istemek makul degil.
#
# Sira onemli ve kullanicinin kurulumu ONCE geliyor: kendi surumunu
# yapilandirmis (renk, strateji, tus baglama) biri bizimkine dusmemeli. Bizim
# kopyamiz yalnizca hicbiri yoksa devreye giriyor.
#
# Bu KURULUM DEGIL: dosya yalnizca bu oturumda source ediliyor, kullanicinin
# .zshrc'sine ya da baska terminallerine dokunmuyor.
#
# NTERMINAL_PREDICTION yok ya da 'off' ise HIC dokunmuyoruz: kullanicinin kendi
# .zshrc'sindeki ayar gecerli kalir.
if [[ -z ${NTERMINAL_PREDICTION-} || ${NTERMINAL_PREDICTION-} == "off" ]]; then
  __nterm_osc '633;P;Prediction=off'
else
  __nterm_state=unsupported
  if (( $+functions[_zsh_autosuggest_start] )); then
    # Kullanici kendi .zshrc'sinde zaten yuklemis.
    __nterm_state=inline
  else
    for __nterm_cand in \
      "/opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh" \
      "/usr/local/share/zsh-autosuggestions/zsh-autosuggestions.zsh" \
      "${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh" \
      "$HOME/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh" \
      "${NTERMINAL_OWN_ZDOTDIR:h}/zsh-autosuggestions.zsh"
    do
      if [[ -r $__nterm_cand ]]; then
        source "$__nterm_cand"
        __nterm_state=inline
        break
      fi
    done
    unset __nterm_cand
  fi
  # zsh-autosuggestions yalnizca satir ici (inline) cizim yapiyor; PSReadLine'in
  # ListView karsiligi yok. Liste gorunumunu uygulamanin kendi oneri cubugu
  # zaten veriyor.
  __nterm_osc "633;P;Prediction=$__nterm_state"
  unset __nterm_state
fi

# --- 5) ilk istem -----------------------------------------------------------

# Ilk istem icin dizini hemen bildir: kullanici hicbir komut kosturmadan once
# de durum cubugunda dogru klasor gorunsun.
__nterm_report_cwd
