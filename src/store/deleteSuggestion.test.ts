// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryEntry, HistoryFilter, HistoryPage } from "../types";

/**
 * Öneri panelinden komutu geçmişten silme (`deleteSuggestionAt`).
 *
 * BİLDİRİLEN İSTEK: "terminal geçmişini yukarı ok tuşuna basınca
 * gösteriyoruz, istemediklerimizi oradan kaldırabilmeliyiz."
 *
 * Burada bağlanan üç şey var ve üçü de sessizce bozulabilir:
 *
 * 1. KAPSAM. Panel "bu sekme"yi gösteriyorken silmek öteki sekmenin kaydına
 *    dokunmamalı — sekmelerin geçmişi birbirinden bağımsız. Ters yönde de:
 *    "tüm sekmeler" derken bir sekmede kalan kayıt, komutu geri getirir.
 * 2. DİSK. Yalnızca bellekteki listeden silmek komutu bir sonraki açılışta
 *    geri getirirdi; silinen kimlikler de TAM eşleşme olmalı (`ls` silinirken
 *    `ls -la` gitmemeli).
 * 3. PANEL. Silmeden sonra açık kalıyor, seçim yerinde; boşalınca kapanıyor.
 *
 * Onayın kendisi (sorulması, vazgeçince silinmemesi) `deleteConfirm.test.ts`
 * içinde; burada onay hep "evet".
 */

/** Diskteki geçmiş. Sorgu gerçek Rust süzgecini taklit ediyor. */
let disk: HistoryEntry[] = [];
const historyQuery = vi.fn(async (filter: HistoryFilter): Promise<HistoryPage> => {
  const entries = disk.filter(
    (e) =>
      (!filter.tabId || e.tabId === filter.tabId) &&
      (!filter.command || e.command === filter.command),
  );
  return { entries, total: entries.length, grandTotal: disk.length };
});
const historyDelete = vi.fn(async (ids: string[]) => {
  const before = disk.length;
  disk = disk.filter((e) => !ids.includes(e.id));
  return before - disk.length;
});

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      historyQuery: (filter: HistoryFilter) => historyQuery(filter),
      historyDelete: (ids: string[]) => historyDelete(ids),
      favoritesList: async () => [],
      saveWorkspace: async () => {},
      saveSettings: async () => {},
    } as Record<string, unknown>,
    // Testin ilgilenmediği her çağrı sessizce başarılı olsun.
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("./useStore");
const { setLanguage } = await import("../lib/i18n");

const TAB = "t1";
const OTHER = "t2";

function record(id: string, command: string, tabId: string): HistoryEntry {
  return {
    id,
    command,
    tabId,
    groupId: "g1",
    profileId: "p1",
    cwd: null,
    startedAt: 0,
    durationMs: null,
    exitCode: 0,
    source: "integration",
  };
}

function tab(id: string) {
  return {
    id,
    title: id,
    customTitle: id,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

/**
 * Belleği diskten kurar — `loadSuggestHistory`nin yaptığı gibi, en yeni önce.
 * Disk sırası eskiden yeniye; bellek tersine.
 */
function seed(records: HistoryEntry[]) {
  disk = records;
  useStore.setState({
    suggestHistory: [...records]
      .reverse()
      .map((e) => ({ command: e.command, cwd: e.cwd, tabId: e.tabId })),
  });
}

let asked = 0;

beforeEach(() => {
  setLanguage("tr");
  historyQuery.mockClear();
  historyDelete.mockClear();
  asked = 0;
  const state = useStore.getState();
  useStore.setState({
    groups: [
      {
        id: "g1",
        name: "g1",
        color: null,
        icon: null,
        collapsed: false,
        favorite: false,
        ungrouped: false,
        defaultProfileId: null,
        defaultCwd: null,
        env: {},
        activeTabId: TAB,
        tabs: [tab(TAB), tab(OTHER)],
      },
    ],
    activeGroupId: "g1",
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, appSuggestions: true },
    },
    ui: { ...state.ui, suggest: null, toast: null },
    askConfirm: async () => {
      asked += 1;
      return true;
    },
  });
});

const suggest = () => useStore.getState().ui.suggest;
const remembered = () => useStore.getState().suggestHistory.map((e) => `${e.tabId}:${e.command}`);

describe("kapsam", () => {
  it("bu sekmenin panelinde silmek yalnızca bu sekmenin kayıtlarını siliyor", async () => {
    // A'da yanlış yerde çalıştırılmış bir komutu temizlemek B'nin yukarı
    // okunu değiştirmemeli (bkz. `noteCommand` — aynı garanti).
    seed([
      record("h1", "npm test", TAB),
      record("h2", "npm test", OTHER),
      record("h3", "git status", TAB),
      record("h4", "npm test", TAB),
    ]);
    useStore.getState().openHistorySuggestions();
    expect(suggest()!.items).toEqual(["npm test", "git status"]);

    await useStore.getState().deleteSuggestionAt(0);

    expect(asked).toBe(1);
    expect(historyDelete).toHaveBeenCalledWith(["h1", "h4"]);
    expect(disk.map((e) => e.id), "öteki sekmenin kaydı gitmiş").toEqual(["h2", "h3"]);
    expect(remembered()).toEqual([`${TAB}:git status`, `${OTHER}:npm test`]);
    expect(suggest()!.items).toEqual(["git status"]);
  });

  it("tüm sekmeler kapsamında komutun bütün kayıtları siliniyor", async () => {
    seed([record("h1", "npm test", TAB), record("h2", "npm test", OTHER), record("h3", "ls", OTHER)]);
    useStore.getState().openHistorySuggestions("all");
    expect(suggest()!.items).toEqual(["ls", "npm test"]);

    await useStore.getState().deleteSuggestionAt(1);

    expect(historyDelete).toHaveBeenCalledWith(["h1", "h2"]);
    expect(remembered()).toEqual([`${OTHER}:ls`]);
    expect(suggest()!.items).toEqual(["ls"]);
    expect(suggest()!.scope, "kapsam korunmalı").toBe("all");
  });

  it("yazarken gelen listede silmek bütün sekmeleri kapsıyor", async () => {
    // O liste sekmeye göre süzülmüyor; bir sekmede kalan kayıt komutu aynı
    // listeye hemen geri getirirdi.
    seed([record("h1", "npm run dev", OTHER), record("h2", "npm test", TAB)]);
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()!.kind).toBe("history");

    await useStore.getState().deleteSuggestionAt(1);

    expect(historyQuery.mock.calls[0][0]).toMatchObject({ tabId: null, command: "npm run dev" });
    expect(suggest()!.items).toEqual(["npm test"]);
    expect(suggest()!.input, "yazılan ön ek korunmalı").toBe("npm");
  });

  it("disk başka komutlar da döndürse yalnızca TAM eşleşen kimlikler siliniyor", async () => {
    // Silme geri alınamıyor. Süzgeci tanımayan bir ikili (sıcak yenilemede
    // eski Rust derlemesi) kapsamın tamamını döndürür; `ls` silinirken
    // `ls -la` gitmemeli.
    seed([record("h1", "ls", TAB), record("h2", "ls -la", TAB), record("h3", "LS", TAB)]);
    historyQuery.mockImplementationOnce(async () => ({ entries: disk, total: 3, grandTotal: 3 }));
    useStore.getState().openHistorySuggestions();
    const index = suggest()!.items.indexOf("ls");

    await useStore.getState().deleteSuggestionAt(index);

    expect(historyDelete).toHaveBeenCalledWith(["h1"]);
    expect(remembered()).toEqual([`${TAB}:LS`, `${TAB}:ls -la`]);
  });

  it("diskte olmayan komut da listeden düşüyor", async () => {
    // Bellekte var, diskte yok (kayıt isteği düşmüş olabilir): silinecek bir
    // kimlik yok ama satır yine gitmeli.
    seed([]);
    useStore.setState({ suggestHistory: [{ command: "echo hayalet", cwd: null, tabId: TAB }] });
    useStore.getState().openHistorySuggestions();

    await useStore.getState().deleteSuggestionAt(0);

    expect(historyDelete, "silinecek kimlik yokken çağrı gitmemeli").not.toHaveBeenCalled();
    expect(remembered()).toEqual([]);
  });
});

describe("panel", () => {
  it("açık kalıyor ve seçim aynı yerde", async () => {
    // İstenmeyenler çoğu zaman birden fazla; her silmeden sonra paneli
    // yeniden açtırmak işi uzatır.
    seed([record("h1", "c", TAB), record("h2", "b", TAB), record("h3", "a", TAB)]);
    useStore.getState().openHistorySuggestions();
    useStore.getState().moveSuggestion(1);
    expect(suggest()!.items[suggest()!.index]).toBe("b");

    await useStore.getState().deleteSuggestionAt(1);
    expect(suggest()!.items).toEqual(["a", "c"]);
    expect(suggest()!.index, "seçim bir sonraki komuta geçmeli").toBe(1);

    await useStore.getState().deleteSuggestionAt(1);
    expect(suggest()!.items).toEqual(["a"]);
    expect(suggest()!.index, "seçim listenin dışında kalmamalı").toBe(0);

    await useStore.getState().deleteSuggestionAt(0);
    expect(suggest(), "liste boşalınca panel kapanmalı").toBe(null);
  });

  it("başka bir satır silinince seçim AYNI komutta kalıyor", async () => {
    // Fareyle seçili olmayan bir satırın çarpısına basılabiliyor. Yalnızca
    // konum korunsaydı seçim, alttaki satırın kaymasıyla başka bir komuta
    // geçerdi — düzenekte görüldü: `git pull` seçiliyken `npm test` silindi,
    // seçim `npm run build`e atladı.
    seed([record("h1", "d", TAB), record("h2", "c", TAB), record("h3", "b", TAB), record("h4", "a", TAB)]);
    useStore.getState().openHistorySuggestions();
    for (let i = 0; i < 3; i++) useStore.getState().moveSuggestion(1);
    expect(suggest()!.items[suggest()!.index]).toBe("d");

    await useStore.getState().deleteSuggestionAt(1);
    expect(suggest()!.items).toEqual(["a", "c", "d"]);
    expect(suggest()!.items[suggest()!.index]).toBe("d");
  });

  it("bu sekme boşalınca tüm geçmişe DÖNÜŞMÜYOR, kapanıyor", async () => {
    // Az önce bakılan liste sessizce başka bir listeye dönüşmemeli; yeni
    // sekmedeki düşüş yukarı ok yeniden basılınca oluyor.
    seed([record("h1", "yarn build", OTHER), record("h2", "gti status", TAB)]);
    useStore.getState().openHistorySuggestions();
    expect(suggest()!.items).toEqual(["gti status"]);

    await useStore.getState().deleteSuggestionAt(0);
    expect(suggest()).toBe(null);
  });

  it("silinen komut bir sonraki eski komuta yer açıyor", async () => {
    // Panel en fazla beş komut gösteriyor; silinenin yerini altıncı almalı,
    // yoksa liste yeniden açılana kadar eksik kalır.
    seed(["k6", "k5", "k4", "k3", "k2", "k1"].map((c, i) => record(`h${i}`, c, TAB)));
    useStore.getState().openHistorySuggestions();
    expect(suggest()!.items).toEqual(["k1", "k2", "k3", "k4", "k5"]);

    await useStore.getState().deleteSuggestionAt(0);
    expect(suggest()!.items).toEqual(["k2", "k3", "k4", "k5", "k6"]);
  });

  it("onay beklerken panel kapandıysa yeniden açılmıyor", async () => {
    // Örnek: başka bir sekmede komut başladı ve paneli kapattı.
    seed([record("h1", "npm test", TAB), record("h2", "git status", TAB)]);
    useStore.getState().openHistorySuggestions();
    useStore.setState({
      askConfirm: async () => {
        useStore.getState().closeSuggestions();
        return true;
      },
    });

    await useStore.getState().deleteSuggestionAt(0);
    expect(historyDelete).toHaveBeenCalled();
    expect(suggest()).toBe(null);
  });

  it("onay kapanınca odak kaldığı yere dönüyor", async () => {
    // Onay penceresi odağı kendi düğmesine alıyor; dönülmezse kullanıcı
    // yazmaya devam ettiğinde harfler hiçbir yere gitmiyor.
    const box = document.createElement("textarea");
    const dialogButton = document.createElement("button");
    document.body.append(box, dialogButton);
    box.focus();
    seed([record("h1", "npm test", TAB)]);
    useStore.getState().openHistorySuggestions();
    useStore.setState({
      askConfirm: async () => {
        dialogButton.focus();
        return false;
      },
    });

    await useStore.getState().deleteSuggestionAt(0);
    expect(document.activeElement).toBe(box);
    box.remove();
    dialogButton.remove();
  });
});

describe("yapılmaması gerekenler", () => {
  it("klasör önerilerinde hiçbir şey yapmıyor", async () => {
    // O satırlar diskteki klasörler, geçmiş değil.
    const ui = useStore.getState().ui;
    useStore.setState({ ui: { ...ui, suggest: { items: ["cd src"], index: 0, input: "cd ", kind: "dirs" } } });

    await useStore.getState().deleteSuggestionAt(0);
    expect(asked, "soru sorulmamalı").toBe(0);
    expect(historyQuery).not.toHaveBeenCalled();
    expect(suggest()!.items).toEqual(["cd src"]);
  });

  it("sekme bilinmiyorsa bu sekme silmesi TÜM geçmişe dönüşmüyor", async () => {
    // `tabId: null` süzgeçsiz demek; kapsamı kaybetmek "bu sekmeden sil"
    // isteğini bütün sekmelere yayardı.
    seed([record("h1", "npm test", TAB)]);
    useStore.getState().openHistorySuggestions();
    useStore.setState({ groups: [], activeGroupId: null });

    await useStore.getState().deleteSuggestionAt(0);
    expect(historyQuery).not.toHaveBeenCalled();
    expect(historyDelete).not.toHaveBeenCalled();
  });

  it("disk silmesi düşerse liste olduğu gibi kalıyor ve hata söyleniyor", async () => {
    seed([record("h1", "npm test", TAB)]);
    historyDelete.mockRejectedValueOnce(new Error("disk dolu"));
    useStore.getState().openHistorySuggestions();

    await useStore.getState().deleteSuggestionAt(0);
    expect(remembered(), "diskte duran komut listeden düşmemeli").toEqual([`${TAB}:npm test`]);
    expect(suggest()!.items).toEqual(["npm test"]);
    expect(useStore.getState().ui.toast?.tone).toBe("err");
  });
});
