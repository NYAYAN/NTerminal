#!/bin/sh
# NTerminal - yerel macOS paketlerini imzalayan kendinden imzali kimligi
# ("NTerminal Dev") olusturup giris anahtar zincirine ekler.
#
# NEDEN: imzasiz pakette macOS gizlilik izinlerini (Tam Disk Erisimi,
# Erisilebilirlik, Otomasyon) ikilinin hash'ine bagliyor ve HER derlemede
# sifirliyor. Sabit bir sertifikayla imzali pakette izinler derlemeler arasinda
# korunuyor. Kimlik yalnizca bu Mac'te ise yariyor: baska bir Mac ona
# guvenmiyor, indirilen paketin Gatekeeper uyarisi da degismiyor (bkz. README).
#
# `npm run bundle` kimligi kendiliginden kullaniyor (scripts/run.mjs).
#
# Guven ayarina DOKUNULMUYOR: codesign imzalarken guvene bakmiyor. Sondaki
# deneme imzasi bunu bu makinede sinar.
#
# Kullanim: sh scripts/macos-cert.sh

set -eu

NAME="NTerminal Dev"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if [ "$(uname)" != "Darwin" ]; then
  echo "Bu betik yalnizca macOS icin." >&2
  exit 1
fi

if security find-identity -p codesigning | grep -qF "\"$NAME\""; then
  echo "\"$NAME\" kimligi zaten var; yapilacak bir sey yok."
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/req.cnf" <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

# 10 yil: suresi dolmus sertifikayla codesign imzalamiyor.
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -config "$TMP/req.cnf" -extensions ext \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null

# Parola yalnizca bu aktarim icin; dosyalar betik bitince siliniyor.
# /usr/bin/openssl (LibreSSL) bilerek: PATH'teki bir OpenSSL 3'un varsayilan
# PKCS#12 sifrelemesini `security import` okuyamayabiliyor ("MAC verification
# failed").
PASS=$(/usr/bin/openssl rand -hex 16)
/usr/bin/openssl pkcs12 -export -name "$NAME" \
  -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -out "$TMP/identity.p12" -passout "pass:$PASS"

# -T: codesign anahtari her imzada sormadan kullanabilsin.
security import "$TMP/identity.p12" -k "$KEYCHAIN" -f pkcs12 -P "$PASS" -T /usr/bin/codesign

echo "\"$NAME\" anahtar zincirine eklendi. Deneme imzasi atiliyor..."
echo "(macOS anahtar zinciri parolasini sorarsa \"Her Zaman Izin Ver\" deyin.)"
cp /usr/bin/true "$TMP/probe"
codesign --force --sign "$NAME" "$TMP/probe"
codesign --verify "$TMP/probe"
echo "Tamam: \"$NAME\" ile imza atilabiliyor. Paketi yeniden uretin: npm run bundle"
