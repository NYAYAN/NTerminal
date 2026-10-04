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
 * Push'un onay paneli ve Değişiklikler paneline commit'ten sonraki giriş.
 *
 * BİLDİRİLEN: "Commit ettikten sonra ilgili terminal sekmesinde değişiklikleri
 * görebileceğim bir buton yok, push etmek istiyorum ama değişiklikler kısmını
 * açamadığım için push edemiyorum. Birde push edeceğim içeriği de görmem
 * gerekmez mi? hangi commitler var diye."
 *
 * İlk çözümde liste Değişiklikler'in başında ayrı bir bölümdü. İSTEK:
 * "Gönderilecek commitler push butonu üzerinde yer alması daha iyi olmaz mı?" —
 * IntelliJ'in Push penceresi gibi bir onay seçildi: Push'a basmak paneli açıyor,
 * gönderen paneldeki düğme.
 *
 * Git'in kendisi (hangi commit'ler gidecek, birleştirmenin hangi ebeveyne göre
 * anlatıldığı) Rust testlerinde gerçek depolarla sınanıyor. Burada bağlanan
 * arayüzün payı: Push düğmesinin GÖNDERMEDEN paneli açması, vazgeçmenin (düğme,
 * Esc, dışarı basmak) göndermemesi, dosyaların ve farkın YALNIZCA açılınca
 * istenmesi, hatanın "commit yok" diye yutulmaması ve rozetin commit'ten sonra
 * kaybolmaması.
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

function seed(info: GitInfo | null = repo()) {
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    // `null` = bakıldı ve depo değil (anahtarın yokluğu "henüz bakılmadı").
    gitInfo: { [CWD]: info },
    ui: {
      ...useStore.getState().ui,
      stashOpen: false,
      historyOpen: false,
      panelMode: "history",
      gitExpanded: [],
    },
  });
}

let outgoing: ReturnType<typeof vi.fn>;
let push: ReturnType<typeof vi.fn>;

function listeSoyle(data: GitOutgoing) {
  outgoing = vi.spyOn(api, "gitOutgoing").mockResolvedValue(data) as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  listeSoyle({ commits: [C1, C2], total: 2 });
  push = vi.spyOn(api, "gitPush").mockResolvedValue("origin/main") as unknown as ReturnType<typeof vi.fn>;
  vi.spyOn(api, "gitInfo").mockResolvedValue(repo({ ahead: 0 }));
  vi.spyOn(api, "gitFingerprint").mockResolvedValue("imza");
  // Bağlam şeridinin kendi tazelemeleri bu testin konusu değil.
  useStore.setState({
    toast: vi.fn(),
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

async function kutu(info: GitInfo | null = repo()) {
  seed(info);
  const view = render(<GitChanges />);
  await flush();
  return view;
}

const pushBtn = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".git-push")!;
const onay = (v: HTMLElement) => v.querySelector<HTMLElement>(".push-review");
const gonder = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".push-review-go")!;
const satirlar = (v: HTMLElement) => [...v.querySelectorAll<HTMLElement>(".push-review .git-item")];
const baslik = (satir: HTMLElement) => satir.querySelector<HTMLButtonElement>(".git-head .git-row")!;

/** Push düğmesine bas ve paneli bekle. */
async function ac(v: HTMLElement) {
  fireEvent.click(pushBtn(v));
  await flush();
}

describe("Push'un onay paneli", () => {
  it("Push düğmesi GÖNDERMİYOR, paneli açıyor; panelde commit'ler", async () => {
    const { container } = await kutu();
    expect(onay(container)).toBe(null);
    expect(outgoing, "panel açılmadan liste istendi").not.toHaveBeenCalled();

    await ac(container);

    expect(push, "onaysız gönderdi").not.toHaveBeenCalled();
    expect(onay(container)).not.toBe(null);
    expect(pushBtn(container).getAttribute("aria-expanded")).toBe("true");
    expect(outgoing).toHaveBeenCalledWith(CWD);
    const l = satirlar(container);
    expect(l).toHaveLength(2);
    expect(l[0].querySelector(".outgoing-hash")!.textContent).toBe("aaaaaaa");
    expect(l[0].querySelector(".outgoing-subject")!.textContent).toBe(C1.subject);
    expect(l[0].querySelector(".outgoing-meta")!.textContent).toContain("Nurullah YAYAN");
    // Başlık Push'un ipucuyla aynı: kaç commit nereye.
    expect(onay(container)!.querySelector(".push-review-head")!.textContent).toBe(
      "2 commit gönderilecek → origin/main",
    );
    // Odak paneldeki Push'ta: klavyeyle Enter göndermek demek.
    expect(document.activeElement).toBe(gonder(container));
  });

  it("paneldeki Push gönderiyor ve paneli kapatıyor", async () => {
    const { container } = await kutu();
    await ac(container);

    fireEvent.click(gonder(container));
    await flush();

    expect(push).toHaveBeenCalledWith(CWD);
    expect(onay(container)).toBe(null);
  });

  it("Vazgeç göndermeden kapatıyor", async () => {
    const { container } = await kutu();
    await ac(container);
    const vazgec = [...onay(container)!.querySelectorAll("button")].find(
      (b) => b.textContent === "Vazgeç",
    )!;

    fireEvent.click(vazgec);
    await flush();

    expect(onay(container)).toBe(null);
    expect(push).not.toHaveBeenCalled();
  });

  it("Esc göndermeden kapatıyor, odak Push düğmesine dönüyor", async () => {
    const { container } = await kutu();
    await ac(container);

    fireEvent.keyDown(window, { key: "Escape" });
    await flush();

    expect(onay(container)).toBe(null);
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(pushBtn(container));
  });

  it("dışarı basmak kapatıyor; Push düğmesi aç/kapa", async () => {
    const { container } = await kutu();
    await ac(container);
    fireEvent.mouseDown(document.body);
    await flush();
    expect(onay(container)).toBe(null);

    await ac(container);
    // Düğmeye basmak "dışarı" sayılmıyor: mousedown kapatıp click yeniden
    // açsaydı panel hiç kapanmazdı.
    fireEvent.mouseDown(pushBtn(container));
    fireEvent.click(pushBtn(container));
    await flush();
    expect(onay(container)).toBe(null);
    expect(push).not.toHaveBeenCalled();
  });

  it("panelin içine basmak kapatmıyor", async () => {
    const { container } = await kutu();
    await ac(container);
    fireEvent.mouseDown(satirlar(container)[0]);
    await flush();
    expect(onay(container)).not.toBe(null);
  });

  it("Değişiklikler listesinde ayrı bir bölüm YOK", async () => {
    // İlk hâlinde liste orada açılıp kapanan bir bölümdü; artık yalnızca panelde.
    const { container } = await kutu(repo({ changes: [{ status: " M", path: "a.ts" }] }));
    expect(container.querySelector(".outgoing-section")).toBe(null);
    expect(container.querySelector(".git-list .git-item .outgoing-subject")).toBe(null);
  });

  it("gönderilecek bir şey yoksa düğme kapalı, panel açılmıyor", async () => {
    const { container } = await kutu(repo({ ahead: 0, changes: [{ status: " M", path: "a.ts" }] }));
    expect(pushBtn(container).disabled).toBe(true);
    expect(onay(container)).toBe(null);
  });

  it("dal uzakta yoksa (yayınla) başlık ve düğme ona göre", async () => {
    const { container } = await kutu(repo({ upstream: null, ahead: 0 }));
    await ac(container);
    expect(onay(container)!.querySelector(".push-review-head")!.textContent).toContain(
      "yayınlanacak",
    );
    expect(gonder(container).textContent).toBe("Yayınla");
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
    const { container } = await kutu();
    await ac(container);
    expect(files).not.toHaveBeenCalled();

    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();
    expect(files).toHaveBeenCalledWith(CWD, C1.id);
    expect(diff).not.toHaveBeenCalled();

    const dosya = container.querySelector<HTMLButtonElement>(".push-review .stash-file .git-row")!;
    expect(dosya.textContent).toContain("b.txt");
    fireEvent.click(dosya);
    await flush();
    // Yeniden adlandırmada eski yol da gidiyor: git eşleşmeyi ancak öyle görüyor.
    expect(diff).toHaveBeenCalledWith(CWD, C1.id, "b.txt", "a.txt");
    expect(container.querySelector(".stash-file.open")!.textContent).toContain("yeni");
  });

  it("dosyasız commit bunu söylüyor", async () => {
    vi.spyOn(api, "gitCommitFiles").mockResolvedValue({ files: [], total: 0 });
    const { container } = await kutu();
    await ac(container);
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();
    expect(container.textContent).toContain("Bu commit'te dosya değişikliği yok");
  });

  it("okuma hatası 'commit yok' diye yutulmuyor", async () => {
    // Eski bir Rust derlemesi: komut yok. Boş liste "gönderilecek bir şey yok"
    // derdi ve kullanıcı ne gönderdiğini bilmeden onaylardı.
    vi.spyOn(api, "gitOutgoing").mockRejectedValue("Command git_outgoing not found");
    const { container } = await kutu();
    await ac(container);
    const hata = onay(container)!.querySelector(".git-commit-error")!;
    expect(hata.textContent).toContain("Gönderilecek commit'ler okunamadı");
    expect(hata.textContent).toContain("git_outgoing not found");
    expect(container.textContent).not.toContain("Gönderilecek yeni commit yok");
  });

  it("kesilen liste kalanını söylüyor", async () => {
    listeSoyle({ commits: [C1], total: 3 });
    const { container } = await kutu(repo({ ahead: 3 }));
    await ac(container);
    expect(onay(container)!.textContent).toContain("… ve 2 commit daha");
  });

  it("yayınlanacak dalda yeni commit yoksa bunu söylüyor", async () => {
    listeSoyle({ commits: [], total: 0 });
    const { container } = await kutu(repo({ upstream: null, ahead: 0 }));
    await ac(container);
    expect(onay(container)!.textContent).toContain("Gönderilecek yeni commit yok");
  });

  it("panel açıkken git durumu tazelenince liste yeniden okunuyor", async () => {
    // Terminalden `git commit --amend` ya da yeni bir commit: panel güncel kalmalı.
    const { container } = await kutu();
    await ac(container);
    expect(outgoing).toHaveBeenCalledTimes(1);
    await act(async () => {
      useStore.setState({ gitInfo: { [CWD]: repo({ ahead: 3 }) } });
    });
    expect(outgoing).toHaveBeenCalledTimes(2);
  });

  it("gönderilecek bir şey kalmayınca (terminalden itildi) panel kalkıyor", async () => {
    const { container } = await kutu(repo({ changes: [{ status: " M", path: "a.ts" }] }));
    await ac(container);
    await act(async () => {
      useStore.setState({ gitInfo: { [CWD]: repo({ ahead: 0, changes: [{ status: " M", path: "a.ts" }] }) } });
    });
    expect(onay(container)).toBe(null);
  });
});

/*
 * İSTEK: "push basınca açılan ekranda commit'i geri almak mümkün mü?" → "böyle
 * ekle": IntelliJ'in "Undo Commit"i gibi YALNIZCA son commit'te; içerik
 * kaybolmuyor (Rust yarısı `git_tests.rs`), ileti commit kutusuna dönüyor.
 */
describe("son commit'i geri almak", () => {
  const geriAl = (satir: HTMLElement) =>
    satir.querySelector<HTMLButtonElement>('.git-actions button[aria-label^="Commit\'i geri al"]');

  it("düğme yalnızca en üstteki (son) commit'te", async () => {
    const { container } = await kutu();
    await ac(container);
    const [ilk, ikinci] = satirlar(container);
    expect(geriAl(ilk)).not.toBe(null);
    expect(geriAl(ilk)!.title).toContain("değişiklikler silinmez");
    expect(geriAl(ikinci)).toBe(null);
  });

  it("geri alıyor, iletiyi boş commit kutusuna koyuyor, bildiriyor", async () => {
    const undo = vi.spyOn(api, "gitUndoCommit").mockResolvedValue("Başlık\n\nGövde");
    const toast = vi.fn();
    const { container } = await kutu();
    useStore.setState({ toast });
    await ac(container);

    fireEvent.click(geriAl(satirlar(container)[0])!);
    await flush();

    expect(undo).toHaveBeenCalledWith(CWD, C1.id);
    expect(useStore.getState().ui.gitDrafts[CWD]).toBe("Başlık\n\nGövde");
    expect(toast).toHaveBeenCalledWith("aaaaaaa geri alındı; değişiklikler listede", "ok");
    expect(push, "geri almak göndermemeli").not.toHaveBeenCalled();
  });

  it("kutuda yazılmış bir ileti varsa ezmiyor", async () => {
    vi.spyOn(api, "gitUndoCommit").mockResolvedValue("eski ileti");
    const { container } = await kutu();
    useStore.getState().setUi({ gitDrafts: { [CWD]: "yazdığım yeni ileti" } });
    await flush();
    await ac(container);
    fireEvent.click(geriAl(satirlar(container)[0])!);
    await flush();
    expect(useStore.getState().ui.gitDrafts[CWD]).toBe("yazdığım yeni ileti");
  });

  it("reddedilirse (uzakta / son commit değişti) git'in metni kalıcı kutuda", async () => {
    vi.spyOn(api, "gitUndoCommit").mockRejectedValue("bu commit uzakta var");
    const { container } = await kutu();
    await ac(container);
    fireEvent.click(geriAl(satirlar(container)[0])!);
    await flush();
    const hata = container.querySelector(".git-commit-error")!;
    expect(hata.querySelector("strong")!.textContent).toBe("Commit geri alınamadı");
    expect(hata.querySelector("pre")!.textContent).toBe("bu commit uzakta var");
  });
});

describe("bağlam şeridindeki rozet", () => {
  async function serit(info: GitInfo | null) {
    seed(info);
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

  it("commit'ten sonra gönderilmemiş commit varken ± 0, ipucu söylüyor, paneli açıyor", async () => {
    const { container } = await serit(repo({ ahead: 2, changes: [] }));
    const r = rozet(container)!;
    expect(r.textContent).toBe("± 0");
    expect(r.title).toContain("2 commit gönderilmedi");

    fireEvent.click(r);
    const ui = useStore.getState().ui;
    expect(ui.historyOpen).toBe(true);
    expect(ui.panelMode).toBe("git");
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
