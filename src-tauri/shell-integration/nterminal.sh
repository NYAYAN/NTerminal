# NTerminal - bash kabuk entegrasyonu (Git Bash / WSL)
#
# `bash --init-file <bu dosya>` ile yuklenir. --init-file kullanicinin kendi rc
# dosyalarini atladigi icin onlari basta kendimiz yukluyoruz; aksi halde
# kullanicinin takma adlari (alias) ve PATH ayarlari kaybolur.

if [ -n "$NTERMINAL_INTEGRATION_LOADED" ]; then
  return 0 2>/dev/null || exit 0
fi
NTERMINAL_INTEGRATION_LOADED=1

# --- 1) kullanicinin kendi baslangic dosyalari ------------------------------
#
# --init-file ile geldigimiz icin bash bunlarin hicbirini kendiliginden
# okumuyor; sirayi biz taklit ediyoruz. Yoksa alias'lar, PATH ve tema gider.
#
# Zincir platforma gore DEGISIYOR cunku kullanicilarin ayarlarini yazdigi yer
# degisiyor. pty.rs `--login`i cikarmak zorunda (bash `--init-file`i yalnizca
# login OLMAYAN etkilesimli kabukta okuyor), dolayisiyla login zincirini de
# gerektiginde biz yukluyoruz.
case "${OSTYPE:-}" in
  darwin*)
    # macOS: Terminal.app login kabugu actigi icin kullanicilar ayarini
    # .bash_profile'a yaziyor, PATH'i de /etc/profile icindeki path_helper
    # kuruyor. Login zincirini birebir taklit ediyoruz.
    #
    # .bashrc'yi AYRICA yuklemiyoruz: mac'te profil dosyasi gerekiyorsa onu
    # kendisi yukluyor ve iki kez yuklemek PATH girdilerini cift yazardi.
    if [ -f /etc/profile ]; then . /etc/profile; fi
    __nterm_profile=""
    for __nterm_f in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
      if [ -f "$__nterm_f" ]; then
        __nterm_profile="$__nterm_f"
        . "$__nterm_f"
        break
      fi
    done
    # Hic profil dosyasi yoksa .bashrc'ye dusuyoruz: ayarini Linux
    # aliskanligiyla oraya yazmis bir kullanici bos kabukla karsilasmasin.
    if [ -z "$__nterm_profile" ] && [ -f "$HOME/.bashrc" ]; then
      . "$HOME/.bashrc"
    fi
    unset __nterm_f __nterm_profile
    ;;
  *)
    # Git Bash ve WSL: etkilesimli, login olmayan kabugun okudugu sira.
    if [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc; fi
    if [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi
    ;;
esac

# --- 2) yardimcilar ---------------------------------------------------------

__nterm_osc() { printf '\033]%s\007' "$1"; }

# OSC yukunde ';' ayirici oldugu icin kaciyoruz. Arayuz ayni kurali tersine uygular.
__nterm_escape() {
  local v="$1"
  v="${v//\\/\\\\}"
  v="${v//;/\\x3B}"
  v="${v//$'\n'/\\x0A}"
  v="${v//$'\r'/\\x0D}"
  v="${v//$'\033'/\\x1B}"
  v="${v//$'\007'/\\x07}"
  printf '%s' "$v"
}

__nterm_report_cwd() {
  __nterm_osc "633;P;Cwd=$(__nterm_escape "$PWD")"
  __nterm_osc "7;file://${HOSTNAME:-localhost}${PWD}"
}

# --- 3) komut oncesi / sonrasi kancalari ------------------------------------
#
# DEBUG tuzagi HER basit komuttan once tetiklenir - kullanicinin komutundan da,
# PROMPT_COMMAND'in parcalarindan da, bu betigin kendi satirlarindan da. Ayirt
# etmenin guvenilir yolu bir sentinel: PROMPT_COMMAND'in EN SONUNA eklenen
# `__nterm_prompt_done` "istem bitti, bundan sonraki ilk komut kullanicinin"
# demek oluyor. Tuzak yalnizca bu bayrak acikken bildirim yapip bayragi
# kapatiyor.
#
# Alternatifler ise yaramiyor:
#   * `history 1` numarasini karsilastirmak: HISTCONTROL=ignoredups ile ayni
#     komutun tekrarlari gecmise girmedigi icin bildirilmezdi.
#   * "bir kez bildir" bayragini PROMPT_COMMAND'da sifirlamak: kullanicinin
#     kendi PROMPT_COMMAND parcalari komut sanilirdi.

__nterm_ready=""
__nterm_in_cmd=""

__nterm_prompt_done() {
  __nterm_ready=1
  return 0
}

__nterm_debug_trap() {
  # Sekme tamamlama sirasinda tetiklenirse gormezden gel.
  [ -n "$COMP_LINE" ] && return 0
  # Istem henuz bitmedi: bu firing PROMPT_COMMAND'in parcasi veya baslangic
  # betigi. Kullanicinin komutu degil.
  [ -z "$__nterm_ready" ] && return 0
  # Satir basina tek bildirim: boru hatlarindaki her basit komut icin ayri
  # kayit acilmasin.
  __nterm_ready=""
  __nterm_in_cmd=1

  # `history 1` tam komut satirini verir; BASH_COMMAND sadece o anki basit
  # komutu verdigi icin boru hatlarinda (pipeline) eksik kalirdi.
  local raw cmd
  raw=$(HISTTIMEFORMAT='' builtin history 1 2>/dev/null)
  if [[ $raw =~ ^[[:space:]]*[0-9]+[[:space:]]+(.*)$ ]]; then
    cmd="${BASH_REMATCH[1]}"
  else
    cmd="$BASH_COMMAND"
  fi

  if [ -n "$cmd" ]; then
    __nterm_osc "633;E;$(__nterm_escape "$cmd")"
  fi
  __nterm_osc "133;C"
  return 0
}

__nterm_precmd() {
  local code=$?

  if [ -n "$__nterm_in_cmd" ]; then
    __nterm_osc "133;D;$code"
    __nterm_in_cmd=""
  else
    __nterm_osc "133;D"
  fi

  __nterm_report_cwd
  __nterm_osc "133;A"
  return 0
}

# --- 4) kancalari kur -------------------------------------------------------

# precmd, $? degerini bozulmadan okuyabilmek icin PROMPT_COMMAND'in BASINDA;
# prompt_done ise sentinel gorevi gordugu icin EN SONDA olmali.
if [[ "${PROMPT_COMMAND-}" != *__nterm_precmd* ]]; then
  if [ -n "${PROMPT_COMMAND-}" ]; then
    PROMPT_COMMAND="__nterm_precmd; ${PROMPT_COMMAND}
__nterm_prompt_done"
  else
    PROMPT_COMMAND="__nterm_precmd; __nterm_prompt_done"
  fi
fi

# Renkli varsayilan istem.
#
# macOS'un bash varsayilani (`\h:\W \u\$ `, /etc/bashrc) ve bash'in yerlesik
# varsayilani (`\s-\v\$ `) duz metin: ekran gecmisinde bir komutun NEREDE
# basladigini gozle bulmak zor. Kullanicinin bilerek kurdugu istem DEGISMEZ:
# yalnizca bu iki varsayilandan biriyle BIREBIR ayniysa renkleniyor (kullanici
# profilleri yukarida yuklendi, PS1 o an son hali).
#
# Renkler paletten (yesil/mavi = ANSI 2/4): gercek tonu tema belirliyor. `\[ \]`
# bash'e "bu karakterler ekranda yer kaplamaz" der; olmazsa satir uzunlugu
# yanlis hesaplanip imlec kayar.
#
# Renkleri KULLANICI secebiliyor (Ayarlar > Terminal > Istem renkleri): uygulama
# `NTERMINAL_PROMPT_USER_RGB` (kullanici@makine) ve `NTERMINAL_PROMPT_DIR_RGB`
# (dizin) degiskenlerine `R;G;B` yaziyor (terminal zeminine karsi okunur hale
# getirilmis). Deger bir KACIS DIZISININ icine yazildigi icin kati dogrulaniyor:
# yalniz rakam, tam iki `;`. Bos ya da bozuk bir deger sessizce palet rengine
# (yesil / mavi) dusuyor.
#
# NTERMINAL_PROMPT_COLOR=0 ise dokunmuyoruz; degisken yoksa renkleniyor.
__nterm_rgb_ok() {
  case "$1" in
    '' | *[!0-9\;]* | \;* | *\; | *\;\;*) return 1 ;;
  esac
  [ "${1//[^;]/}" = ";;" ]
}
if [ "${NTERMINAL_PROMPT_COLOR-1}" != "0" ]; then
  __nterm_uc='1;32'
  __nterm_dc='1;34'
  if __nterm_rgb_ok "${NTERMINAL_PROMPT_USER_RGB-}"; then
    __nterm_uc="1;38;2;${NTERMINAL_PROMPT_USER_RGB}"
  fi
  if __nterm_rgb_ok "${NTERMINAL_PROMPT_DIR_RGB-}"; then
    __nterm_dc="1;38;2;${NTERMINAL_PROMPT_DIR_RGB}"
  fi
  case "${PS1-}" in
    '\h:\W \u\$ ')
      PS1='\[\033['"${__nterm_uc}"'m\]\h\[\033[0m\]:\[\033['"${__nterm_dc}"'m\]\W\[\033[0m\] \[\033['"${__nterm_uc}"'m\]\u\[\033[0m\]\$ '
      ;;
    '\s-\v\$ ')
      PS1='\[\033['"${__nterm_uc}"'m\]\s-\v\[\033[0m\]\$ '
      ;;
  esac
  unset __nterm_uc __nterm_dc
fi
unset -f __nterm_rgb_ok

# Istemin bittigini (komut girisinin basladigini) PS1 sonuna isaretliyoruz.
# \[ \] sarmasi bash'e "bu karakterler ekranda yer kaplamaz" der; olmazsa
# satir uzunlugu yanlis hesaplanip imlec kayar.
case "${PS1-}" in
  *'133;B'*) ;;
  *) PS1="${PS1}\[\033]133;B\007\]" ;;
esac

__nterm_report_cwd

trap '__nterm_debug_trap' DEBUG
