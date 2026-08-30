import { useEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import { getTheme } from "../lib/themes";
import { useStore } from "../store/useStore";

/**
 * Terminal içi arama çubuğu (Ctrl+Shift+F).
 *
 * xterm'in SearchAddon'ı üzerinden çalışıyor; eşleşme sayısını addon'un
 * `onDidChangeResults` olayından okuyoruz - kendimiz saymaya kalkarsak
 * kaydırma tamponundaki satır sayısı yüzünden yavaşlar.
 */
export function TerminalFind() {
  const t = useT();
  const setUi = useStore((s) => s.setUi);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const groups = useStore((s) => s.groups);

  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<{ index: number; count: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const group = groups.find((g) => g.id === activeGroupId);
  const tabId = group?.activeTabId ?? group?.tabs[0]?.id ?? null;

  // Eslesme sayaci yalnizca dekorasyonlar acikken bildiriliyor (addon
  // sozlesmesi), zaten eslesmelerin isaretlenmesini de istiyoruz.
  /*
   * Eşleşme vurguları.
   *
   * İki şey düzeltildi.
   *
   * 1. ETKİN EŞLEŞME AYIRT EDİLEMİYORDU. 150 sonuç arasında "Sonraki"ye
   *    basınca hangisinde olduğunuz seçilmiyordu: iki renk de maviydi, yalnızca
   *    tonu farklıydı. Artık etkin eşleşmenin ayrıca ÇERÇEVESİ var — renk
   *    yakınlığından bağımsız olarak göze çarpıyor.
   *
   * 2. RENKLER SABİT KODLANMIŞTI. Koyu tema için seçilmiş maviler açık temada
   *    (Solarized Light) zeminle karışıyordu. Artık temadan geliyorlar:
   *    sıradan eşleşme seçim rengiyle — "vurgulu ama odakta değil" anlamı zaten
   *    bu —, etkin eşleşme vurgu rengiyle, çerçevesi de ön plan rengiyle.
   */
  const theme = getTheme(useStore((s) => s.settings.appearance.theme));
  const options = {
    caseSensitive,
    wholeWord,
    decorations: {
      matchBackground: theme.xterm.selectionBackground ?? "#3b5070",
      matchBorder: theme.xterm.selectionBackground ?? "#3b5070",
      matchOverviewRuler: theme.ui.accent,
      activeMatchBackground: theme.ui.accent,
      activeMatchBorder: theme.xterm.foreground ?? "#ffffff",
      activeMatchColorOverviewRuler: theme.xterm.foreground ?? "#ffffff",
    },
  };

  const session = () => useStore.getState().activeSession();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Eşleşme sayacına abone ol. Sekme değişirse yeni oturuma bağlan.
  useEffect(() => {
    const current = session();
    if (!current) return;
    const disposable = current.search.onDidChangeResults((event) => {
      setResults({ index: event.resultIndex, count: event.resultCount });
    });
    return () => disposable.dispose();
  }, [tabId]);

  // Arama koşulları değiştikçe canlı ara.
  useEffect(() => {
    const current = session();
    if (!current) return;
    if (!query) {
      current.search.clearDecorations();
      setResults(null);
      return;
    }
    current.search.findNext(query, { ...options, incremental: true });
  }, [query, caseSensitive, wholeWord, tabId]);

  const close = () => {
    session()?.search.clearDecorations();
    setUi({ findOpen: false });
    session()?.focus();
  };

  const step = (direction: 1 | -1) => {
    const current = session();
    if (!current || !query) return;
    if (direction === 1) current.search.findNext(query, options);
    else current.search.findPrevious(query, options);
  };

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        placeholder={t("find.placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            close();
          }
        }}
      />
      <span className="count">
        {query ? (results ? `${results.count === 0 ? 0 : results.index + 1}/${results.count}` : "…") : ""}
      </span>
      <button
        className={caseSensitive ? "icon-btn on" : "icon-btn"}
        title={t("find.caseSensitive")}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button
        className={wholeWord ? "icon-btn on" : "icon-btn"}
        title={t("find.wholeWord")}
        onClick={() => setWholeWord((v) => !v)}
      >
        ab
      </button>
      <button className="icon-btn" title={t("find.prev")} onClick={() => step(-1)}>
        ↑
      </button>
      <button className="icon-btn" title={t("find.next")} onClick={() => step(1)}>
        ↓
      </button>
      <button className="icon-btn" title={t("find.close")} onClick={close}>
        ×
      </button>
    </div>
  );
}
