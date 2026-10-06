import { useEffect, useRef, useState } from "react";

import { clampInt, type Limit } from "../lib/settingsLimits";

interface Props {
  value: number;
  limit: Limit;
  /** Artır/azalt oklarının adımı. Elle yazılan değer adıma yuvarlanmıyor. */
  step?: number;
  disabled?: boolean;
  /**
   * Yeni değeri kaydeder. `false` dönerse (onay penceresinde vazgeçildi) kutu
   * eski değeri göstermeye devam ediyor — değer zaten depoda değişmemiş.
   */
  onCommit: (value: number) => void | boolean | Promise<void | boolean>;
}

/**
 * Sayı ayarı: değeri yazarken DEĞİL, kutudan çıkınca ya da Enter'da kaydeder.
 *
 * ## Neden
 *
 * Önceki kutular her tuşta kaydediyordu ve ara değerler gerçek ayar oluyordu.
 * ÖLÇÜLEN: "Kaydırma tamponu"na 10000'in yerine 20000 yazarken ilk "2"de ayar
 * 2 oldu ve açık BÜTÜN terminaller tamponlarını o an kırptı — 3001 satırlık
 * sekme 58 satıra düştü. Kutu boşaltılınca ayar 0 oldu ve 0 diske yazıldı.
 * "Azami kayıt sayısı"nda aynı desen komut geçmişini kalıcı olarak siliyordu
 * (300 ms'lik bir duraklama kaydı başlatmaya yetiyordu).
 *
 * Kaydederken değer sınırlara çekiliyor (`settingsLimits`); boş ya da sayı
 * olmayan giriş eski değere dönüyor. Esc yazılanı geri alıyor — kutu bu
 * sırada `data-owns-escape` taşıyor ki genel dinleyici Esc'yi pencereyi
 * kapatmaya harcamasın (bkz. `escapeOwnedBy`).
 *
 * Kutu kaydedilmemiş bir değerle sökülürse (pencere kapandı) değer yine
 * kaydediliyor: kullanıcı yazdı ve vazgeçmedi.
 */
export function NumberField({ value, limit, step, disabled, onCommit }: Props) {
  /** Yazılmakta olan metin; `null` = düzenlenmiyor, depodaki değer görünüyor. */
  const [draft, setDraft] = useState<string | null>(null);
  // Sökülme anında okunacak güncel değerler (ilk çizimdekiler değil).
  const live = useRef({ draft, value, limit, onCommit });
  live.current = { draft, value, limit, onCommit };

  const commit = (text: string | null) => {
    if (text === null) return;
    setDraft(null);
    const next = parse(text, live.current.limit);
    if (next === null || next === live.current.value) return;
    void live.current.onCommit(next);
  };

  // Sökülürken bekleyen değeri kaydet.
  useEffect(
    () => () => {
      const { draft: pending, limit: range, value: current, onCommit: save } = live.current;
      if (pending === null) return;
      const next = parse(pending, range);
      if (next !== null && next !== current) void save(next);
    },
    [],
  );

  return (
    <input
      type="number"
      inputMode="numeric"
      min={limit.min}
      max={limit.max}
      step={step}
      disabled={disabled}
      value={draft ?? String(value)}
      data-owns-escape={draft !== null ? "" : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit(draft);
        } else if (e.key === "Escape" && draft !== null) {
          e.preventDefault();
          setDraft(null);
        }
      }}
    />
  );
}

/** Yazılan metnin sınırlara çekilmiş değeri; boş ya da sayı değilse `null`. */
function parse(text: string, limit: Limit): number | null {
  const parsed = text.trim() === "" ? Number.NaN : Number(text);
  return Number.isFinite(parsed) ? clampInt(parsed, limit) : null;
}
