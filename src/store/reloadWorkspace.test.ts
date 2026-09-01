import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/ipc";
import { useStore } from "./useStore";
import type { Bootstrap, Group, TabState } from "../types";

/**
 * İçe aktarmadan sonra sekmede kabuk kalmıyordu.
 *
 * BİLDİRİLEN HATA: "içe aktar yaptıktan sonra sekmelerden birisinde dotnet run
 * dedim, etkin terminal yok diye bir yazı geldi".
 *
 * `reloadWorkspace` bütün oturumları kapatıyor, sonra `TerminalArea`nın
 * barındırıcıları yeniden kurup oturum yaratmasını bekliyor. Ama barındırıcı
 * React'e `tabId:epoch` anahtarıyla tanıtılıyor: epoch'ları SIFIRLAMAK, hiç
 * yeniden başlatılmamış bir sekmede (epoch zaten 0) anahtarı değiştirmiyor.
 * Barındırıcı yerinde kalıyor, oturum yaratan etki yeniden koşmuyor ve sekme
 * arkasında kabuk olmadan canlı görünüyor.
 *
 * Belirtinin bazı sekmelerde çıkıp bazılarında çıkmamasının sebebi de buydu:
 * daha önce yeniden başlatılmış bir sekmenin epoch'u 1+ olduğu için sıfırlama
 * onu kazara düzeltiyordu.
 */

function tab(id: string): TabState {
  return {
    id,
    title: id,
    customTitle: null,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(id: string, tabs: TabState[]): Group {
  return {
    id,
    name: id,
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: tabs[0]?.id ?? null,
    tabs,
  };
}

/** `bootstrap()` gerçek bir Tauri çağrısı; içe aktarma sonrası hâli taklit ediyoruz. */
function mockBootstrap(groups: Group[]) {
  const state = useStore.getState();
  return vi.spyOn(api, "bootstrap").mockResolvedValue({
    settings: state.settings,
    workspace: { version: 1, activeGroupId: groups[0]?.id ?? null, groups, savedAt: 0 },
    paths: {
      root: "",
      settingsFile: "",
      workspaceFile: "",
      historyFile: "",
      scrollbackDir: "",
      integrationDir: "",
      portable: false,
    },
    appVersion: "0.1.0",
    restored: true,
    windowsBuild: 22631,
    platform: "windows",
    fileManager: "Gezgin",
    fileManagerEn: "Explorer",
  } satisfies Bootstrap);
}

afterEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ groups: [], activeGroupId: null, sessionEpoch: {} });
});

describe("içe aktarmadan sonra çalışma alanının yeniden yüklenmesi", () => {
  it("kalan sekmelerin epoch'u artıyor — barındırıcı yeniden kuruluyor", async () => {
    const kalanlar = [group("g1", [tab("t1"), tab("t2")])];
    useStore.setState({ groups: kalanlar, activeGroupId: "g1", sessionEpoch: {} });
    mockBootstrap(kalanlar);

    await useStore.getState().reloadWorkspace();

    const epoch = useStore.getState().sessionEpoch;
    // Sıfır kalsaydı React anahtarı değişmez, oturum hiç yaratılmazdı.
    expect(epoch.t1, "t1 barındırıcısı yenilenmiyor").toBe(1);
    expect(epoch.t2, "t2 barındırıcısı yenilenmiyor").toBe(1);
  });

  it("daha önce yeniden başlatılmış sekme de ilerliyor", async () => {
    // Eski davranışta bu sekme 3'ten 0'a düşüyordu; anahtar değiştiği için
    // kazara ÇALIŞIYORDU. Artırma ikisini de aynı yoldan geçiriyor.
    const kalanlar = [group("g1", [tab("t1")])];
    useStore.setState({ groups: kalanlar, activeGroupId: "g1", sessionEpoch: { t1: 3 } });
    mockBootstrap(kalanlar);

    await useStore.getState().reloadWorkspace();

    expect(useStore.getState().sessionEpoch.t1).toBe(4);
  });

  it("çalışma durumu temizleniyor", async () => {
    // Kapatılan oturumların "çalışıyor" bayrağı kalırsa durum çubuğu ve
    // sunucu şeridi olmayan bir komutu gösterir.
    const kalanlar = [group("g1", [tab("t1")])];
    useStore.setState({
      groups: kalanlar,
      activeGroupId: "g1",
      sessionEpoch: {},
      running: { t1: true },
      exited: { t1: true },
    });
    mockBootstrap(kalanlar);

    await useStore.getState().reloadWorkspace();

    expect(useStore.getState().running).toEqual({});
    expect(useStore.getState().exited).toEqual({});
  });

  it("içe aktarmayla gelen yeni sekmeler epoch taşımıyor", async () => {
    // Yeni kimlik = yeni anahtar; barındırıcı zaten ilk kez kuruluyor.
    useStore.setState({ groups: [group("g1", [tab("eski")])], activeGroupId: "g1", sessionEpoch: {} });
    mockBootstrap([group("g2", [tab("yeni")])]);

    await useStore.getState().reloadWorkspace();

    const epoch = useStore.getState().sessionEpoch;
    expect(epoch.yeni, "yeni sekmeye gereksiz epoch verilmiş").toBeUndefined();
  });
});
