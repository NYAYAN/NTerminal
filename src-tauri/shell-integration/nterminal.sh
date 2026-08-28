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
# Etkilesimli, login olmayan bir kabugun normalde okudugu sirayi taklit ediyoruz.
if [ -f /etc/bash.bashrc ]; then . /etc/bash.bashrc; fi
if [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi

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

# Istemin bittigini (komut girisinin basladigini) PS1 sonuna isaretliyoruz.
# \[ \] sarmasi bash'e "bu karakterler ekranda yer kaplamaz" der; olmazsa
# satir uzunlugu yanlis hesaplanip imlec kayar.
case "${PS1-}" in
  *'133;B'*) ;;
  *) PS1="${PS1}\[\033]133;B\007\]" ;;
esac

__nterm_report_cwd

trap '__nterm_debug_trap' DEBUG
