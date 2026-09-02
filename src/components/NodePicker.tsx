import { useEffect, useMemo, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import { filterVersions, useNodeCommand } from "../lib/nodeVersions";
import { anchorAbove } from "../lib/popover";
import { useStore } from "../store/useStore";
import type { NodeEnv } from "../types";
import { NodeIcon } from "./Icons";

/**
 * Node sürüm seçici — komut satırının üstündeki Node rozetine tıklayınca
 * açılıyor. Dal seçiciyle (`BranchPicker`) aynı gövde ve aynı karar:
 *
 * ## Geçiş neden ÇALIŞTIRILIYOR
 *
 * `nvm use` tek sonuçlu bir komut ve kendi hatasını kendisi söylüyor
 * (yönetici izni, kurulu olmayan sürüm). Komut kabuktan geçiyor: geçmişte
 * kaydı kalıyor, çıktısı ekranda ve bir sonraki komut bittiğinde rozet
 * kendiliğinden yeni sürümü gösteriyor.
 *
 * Liste depodaki `nodeEnv`den geliyor, yeniden okunmuyor: rozet zaten her
 * komut sonunda ve pencereye dönüşte tazeleniyor, seçici o hâli gösteriyor.
 */
export function NodePicker({ env, onClose }: { env: NodeEnv; onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => anchorAbove(boxRef.current, ".ctx-chip.node"), []);

  const rows = useMemo(() => filterVersions(env.installed, query), [env.installed, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const gecis = (version: string) => {
    // Zaten o sürümdeysek komut göndermenin anlamı yok.
    if (version !== env.current) {
      useStore.getState().insertCommand(useNodeCommand(env.manager, version), true);
    }
    onClose();
  };

  return (
    <div className="overlay popover-overlay" onMouseDown={onClose}>
      <div
        ref={boxRef}
        className="pop-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (rows.length === 0) return;
            const yon = e.key === "ArrowDown" ? 1 : -1;
            setIndex((i) => (((i + yon) % rows.length) + rows.length) % rows.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const row = rows[index];
            if (row) gecis(row);
          }
        }}
      >
        <input
          ref={inputRef}
          className="pop-search"
          value={query}
          placeholder={t("node.search")}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        <div className="pop-list">
          {rows.length === 0 && <div className="pop-empty">{t("node.noVersion")}</div>}
          {rows.map((v, i) => (
            <button
              key={v}
              type="button"
              className={i === index ? "pop-row on" : "pop-row"}
              // nvm.sh'te seçim varsayılanı da değiştiriyor; bunu satırda
              // söylemek gerekiyor, komut ekrana düştükten sonra değil.
              title={env.manager === "nvm" ? t("node.defaultHint") : undefined}
              onMouseEnter={() => setIndex(i)}
              onClick={() => gecis(v)}
            >
              <span className="pop-mark" aria-hidden="true">
                <NodeIcon size={12} />
              </span>
              {`v${v}`}
              {v === env.current && <span className="pop-tag">{t("node.current")}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
