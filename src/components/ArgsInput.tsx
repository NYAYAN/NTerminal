import { useState } from "react";

import { formatArgs, parseArgs, sameArgs } from "../lib/args";

/**
 * Profil argümanları kutusu.
 *
 * Kutu KENDİ metnini tutuyor; dizi yalnızca ondan türetiliyor. Önceki hâli
 * diziyi her tuşta yeniden birleştirip kutuya geri yazıyordu ve sondaki boşluk
 * o turda kayboluyordu — "-l -i" yazmak "-l-i" üretiyordu (gerekçe ve ölçüm
 * `lib/args.ts` içinde).
 *
 * Dışarıdan gelen dizi (başka profil seçildi, ayar içe aktarıldı) kutudaki
 * metnin anlattığından farklıysa metin yeniden yazılıyor; aynıysa DOKUNULMUYOR
 * — yazılmakta olan sondaki boşluk ya da açık tırnak korunmalı.
 */
export function ArgsInput({
  args,
  placeholder,
  onChange,
}: {
  args: string[];
  placeholder: string;
  onChange: (args: string[]) => void;
}) {
  const [text, setText] = useState(() => formatArgs(args));
  const [seen, setSeen] = useState(args);
  if (seen !== args) {
    setSeen(args);
    if (!sameArgs(parseArgs(text), args)) setText(formatArgs(args));
  }

  return (
    <input
      className="mono"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const next = parseArgs(e.target.value);
        if (!sameArgs(next, args)) onChange(next);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}
