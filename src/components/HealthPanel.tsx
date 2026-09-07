import { useEffect, useState } from "react";

import { frameMonitor, type FrameStats, type HealthSnapshot } from "../lib/health";
import { useT } from "../lib/i18n";
import { tabLabel } from "../lib/labels";
import { sessions, useStore } from "../store/useStore";
import { SettingHint } from "./SettingHint";

/**
 * Teşhis okuması — Ayarlar › Hakkında.
 *
 * ## Neden var
 *
 * "Uygulama arada yanıt vermiyor" bildirimi tahminle arandı ve üç iş yükü
 * hipotezi ölçümle elendi (gerekçeler `lib/health.ts` başında). Bu panel
 * aramayı tahminden ölçüme taşıyor: bir daha donduğunda kullanıcı buradaki
 * sayıları kopyalayıp verebiliyor.
 *
 * ## Neden Hakkında bölümünde, kendi başlığında değil
 *
 * Bir ayar değil, bir okuma. Gezinme listesine kalıcı bir satır eklemek
 * ("Teşhis") her gün onu görmeyi ve hiç kullanmamayı getirirdi; Hakkında
 * zaten "bu uygulama hakkında olgular" bölümü.
 *
 * ## Neden yalnızca açıkken örnekliyor
 *
 * Panel açıkken saniyede bir örnek alıyor, kapalıyken hiç: sayıları toplayan
 * şey `frameMonitor` ve o zaten sürekli koşuyor. Panelin kendi maliyeti
 * kullanıcı ona BAKARKEN oluşuyor, bu da doğru zaman.
 */
export function HealthPanel() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const [snap, setSnap] = useState<HealthSnapshot>(() => frameMonitor.snapshot());
  const [counters, setCounters] = useState<
    Array<{ id: string; label: string; lines: number; markers: number; decorations: number; blocks: number }>
  >([]);

  useEffect(() => {
    const read = () => {
      setSnap(frameMonitor.snapshot());
      const tabs = groups.flatMap((g) => g.tabs);
      setCounters(
        [...sessions].map(([id, session]) => {
          const c = session.healthCounters();
          const tab = tabs.find((x) => x.id === id);
          return {
            id,
            label: tab ? tabLabel(tab) : id,
            lines: c.bufferLines,
            markers: c.markers,
            decorations: c.decorations,
            blocks: c.blocks,
          };
        }),
      );
    };
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, [groups]);

  const frameLine = (stats: FrameStats | null) =>
    stats
      ? t("health.frameLine", {
          median: String(stats.ortanca),
          p95: String(stats.p95),
          max: String(stats.enBuyuk),
        })
      : t("health.noSamples");

  const saat = (at: number) => new Date(at).toLocaleTimeString();

  /**
   * Panoya giden metin.
   *
   * Ekranda gördüğünün AYNISI, düz metin olarak: kullanıcı bunu bir yere
   * yapıştırdığında sayıların yanında ne olduğunu da görmeli, yoksa
   * bağlamsız bir sayı listesi kalır.
   */
  const report = () => {
    const satirlar = [
      `${t("health.heading")} — ${t("health.uptime")}: ${Math.round(snap.uptimeMs / 1000)} s`,
      `${t("health.taskQueue")}: ${frameLine(snap.gorevKuyrugu)}`,
      `${t("health.drawLoop")}: ${frameLine(snap.cizim)}`,
      `${t("health.terminals")}: ${counters.length}`,
      ...counters.map(
        (c) =>
          `  ${c.label} — ${t("health.terminalLine", {
            lines: String(c.lines),
            markers: String(c.markers),
            decorations: String(c.decorations),
            blocks: String(c.blocks),
          })}`,
      ),
      `${t("health.janks")}: ${snap.takilmalar.length}`,
      ...snap.takilmalar.map(
        (j) =>
          `  ${t("health.jankLine", {
            time: saat(j.at),
            gap: String(j.gapMs),
            task: String(j.taskMs),
          })}`,
      ),
    ];
    return satirlar.join("\n");
  };

  return (
    <div className="section">
      <h3>{t("health.heading")}</h3>

      <div className="field">
        <label>{t("health.uptime")}</label>
        <span className="mono">{Math.round(snap.uptimeMs / 1000)} s</span>
        <SettingHint>{t("health.hint")}</SettingHint>
      </div>

      <div className="field">
        <label>{t("health.taskQueue")}</label>
        <span className="mono">{frameLine(snap.gorevKuyrugu)}</span>
      </div>

      <div className="field">
        <label>{t("health.drawLoop")}</label>
        <span className="mono">{frameLine(snap.cizim)}</span>
      </div>

      <div className="field">
        <label>{t("health.terminals")}</label>
        <span className="mono">{counters.length}</span>
      </div>

      {counters.map((c) => (
        <div className="field" key={c.id}>
          <label>{c.label}</label>
          <span className="mono dim">
            {t("health.terminalLine", {
              lines: String(c.lines),
              markers: String(c.markers),
              decorations: String(c.decorations),
              blocks: String(c.blocks),
            })}
          </span>
        </div>
      ))}

      {/* Sayı satırı yalnızca takılma VARSA: "Son takılmalar 0" ile "Kayda
          geçen takılma yok" aynı şeyi iki satırda söylüyordu. */}
      <div className="field">
        <label>{t("health.janks")}</label>
        <span className="mono">
          {snap.takilmalar.length === 0 ? t("health.noJanks") : snap.takilmalar.length}
        </span>
      </div>

      {/* En YENİ üstte: donma az önce olduysa kullanıcı onu arıyor. */}
      {[...snap.takilmalar].reverse().map((j, i) => (
        <div className="field" key={`${j.at}:${i}`}>
          <label />
          <span className="mono dim">
            {t("health.jankLine", {
              time: saat(j.at),
              gap: String(j.gapMs),
              task: String(j.taskMs),
            })}
          </span>
        </div>
      ))}

      <div className="field">
        <label />
        {/* Saran kap: `.field`in ikinci sütunu düğmeyi tüm genişliğe
            yayıyordu — yanında hiçbir şey olmayan, satırı boydan boya kaplayan
            bir düğme. */}
        <div style={{ display: "flex" }}>
          <button
            className="outline"
            onClick={() => {
              const store = useStore.getState();
              void navigator.clipboard
                .writeText(report())
                .then(() => store.toast(t("health.copied"), "ok"))
                .catch(() => store.toast(t("common.clipboardFailed"), "err"));
            }}
          >
            {t("health.copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
