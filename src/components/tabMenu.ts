import { t } from "../lib/i18n";
import { api } from "../lib/ipc";
import { groupLabel, hasCustomTitle } from "../lib/labels";
import { isLocked } from "../lib/tabs";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import type { MenuEntry } from "./ContextMenu";

/**
 * Dikey bir sekme listesindeki satırın sağ tık menüsü.
 *
 * İki yerden açılıyor: kenar çubuğunun sekme satırı (Kokpit'te sekme kartı) ve
 * Kokpit rayındaki sekme ağacı. Liste tek yerde, `groupMenu` ile aynı
 * gerekçeyle: iki ayrı liste, birine eklenen eylemin ötekinde unutulması
 * demek. Sekme şeridininki ayrı kalıyor — orada sıra yatay ("Sola taşı") ve
 * "Diğerlerini kapat" var.
 *
 * Adlandırma çağırana bırakılıyor: kutunun NEREDE açılacağı menünün açıldığı
 * yere bağlı (kartta satırın içinde, rayda satırın yanında).
 */
export function tabMenu(
  group: Group,
  tab: TabState,
  index: number,
  options: {
    groups: Group[];
    rename: () => void;
    /**
     * Çift tık adı değiştiriyor mu — menü satırı bunu ipucu olarak söylüyor.
     * Kartta evet; rayın ağacında hayır (gerekçe `GroupRail`).
     */
    doubleClickRenames: boolean;
  },
): MenuEntry[] {
  const store = useStore.getState;
  const others = options.groups.filter((g) => g.id !== group.id);
  return [
    {
      kind: "item",
      label: t("menu.rename"),
      hint: options.doubleClickRenames ? t("common.doubleClick") : undefined,
      run: options.rename,
    },
    ...(hasCustomTitle(tab)
      ? [
          {
            kind: "item" as const,
            label: t("menu.resetName"),
            run: () => store().updateTab(tab.id, { customTitle: null }),
          },
        ]
      : []),
    { kind: "separator" },
    {
      kind: "item",
      label: t(isLocked(tab) ? "menu.unlock" : "menu.lock"),
      run: () => store().toggleTabLock(tab.id),
    },
    { kind: "separator" },
    { kind: "item", label: t("common.restartShell"), run: () => void store().restartTab(tab.id) },
    ...(tab.cwd
      ? [
          {
            kind: "item" as const,
            label: t("common.revealFolder"),
            run: () => void api.revealInExplorer(tab.cwd!).catch(() => {}),
          },
        ]
      : []),
    { kind: "separator" },
    {
      kind: "item",
      label: t("common.moveUp"),
      disabled: index === 0,
      run: () => store().moveTab(tab.id, -1),
    },
    {
      kind: "item",
      label: t("common.moveDown"),
      disabled: index === group.tabs.length - 1,
      run: () => store().moveTab(tab.id, 1),
    },
    ...(others.length > 0
      ? [
          { kind: "separator" as const },
          {
            // Alt menu: on bes grubu olan kullanicida duz liste menuyu
            // uzatip "Sekmeyi kapat"i ekran disina itiyordu.
            kind: "submenu" as const,
            label: t("menu.moveToGroup"),
            entries: others.map((g) => ({
              kind: "item" as const,
              // Gruplanmamış kovanın kayıtlı adı yok; etiketi çeviriden
              // geliyor. Bu satır aynı zamanda bir sekmeyi gruptan
              // ÇIKARMANIN yolu.
              label: groupLabel(g),
              run: () => store().moveTabToGroup(tab.id, g.id),
            })),
          },
        ]
      : []),
    { kind: "separator" },
    {
      kind: "item",
      label: t(isLocked(tab) ? "menu.closeTabLocked" : "menu.closeTab"),
      danger: true,
      disabled: isLocked(tab),
      run: () => void store().closeTab(tab.id),
    },
  ];
}
