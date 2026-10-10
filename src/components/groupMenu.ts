import { t } from "../lib/i18n";
import { canDeleteGroup, lockedTabs } from "../lib/tabs";
import { useStore } from "../store/useStore";
import type { Group } from "../types";
import type { MenuEntry } from "./ContextMenu";

/**
 * Bir grubun sağ tık menüsü.
 *
 * İki yerden açılıyor: kenar çubuğundaki grup satırı (ve onun "⋯" düğmesi)
 * ile Kokpit'in grup rayındaki karo. Liste tek yerde: iki ayrı liste, birine
 * eklenen eylemin ötekinde unutulması demek.
 *
 * Adlandırma ve renk çağırana bırakılıyor — kutunun ve seçicinin NEREDE
 * açılacağı menünün açıldığı yere bağlı (kenar çubuğunda satırın içinde,
 * rayda karonun yanında).
 */
export function groupMenu(
  group: Group,
  options: {
    groups: Group[];
    /** "Bu gruba yeni sekme" satırında gösterilen kısayol. */
    newTabHint: string;
    rename: () => void;
    changeColor: () => void;
    /**
     * Çift tık adı değiştiriyor mu — menü satırı bunu ipucu olarak söylüyor.
     * Kenar çubuğunda evet; Kokpit rayında hayır (gerekçe `GroupRail`).
     */
    doubleClickRenames: boolean;
    /**
     * Katlama satırları. Kokpit'te yok: sütun yalnızca etkin grubu
     * gösteriyor, katlanmış grubu da açık çiziyor ve katlama oku gizli —
     * satırlar hiçbir şey yapmazdı.
     */
    collapse?: { allCollapsed: boolean };
  },
): MenuEntry[] {
  const store = useStore.getState;
  const { groups, collapse } = options;
  const index = groups.findIndex((g) => g.id === group.id);
  const collapseEntries: MenuEntry[] = collapse
    ? [
        {
          kind: "item",
          label: t(group.collapsed ? "group.expand" : "group.collapse"),
          run: () => store().updateGroup(group.id, { collapsed: !group.collapsed }),
        },
        {
          kind: "item",
          label: t(collapse.allCollapsed ? "group.expandAll" : "group.collapseAll"),
          run: () => store().toggleAllCollapsed(),
        },
      ]
    : [];

  return [
    {
      kind: "item",
      label: t("common.rename"),
      hint: options.doubleClickRenames ? t("common.doubleClick") : undefined,
      run: options.rename,
    },
    {
      kind: "item",
      label: t(group.favorite ? "group.removeFavoriteMenu" : "group.addFavoriteMenu"),
      run: () => store().toggleGroupFavorite(group.id),
    },
    { kind: "item", label: t("group.changeColor"), run: options.changeColor },
    {
      kind: "item",
      label: t("group.settings"),
      run: () => store().setUi({ settingsOpen: true, editingGroupId: group.id }),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: t("group.newTabHere"),
      hint: options.newTabHint,
      run: () => store().addTab({ groupId: group.id }),
    },
    ...collapseEntries,
    { kind: "separator" },
    {
      kind: "item",
      label: t("common.moveUp"),
      // Gruplanmamış kova her zaman en üstte (bkz. `moveGroupTo`): hemen
      // altındaki grubu yukarı taşımak hiçbir şey yapmıyordu.
      disabled: index <= 0 || groups[index - 1].ungrouped === true,
      run: () => store().moveGroup(group.id, -1),
    },
    {
      kind: "item",
      label: t("common.moveDown"),
      disabled: index === groups.length - 1,
      run: () => store().moveGroup(group.id, 1),
    },
    { kind: "separator" },
    {
      kind: "item",
      label: canDeleteGroup(group)
        ? t("group.delete")
        : t("group.deleteLockedCount", { n: lockedTabs(group.tabs).length }),
      danger: true,
      disabled: groups.length <= 1 || !canDeleteGroup(group),
      // Onay deponun içinde: her silme yolu aynı soruyu soruyor.
      run: () => void store().deleteGroup(group.id),
    },
  ];
}
