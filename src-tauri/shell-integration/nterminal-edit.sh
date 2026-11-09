# NTerminal - git mesaj duzenleyicisi (GIT_EDITOR)
#
# git birlestirme ya da commit mesaji icin duzenleyici aciyor (varsayilan vi).
# BILDIRILEN: "git pull dedigimde komut yazin kisminda degil ust kisimda :q!
# yazmak gerekiyor." Entegrasyon betikleri GIT_EDITOR'u bu betige
# yonlendiriyor (yalnizca ayar aciksa ve kullanici kendisi bir sey
# ayarlamadiysa); mesaj uygulamanin komut kutusunda duzenleniyor.
#
# git dosya yolunu $1 olarak veriyor ve betik bitene kadar bekliyor. Akis:
#
#   1. Kullanicinin acik tercihi (core.editor, VISUAL, EDITOR) varsa o calisir.
#      GIT_EDITOR'u biz kurdugumuz icin git'in kendi sirasinin geri kalani
#      burada.
#   2. Yoksa uygulamaya sorulur: OSC 633;P;EditFile=<mutlak yol>. Uygulama
#      once "ack" yaziyor, mesaj kutuda duzenlenince sonucu: "ok" (dosya
#      yazildi) -> 0, "cancel" -> 1 (git islemi birakiyor), "editor" (kutu
#      kapali ya da dosya okunamadi) -> vi.
#   3. 2 sn icinde onay gelmezse uygulama bu ozelligi bilmiyor: vi.
#
# Konusma /dev/tty uzerinden: git'in stdin/stdout'u yonlendirilmis olabilir.
# Yanit satirlari ekranda gorunmesin diye yanki kapatiliyor, cikista geri
# aciliyor.
#
# `bash` ile calistiriliyor (`GIT_EDITOR="bash '<yol>'"`): dosya calistirilabilir
# yazilmiyor ve macOS'taki yolda bosluk var. Git for Windows duzenleyiciyi
# kendi bash'iyle calistirdigi icin iki platformda ayni dosya.

f=$1

own=$(git config --get core.editor 2>/dev/null)
[ -n "$own" ] || own=${VISUAL:-${EDITOR:-}}
if [ -n "$own" ]; then
  # git'in kendi yaptigi gibi kabukla: `code --wait` gibi argumanli degerler.
  exec sh -c "$own \"\$@\"" "$own" "$f"
fi

fallback() {
  exec "${NTERMINAL_FALLBACK_EDITOR:-vi}" "$f"
}

# Uygulama dosyayi kendi surecinden okuyup yaziyor: yol MUTLAK olmali (git
# calisma agacinin kokunden `.git/COMMIT_EDITMSG` verebiliyor). Git for
# Windows'ta `/c/...` bicimi Windows yoluna cevriliyor.
case $f in
  /* | [A-Za-z]:*) abs=$f ;;
  *) abs=$PWD/$f ;;
esac
if command -v cygpath >/dev/null 2>&1; then
  abs=$(cygpath -w "$abs")
fi

{ : </dev/tty >/dev/tty; } 2>/dev/null || fallback

# OSC yukunde ';' ayirici; arayuz ayni kurali tersine uyguluyor (bkz.
# nterminal.sh, `__nterm_escape`).
esc() {
  local v=$1
  v=${v//\\/\\\\}
  v=${v//;/\\x3B}
  v=${v//$'\n'/\\x0A}
  v=${v//$'\r'/\\x0D}
  v=${v//$'\033'/\\x1B}
  v=${v//$'\007'/\\x07}
  printf '%s' "$v"
}

saved=$(stty -g </dev/tty 2>/dev/null)
restore() {
  [ -n "$saved" ] && stty "$saved" </dev/tty 2>/dev/null
}
trap restore EXIT
stty -echo </dev/tty 2>/dev/null

# Isaret anahtari: uygulama anahtarsiz istegi saymiyor (ciktinin icine gomulu
# sahte bir EditFile rastgele bir dosya icin duzenleyici actirabiliyordu).
# Degiskeni kabuk disa aktarilmis birakiyor; git uzerinden buraya ulasiyor.
key=${NTERMINAL_NONCE-}
key=${key//[^A-Za-z0-9]/}
[ -n "$key" ] && key=";$key"

printf '\033]633;P;EditFile=%s%s\007' "$(esc "$abs")" "$key" >/dev/tty

ack=
IFS= read -r -t 2 ack </dev/tty
if [ "${ack%$'\r'}" != ack ]; then
  restore
  trap - EXIT
  fallback
fi

answer=
IFS= read -r answer </dev/tty
case ${answer%$'\r'} in
  ok) exit 0 ;;
  editor)
    restore
    trap - EXIT
    fallback
    ;;
  *) exit 1 ;;
esac
