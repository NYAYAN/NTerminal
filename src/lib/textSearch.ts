import { useEffect, useRef, useState } from "react";

import { t, tp } from "./i18n";
import { api } from "./ipc";
import type { SearchFlags, TextSearchResult } from "../types";

/**
 * Dosyaların İÇİNDE arama — paletin "Dosya içeriği" sekmesi ve dosya
 * sütunundaki aramanın "İçerik" kipi aynı kancayı kullanıyor.
 *
 * Arama Rust'ta (`search.rs`): dosya içeriklerini arayüze taşımak hem yavaş
 * hem anlamsız. Burada üç iş var: yazdıkça yeni arama başlatmak (bekleyerek),
 * eskisini durdurmak ve sonucu çizilecek parçalara ayırmak.
 */

/**
 * Yazma ile arama arasındaki bekleme (ms).
 *
 * Her tuşta arama, "useStore" yazan birinin sekiz arama başlatması demek;
 * yedisinin sonucu hiç görülmüyor. 200 ms yazma soluğunu yakalıyor ama bir
 * sonucun "gecikti" diye hissedilme eşiğinin altında kalıyor.
 */
export const SEARCH_DEBOUNCE_MS = 200;

export const DEFAULT_FLAGS: SearchFlags = { caseSensitive: false, wholeWord: false, regex: false };

/** Rust'ın bozuk düzenli ifade hatasının öneki (bkz. `search::BAD_REGEX`). */
const BAD_REGEX = "regex:";

/** Satır metninin bir parçası: eşleşme mi değil mi. */
export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Satır metnini eşleşmelerle böler; işaretli parçalar `<mark>` olarak çiziliyor.
 *
 * Konumlar Rust'tan UTF-16 birimiyle geliyor, yani doğrudan `slice` ile
 * kesiliyor. Bozuk ya da çakışan bir aralık (olmamalı ama sözleşme dışarıdan
 * geliyor) metni kaybettirmiyor: sıraya dizilip kırpılıyor.
 */
export function segments(text: string, ranges: readonly (readonly [number, number])[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  for (const [rawStart, rawEnd] of sorted) {
    const start = Math.max(at, Math.min(rawStart, text.length));
    const end = Math.max(start, Math.min(rawEnd, text.length));
    if (end === start) continue;
    if (start > at) out.push({ text: text.slice(at, start), hit: false });
    out.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), hit: false });
  return out;
}

/**
 * Aramanın kimliği.
 *
 * Saat ile sayaç birlikte: sayaç tek başına sayfa yenilenince 1'den başlıyor
 * ve Rust tarafında hâlâ süren eski bir aramayla AYNI kimliği alabiliyordu —
 * o zaman yeni aramanın iptali eskisine gider. `Date.now() * 1000` 2^53'ün
 * altında kalıyor, sayı JavaScript'te tam.
 */
let counter = 0;
export function nextSearchId(): number {
  counter = (counter + 1) % 1000;
  return Date.now() * 1000 + counter;
}

export type SearchStatus = "idle" | "searching" | "done" | "error";

export interface TextSearchState {
  /**
   * `searching`: yeni arama sürüyor. Önceki sonuç (`result`) bu sırada
   * EKRANDA KALIYOR — her harfte listenin boşalıp yeniden dolması titreme gibi
   * görünüyordu; liste yerinde kalıp güncelleniyor.
   */
  status: SearchStatus;
  result: TextSearchResult | null;
  /** Kullanıcıya gösterilecek hata cümlesi. */
  error: string | null;
}

const IDLE: TextSearchState = { status: "idle", result: null, error: null };

/** Rust'tan gelen hatanın kullanıcıya gösterilecek hâli. */
export function searchErrorText(raw: unknown): string {
  const text = String(raw);
  if (text.startsWith(BAD_REGEX)) {
    return t("search.badRegex", { detail: text.slice(BAD_REGEX.length).trim() });
  }
  return t("search.failed", { detail: text });
}

/**
 * Sonucun özeti: "12 eşleşme · 3 dosya" ve varsa sınır notları.
 *
 * Sınırlar SÖYLENİYOR (bkz. `search.rs`): kesilen bir listeyi tam sanmak
 * "başka yerde yokmuş" demek olurdu.
 */
export function searchSummary(result: TextSearchResult): { counts: string; notes: string[] } {
  const counts = `${tp("search.matches", result.matches)} · ${tp("search.files", result.files.length)}`;
  const notes: string[] = [];
  if (result.truncated) notes.push(t("search.truncated", { n: result.lines }));
  if (result.filesCapped) notes.push(t("search.filesCapped"));
  if (result.skippedLarge > 0) notes.push(tp("search.skippedLarge", result.skippedLarge));
  return { counts, notes };
}

/**
 * Yazıldıkça arayan kanca.
 *
 * `enabled` kapalıyken, dizin bilinmiyorken ya da sorgu yalnızca boşluksa
 * arama yok ve süren arama durduruluyor. Sorgu KIRPILMADAN gidiyor: "  foo"
 * aramak isteyen girintiyi de arıyor olabilir; yalnızca boşluktan oluşan bir
 * sorgu ise her satırı eşleştirir, o arama yapılmıyor.
 *
 * Yeni bir sorgu geldiği AN süren arama durduruluyor, beklemenin sonunda değil:
 * yoksa bekleme süresinde eski sorgunun sonucu gelip ekrana yazılır, ardından
 * yenisi gelirdi — liste iki kez değişirdi.
 */
export function useTextSearch(
  cwd: string | null,
  query: string,
  flags: SearchFlags,
  enabled: boolean,
): TextSearchState {
  const [state, setState] = useState<TextSearchState>(IDLE);
  const live = useRef<number | null>(null);
  const active = enabled && !!cwd && query.trim().length > 0;
  const { caseSensitive, wholeWord, regex } = flags;

  useEffect(() => {
    // Süren aramayı durdurmak bu etkinin TEMİZLİĞİ: sorgu değiştiği an (yeni
    // etkiden önce) ve sökülürken koşuyor.
    const stop = () => {
      const id = live.current;
      live.current = null;
      if (id !== null) void api.searchTextCancel(id).catch(() => {});
    };
    if (!active || !cwd) {
      setState(IDLE);
      return;
    }

    setState((prev) => ({ status: "searching", result: prev.result, error: null }));
    const timer = window.setTimeout(() => {
      const id = nextSearchId();
      live.current = id;
      api
        .searchText(id, cwd, query, { caseSensitive, wholeWord, regex })
        .then((result) => {
          if (live.current !== id) return;
          live.current = null;
          // Sonucu boş bir iptal. Buraya yalnızca dışarıdan iptal edilen GÜNCEL
          // arama düşer (olmamalı); dönen çark sonsuza kadar dönmesin, önceki
          // sonuç kalsın.
          if (result.cancelled) {
            setState((prev) => ({ ...prev, status: prev.result ? "done" : "idle" }));
            return;
          }
          setState({ status: "done", result, error: null });
        })
        .catch((err) => {
          if (live.current !== id) return;
          live.current = null;
          setState({ status: "error", result: null, error: searchErrorText(err) });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [active, cwd, query, caseSensitive, wholeWord, regex]);

  return state;
}
