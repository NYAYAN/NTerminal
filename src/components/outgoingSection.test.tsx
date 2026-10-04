// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { GitCommitSummary, GitInfo, GitOutgoing, Group, TabState } from "../types";
import { ContextBar } from "./ContextBar";
import { GitChanges } from "./GitChanges";

/**
 * Gönderilecek commit'ler ve Değişiklikler paneline commit'ten sonraki giriş.
 *
 * BİLDİRİLEN: "Commit ettikten sonra ilgili terminal sekmesinde değişiklikleri
 * görebileceğim bir buton yok, push etmek istiyorum ama değişiklikler kısmını
 * açamadığım için push edemiyorum. Birde push edeceğim içeriği de görmem
 * gerekmez mi? hangi commitler var diye."
 *
 * İki ayrı eksik: (1) bağlam şeridindeki rozet yalnızca `± N` iken çiziliyordu,
 * commit listeyi boşaltınca panelin tek girişi de gidiyordu; (2) panel "N commit
 * gönderilmedi" diyor ama hangileri olduğunu göstermiyordu.
 *
 * Git'in kendisi (hangi commit'ler gidecek, birleştirmenin hangi ebeveyne göre
 * anlatıldığı) Rust testlerinde gerçek depolarla sınanıyor. Burada bağlanan
 * arayüzün payı: bölümün yalnızca gönderilecek bir şey varken çizilmesi,
 * dosyaların ve farkın YALNIZCA açılınca istenmesi, hatanın "commit yok" diye
 * yutulmaması ve rozetin commit'ten sonra kaybolmaması.
 */

const CWD = "/depo";

function tab(): TabState {
  return {
    id: "t1",
    title: "t1",
    customTitle: null,
    profileId: "p1",
    cwd: CWD,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(): Group {
  return {
    id: "g1",
    name: "Grup",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: "t1",
    tabs: [tab()],
  };
}

/** Commit'lenmiş, gönderilmemiş iki commit'i olan temiz bir ağaç. */
function repo(patch: Partial<GitInfo> = {}): GitInfo {
  return {
    branch: "main",
    detached: false,
    ahead: 2,
    behind: 0,
    upstream: "origin/main",
    unborn: false,
    staged: 0,
    stashCount: 0,
    changes: [],
    root: CWD,
    ...patch,
  };
}

const C1: GitCommitSummary = {
  id: "a".repeat(40),
  short: "aaaaaaa",
  author: "Nurullah YAYAN",
  time: 1790709222,
  subject: "Terminal PTY'nin alt sınırının altına küçülmüyor",
};
const C2: GitCommitSummary = {
  id: "b".repeat(40),
  short: "bbbbbbb",
  author: "Nurullah YAYAN",
  time: 1790700000,
  subject: "Stash: klasör yolu ayara uyuyor",
};

function seed(info: GitInfo | null = repo(), open = true) {
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: info ? { [CWD]: info } : {},
    ui: {
      ...useStore.getState().ui,
      outgoingOpen: open,
      stashOpen: false,
      historyOpen: false,
      panelMode: "history",
      gitExpanded: [],
    },
  });
}

let outgoing: ReturnType<typeof vi.fn>;

function listeSoyle(data: GitOutgoing) {
  outgoing = vi.spyOn(api, "gitOutgoing").mockResolvedValue(data) as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  listeSoyle({ commits: [C1, C2], total: 2 });
  // Bağlam şeridinin kendi tazelemeleri bu testin konusu değil.
  useStore.setState({
    refreshGit: vi.fn(async () => {}),
    pollGit: vi.fn(async () => {}),
    refreshNode: vi.fn(async () => {}),
  });
});

afterEach(async () => {
  await act(async () => {});
  cleanup();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});

async function panel(info: GitInfo | null = repo(), open = true) {
  seed(info, open);
  const view = render(<GitChanges />);
  await flush();
  return view;
}

const bolum = (v: HTMLElement) => v.querySelector<HTMLElement>(".outgoing-section");
const satirlar = (v: HTMLElement) =>
  [...v.querySelectorAll<HTMLElement>(".outgoing-section .git-item")];
const baslik = (satir: HTMLElement) => satir.querySelector<HTMLButtonElement>(".git-head .git-row")!;

describe("gönderilecek commit'ler", () => {
  it("karma, ileti, yazar ve zamanla listeleniyor", async () => {
    const { container } = await panel();

    expect(outgoing).toHaveBeenCalledWith(CWD);
    const l = satirlar(container);
    expect(l).toHaveLength(2);
    expect(l[0].querySelector(".outgoing-hash")!.textContent).toBe("aaaaaaa");
    expect(l[0].querySelector(".outgoing-subject")!.textContent).toBe(C1.subject);
    expect(l[0].querySelector(".outgoing-meta")!.textContent).toContain("Nurullah YAYAN");
    // Başlıktaki sayı Push düğmesindekiyle aynı kaynaktan (`ahead`).
    expect(container.querySelector(".outgoing-section-head .pill-count")!.textContent).toBe("2");
  });

  it("gönderilecek bir şey yoksa bölüm yok ve liste istenmiyor", async () => {
    const { container } = await panel(repo({ ahead: 0 }));
    expect(bolum(container)).toBe(null);
    expect(outgoing).not.toHaveBeenCalled();
  });

  it("ayrık HEAD'de bölüm yok", async () => {
    const { container } = await panel(repo({ detached: true, upstream: null, branch: "HEAD" }));
    expect(bolum(container)).toBe(null);
  });

  it("dal uzakta yoksa (yayınla) bölüm var, sayaç yok", async () => {
    // `ahead` yukarı akışa göre; yayınlanacak dalda anlamı yok — sayı listeden.
    const { container } = await panel(repo({ upstream: null, ahead: 0 }));
    expect(bolum(container)).not.toBe(null);
    expect(container.querySelector(".outgoing-section-head .pill-count")).toBe(null);
    expect(satirlar(container)).toHaveLength(2);
  });

  it("başlık açıp kapatıyor; kapalıyken liste istenmiyor", async () => {
    const { container } = await panel(repo(), false);
    expect(outgoing).not.toHaveBeenCalled();
    expect(satirlar(container)).toHaveLength(0);

    fireEvent.click(container.querySelector(".outgoing-toggle")!);
    await flush();
    expect(useStore.getState().ui.outgoingOpen).toBe(true);
    expect(satirlar(container)).toHaveLength(2);
  });

  it("commit'e tıklayınca dosyaları, dosyaya tıklayınca farkı — yalnızca açılınca", async () => {
    const files = vi.spyOn(api, "gitCommitFiles").mockResolvedValue({
      files: [{ status: "R ", path: "b.txt", untracked: false, origPath: "a.txt" }],
      total: 1,
    });
    const diff = vi
      .spyOn(api, "gitCommitDiff")
      .mockResolvedValue("diff --git a/a.txt b/b.txt\n--- a/a.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-eski\n+yeni\n");
    const { container } = await panel();
    expect(files).not.toHaveBeenCalled();

    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();
    expect(files).toHaveBeenCalledWith(CWD, C1.id);
    expect(diff).not.toHaveBeenCalled();

    const dosya = container.querySelector<HTMLButtonElement>(".stash-file .git-row")!;
    expect(dosya.textContent).toContain("b.txt");
    fireEvent.click(dosya);
    await flush();
    // Yeniden adlandırmada eski yol da gidiyor: git eşleşmeyi ancak öyle görüyor.
    expect(diff).toHaveBeenCalledWith(CWD, C1.id, "b.txt", "a.txt");
    expect(container.querySelector(".stash-file.open")!.textContent).toContain("yeni");
  });

  it("dosyasız commit bunu söylüyor", async () => {
    vi.spyOn(api, "gitCommitFiles").mockResolvedValue({ files: [], total: 0 });
    const { container } = await panel();
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();
    expect(container.textContent).toContain("Bu commit'te dosya değişikliği yok");
  });

  it("okuma hatası 'commit yok' diye yutulmuyor", async () => {
    // Eski bir Rust derlemesi: komut yok. Boş liste "gönderilecek bir şey yok"
    // derdi ve kullanıcı Push'un boşa olduğunu sanardı.
    vi.spyOn(api, "gitOutgoing").mockRejectedValue("Command git_outgoing not found");
    const { container } = await panel();
    const hata = container.querySelector(".outgoing-section .git-commit-error")!;
    expect(hata.textContent).toContain("Gönderilecek commit'ler okunamadı");
    expect(hata.textContent).toContain("git_outgoing not found");
    expect(container.textContent).not.toContain("Gönderilecek yeni commit yok");
  });

  it("kesilen liste kalanını söylüyor", async () => {
    listeSoyle({ commits: [C1], total: 3 });
    const { container } = await panel(repo({ ahead: 3 }));
    expect(container.textContent).toContain("… ve 2 commit daha");
  });

  it("yayınlanacak dalda yeni commit yoksa bunu söylüyor", async () => {
    listeSoyle({ commits: [], total: 0 });
    const { container } = await panel(repo({ upstream: null, ahead: 0 }));
    expect(container.textContent).toContain("Gönderilecek yeni commit yok");
  });

  it("git durumu tazelenince liste yeniden okunuyor", async () => {
    // Commit atınca, push edince ya da terminalden `--amend` yapınca durum
    // tazeleniyor; liste ayrı bir yoklama olmadan onu izliyor.
    await panel();
    expect(outgoing).toHaveBeenCalledTimes(1);
    await act(async () => {
      useStore.setState({ gitInfo: { [CWD]: repo({ ahead: 3 }) } });
    });
    expect(outgoing).toHaveBeenCalledTimes(2);
  });
});

describe("bağlam şeridindeki rozet", () => {
  async function serit(info: GitInfo | null) {
    seed(info, false);
    const view = render(<ContextBar />);
    await flush();
    return view;
  }
  const rozet = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".ctx-chip.changes");

  it("değişiklik yokken de duruyor: ± 0, nötr, tıklayınca paneli açıyor", async () => {
    // İSTEK: "değişikliğim yoksa da 0 yazsın, tıklayınca değişiklikler kısmını
    // açabileyim."
    const { container } = await serit(repo({ ahead: 0, changes: [] }));
    const r = rozet(container)!;
    expect(r.textContent).toBe("± 0");
    expect(r.dataset.empty, "sıfırken vurgu rengi 'değişiklik var' diye okunur").toBe("1");

    fireEvent.click(r);
    const ui = useStore.getState().ui;
    expect(ui.historyOpen).toBe(true);
    expect(ui.panelMode).toBe("git");
  });

  it("commit'ten sonra gönderilmemiş commit varken ± 0, ipucu söylüyor, bölümü açıyor", async () => {
    const { container } = await serit(repo({ ahead: 2, changes: [] }));
    const r = rozet(container)!;
    expect(r.textContent).toBe("± 0");
    expect(r.title).toContain("2 commit gönderilmedi");

    fireEvent.click(r);
    const ui = useStore.getState().ui;
    expect(ui.historyOpen).toBe(true);
    expect(ui.panelMode).toBe("git");
    // Kullanıcı bölümü kapatmış olsa da açılıyor: panele push için gelindi.
    expect(ui.outgoingOpen).toBe(true);
  });

  it("değişiklik varken ± N, vurgulu", async () => {
    const { container } = await serit(repo({ ahead: 2, changes: [{ status: " M", path: "a.ts" }] }));
    const r = rozet(container)!;
    expect(r.textContent).toBe("± 1");
    expect(r.dataset.empty).toBeUndefined();
  });

  it("depo değilse rozet yok", async () => {
    const { container } = await serit(null);
    expect(rozet(container)).toBe(null);
  });
});
