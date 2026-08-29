import { useMemo, useState } from "react";

import { formatWhen, fuzzyScore, shortenPath } from "../lib/format";
import { tp, tSplit, useT } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { Favorite } from "../types";
import { api } from "../lib/ipc";
import { ContextMenu, useContextMenu, type MenuEntry } from "./ContextMenu";

interface DraftForm {
  id: string | null;
  command: string;
  label: string;
  note: string;
  cwd: string;
  groupId: string;
}

const EMPTY: DraftForm = { id: null, command: "", label: "", note: "", cwd: "", groupId: "" };

function toDraft(favorite: Favorite): DraftForm {
  return {
    id: favorite.id,
    command: favorite.command,
    label: favorite.label ?? "",
    note: favorite.note ?? "",
    cwd: favorite.cwd ?? "",
    groupId: favorite.groupId ?? "",
  };
}

/**
 * Favori komutlar paneli.
 *
 * Geçmişten ayrı tutuluyor: geçmiş otomatik birikip sınır aşılınca budanıyor,
 * favoriler ise kullanıcının bilinçli olarak sakladığı ve elle sıraladığı
 * kayıtlar.
 */
export function FavoritesPanel() {
  const t = useT();
  // Boş liste ipucundaki "+ Favori" düğme adı cümlenin ortasında; parçaları
  // çeviriden alıyoruz ki cümle yapısı dile göre değişebilsin.
  const [emptyBefore, emptyAfter] = tSplit("fav.emptyLine3", "button");
  const favorites = useStore((s) => s.favorites);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const store = useStore.getState;

  const [query, setQuery] = useState("");
  const [onlyThisGroup, setOnlyThisGroup] = useState(false);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const menu = useContextMenu();

  const visible = useMemo(() => {
    const needle = query.trim();
    let items = favorites;
    if (onlyThisGroup) {
      // Gruba bağlı olmayan favoriler her grupta geçerli, onları da göster.
      items = items.filter((f) => !f.groupId || f.groupId === activeGroupId);
    }
    if (!needle) return items;
    return items
      .map((f) => ({
        f,
        score: fuzzyScore(`${f.label ?? ""} ${f.command} ${f.note ?? ""}`, needle),
      }))
      .filter((r): r is { f: Favorite; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.f);
  }, [favorites, query, onlyThisGroup, activeGroupId]);

  const submit = async () => {
    if (!form) return;
    const command = form.command.trim();
    if (!command) {
      store().toast(t("fav.commandEmpty"), "err");
      return;
    }
    if (form.id) {
      await store().updateFavorite(form.id, {
        command,
        label: form.label.trim() || null,
        note: form.note.trim() || null,
        cwd: form.cwd.trim() || null,
        groupId: form.groupId || null,
      });
    } else {
      await store().addFavorite({
        command,
        label: form.label.trim() || null,
        note: form.note.trim() || null,
        cwd: form.cwd.trim() || null,
        groupId: form.groupId || null,
      });
    }
    setForm(null);
  };

  const entriesFor = (favorite: Favorite, index: number): MenuEntry[] => [
    {
      kind: "item",
      label: t("common.run"),
      hint: t("common.doubleClick"),
      run: () => void store().runFavorite(favorite.id, true),
    },
    {
      kind: "item",
      label: t("menu.insertAtPrompt"),
      hint: t("common.click"),
      run: () => void store().runFavorite(favorite.id, false),
    },
    { kind: "separator" },
    { kind: "item", label: t("common.edit"), run: () => setForm(toDraft(favorite)) },
    {
      kind: "item",
      label: t("common.copyCommand"),
      run: () => void navigator.clipboard?.writeText(favorite.command).catch(() => {}),
    },
    // Favorinin klasoru satirda YAZIYOR ama acmanin bir yolu yoktu; ayni yol
    // gecmis panelinde ve sekme menusunde acilabiliyordu.
    ...(favorite.cwd
      ? [
          {
            kind: "item" as const,
            label: t("common.revealFolder"),
            run: () => void api.revealInExplorer(favorite.cwd!).catch(() => {}),
          },
        ]
      : []),
    { kind: "separator" },
    {
      kind: "item",
      label: t("common.moveUp"),
      disabled: index === 0,
      run: () => void store().moveFavorite(favorite.id, -1),
    },
    {
      kind: "item",
      label: t("common.moveDown"),
      disabled: index === favorites.length - 1,
      run: () => void store().moveFavorite(favorite.id, 1),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: t("menu.removeFavorite"),
      danger: true,
      run: () => void store().removeFavorite(favorite.id),
    },
  ];

  return (
    <>
      <div className="panel-controls">
        <input
          placeholder={t("fav.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <label className="check-row" style={{ padding: 0, whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={onlyThisGroup}
            onChange={(e) => setOnlyThisGroup(e.target.checked)}
          />
          <span className="dim">{t("fav.thisGroup")}</span>
        </label>
      </div>

      {form && (
        <div className="fav-form">
          <input
            autoFocus
            className="mono"
            placeholder={t("fav.commandPlaceholder")}
            value={form.command}
            onChange={(e) => setForm({ ...form, command: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") setForm(null);
            }}
          />
          <input
            placeholder={t("fav.labelPlaceholder")}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") setForm(null);
            }}
          />
          <input
            placeholder={t("fav.notePlaceholder")}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="mono"
            placeholder={t("fav.cwdPlaceholder")}
            value={form.cwd}
            onChange={(e) => setForm({ ...form, cwd: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <select
            value={form.groupId}
            onChange={(e) => setForm({ ...form, groupId: e.target.value })}
          >
            <option value="">{t("fav.allGroups")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {t("fav.onlyGroup", { name: g.name })}
              </option>
            ))}
          </select>
          <div className="fav-form-actions">
            <button className="primary" onClick={() => void submit()}>
              {t(form.id ? "fav.save" : "fav.add")}
            </button>
            <button className="outline" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="panel-list">
        {visible.length === 0 && (
          <div className="hint">
            {favorites.length === 0 ? (
              <>
                {t("fav.emptyLine1")}
                <br />
                {t("fav.emptyLine2")}
                <br />
                {emptyBefore}
                <strong>{t("fav.newButton")}</strong>
                {emptyAfter}
              </>
            ) : (
              t("fav.noSearchMatch")
            )}
          </div>
        )}

        {visible.map((favorite) => {
          const index = favorites.findIndex((f) => f.id === favorite.id);
          const group = groups.find((g) => g.id === favorite.groupId);
          return (
            <div
              key={favorite.id}
              className={selected === favorite.id ? "fav-item sel" : "fav-item"}
              title={[favorite.command, favorite.note ?? "", t("fav.rowHint")].join("\n")}
              onClick={() => {
                setSelected(favorite.id);
                void store().runFavorite(favorite.id, false);
              }}
              onDoubleClick={() => void store().runFavorite(favorite.id, true)}
              onContextMenu={(e) => menu.open(e, entriesFor(favorite, index))}
            >
              <span className="fav-star">★</span>
              <div className="fav-body">
                <div className="fav-title">{favorite.label || favorite.command}</div>
                {favorite.label && <div className="fav-cmd mono">{favorite.command}</div>}
                <div className="fav-meta">
                  {group && <span className="fav-tag" style={{ color: group.color ?? undefined }}>{group.name}</span>}
                  {favorite.cwd && <span className="path">{shortenPath(favorite.cwd, 2)}</span>}
                  {favorite.note && <span>{favorite.note}</span>}
                  {favorite.usedCount > 0 && (
                    <span
                      title={
                        favorite.lastUsedAt
                          ? t("fav.lastUsed", { when: formatWhen(favorite.lastUsedAt) })
                          : undefined
                      }
                    >
                      {favorite.usedCount}×
                    </span>
                  )}
                </div>
              </div>
              <button
                className="icon-btn"
                title={t("common.run")}
                onClick={(e) => {
                  e.stopPropagation();
                  void store().runFavorite(favorite.id, true);
                }}
              >
                ▶
              </button>
            </div>
          );
        })}
      </div>

      <div className="panel-foot">
        <span>{tp("fav.count", favorites.length)}</span>
        <span style={{ flex: 1 }} />
        <button
          className="outline"
          onClick={() => {
            // Etkin sekmenin klasörünü hazır getiriyoruz: favorilerin çoğu
            // belirli bir klasöre bağlı oluyor.
            const cwd = store().activeSession()?.cwd ?? "";
            setForm({ ...EMPTY, cwd });
          }}
        >
          {t("fav.newButton")}
        </button>
      </div>

      {menu.state && <ContextMenu state={menu.state} onClose={menu.close} />}
    </>
  );
}
