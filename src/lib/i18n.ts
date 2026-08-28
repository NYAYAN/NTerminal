import { useMemo, useSyncExternalStore } from "react";

import type { Lang } from "../types";
import { MESSAGES, type MsgKey, type PluralBase } from "./messages";

/**
 * Arayüz dili.
 *
 * Neden hazır bir i18n kütüphanesi değil: tek ihtiyaç iki dilli düz bir
 * sözlük, çoğul için tek kural ve dil değişince yeniden çizim. Bunun için
 * paket bağımlılığı taşımaya değmiyor — buradaki tamamı elli satır ve
 * anahtarlar derleme anında denetleniyor (`MsgKey`), yani var olmayan bir
 * anahtar yazmak derlemede hata veriyor.
 *
 * Dil, zustand deposunda değil bu modülde duruyor: React dışından da
 * (TerminalSession, store bildirimleri) `t()` çağrılabilmesi gerekiyor ve
 * i18n'in depoya bağımlı olması dairesel bir bağımlılık üretiyordu.
 */
export type { Lang };

export const LANGS: { id: Lang; label: string }[] = [
  { id: "tr", label: "Türkçe" },
  { id: "en", label: "English" },
];

/** Varsayılan Türkçe: uygulama Türkçe yazıldı, mevcut kullanıcı dili değişmesin. */
export const DEFAULT_LANG: Lang = "tr";

export function normalizeLang(value: string | null | undefined): Lang {
  return value === "en" ? "en" : DEFAULT_LANG;
}

let current: Lang = DEFAULT_LANG;
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(next: Lang | string | null | undefined) {
  const lang = normalizeLang(typeof next === "string" ? next : next ?? null);
  if (lang === current) return;
  current = lang;
  // Ekran okuyucular ve tarayıcının tireleme/imla davranışı buna bakıyor.
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  for (const fn of [...listeners]) fn();
}

/** Intl etiketi: tarih, saat ve sayı biçimleri de dille birlikte değişiyor. */
export function localeTag(lang: Lang = current): string {
  return lang === "en" ? "en-US" : "tr-TR";
}

export type Params = Record<string, string | number>;

export function t(key: MsgKey, params?: Params): string {
  const entry = MESSAGES[key];
  const text = current === "en" ? entry[1] : entry[0];
  if (!params) return text;
  // Eşleşmeyen yer tutucu olduğu gibi kalıyor: eksik parametre sessizce
  // "undefined" yazmaktan iyi, hatayı gösteriyor.
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * Sayıya göre çoğul.
 *
 * Türkçede sayıdan sonra isim tekil kalıyor ("3 sekme"), İngilizcede kalmıyor
 * ("3 tabs"). Tek bir metinle çözülmediği için sayılı ifadeler `.one` / `.other`
 * çiftiyle tanımlı; Türkçe tarafta ikisi genelde aynı metin.
 */
export function tp(base: PluralBase, n: number, params?: Params): string {
  const key = `${base}.${n === 1 ? "one" : "other"}` as MsgKey;
  return t(key, { n, ...params });
}

/**
 * Metni bir yer tutucudan ikiye böler; araya JSX koymak için.
 *
 * Örnek: `"{keys} ile yeni sekme açın."` → `["", " ile yeni sekme açın."]`,
 * İngilizcesi `"Press {keys} to open a new tab."` → `["Press ", " to open a new tab."]`.
 * Cümlenin yapısı dile göre değiştiği için parçaları çeviriye bırakmak,
 * "önce şu metin sonra düğme" diye sabitlemekten doğru.
 */
export function tSplit(key: MsgKey, placeholder: string, params?: Params): [string, string] {
  const text = t(key, params);
  const token = `{${placeholder}}`;
  const at = text.indexOf(token);
  if (at === -1) return [text, ""];
  return [text.slice(0, at), text.slice(at + token.length)];
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

export type Translate = typeof t;

/**
 * Bileşenlerin kullandığı biçim.
 *
 * Dil değişince YENİ bir işlev referansı dönüyor. Modül düzeyindeki `t`'yi
 * doğrudan döndürseydik referans hiç değişmez, `useMemo`/`useCallback`
 * bağımlılığı olarak kullanıldığında dil değişimi gözden kaçardı.
 */
export function useT(): Translate {
  const lang = useLang();
  return useMemo<Translate>(() => (key, params) => t(key, params), [lang]);
}
