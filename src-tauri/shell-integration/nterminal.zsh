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

if [[ -n $NTERMINAL_INTEGRATION_LOADED ]]; then
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
if [[ -z ${precmd_functions[(r)__nterm_precmd]} ]]; then
  precmd_functions=(__nterm_precmd $precmd_functions __nterm_ps1_mark)
fi
if [[ -z ${preexec_functions[(r)__nterm_preexec]} ]]; then
  preexec_functions=(__nterm_preexec $preexec_functions)
fi

# --- 4) komut onerisi -------------------------------------------------------
#
# zsh'te PSReadLine karsiligi `zsh-autosuggestions`. Kurmuyoruz - kullanicinin
# kabuguna eklenti yuklemek bizim isimiz degil; varsa kullaniyoruz, yoksa
# durumu bildiriyoruz. Arayuz 'unsupported' gorunce ne yapilacagini soyluyor,
# sessiz kalmak "uygulama bozuk" izlenimi veriyordu.
#
# NTERMINAL_PREDICTION yok ya da 'off' ise HIC dokunmuyoruz: kullanicinin kendi
# .zshrc'sindeki ayar gecerli kalir.
if [[ -z $NTERMINAL_PREDICTION || $NTERMINAL_PREDICTION == "off" ]]; then
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
      "$HOME/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh"
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
