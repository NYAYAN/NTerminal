// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { GitChanges } from "./GitChanges";

/**
 * Değişiklik listesindeki durum göstergesi.
 *
 * ÖNCEKİ HÂLİ metindi: "DEĞİŞTİ", "EKLENDİ", "YENİDEN ADLANDIRILDI". Sabit
 * 88px'lik bir sütun tutuyordu ve o sütun dosya YOLUNDAN çıkıyordu — dar
 * panelde asıl aranan bilgi kırpılırken yerinde her satırda tekrarlanan aynı
 * kelime duruyordu.
 *
 * Bugün simge: aynı hizalama, üçte bir yer. Bilginin kaybolmaması şartı
 * buradaki testlerin asıl konusu — metin `title` (fare ipucu) ve `aria-label`
 * (ekran okuyucu) içinde duruyor, renk de durumu ikinci bir kanaldan
 * söylüyor.
 */

const CWD = "C:/depo";

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
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: "t1",
    tabs: [tab()],
  };
}

function seed(changes: { status: string; path: string }[]) {
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: {
      [CWD]: { branch: "main", detached: false, ahead: 0, behind: 0, changes },
    },
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(cleanup);

describe("durum göstergesi", () => {
  it("metin etiketi yerine simge çiziliyor", () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);

    const icon = container.querySelector(".git-icon");
    expect(icon, "durum simgesi yok").not.toBe(null);
    expect(icon!.querySelector("svg"), "simge bir SVG olmalı").not.toBe(null);
    // Eski metin sütunu geri gelmiş olmasın.
    expect(container.querySelector(".git-tag"), "metin etiketi geri gelmiş").toBe(null);
    expect(container.textContent, "durum yazısı satırda duruyor").not.toContain("Değişti");
  });

  it("metin ipucunda ve ekran okuyucuda duruyor", () => {
    // Simgeye geçmek bilgiyi ATMAK değil, yerini değiştirmek.
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    const icon = container.querySelector(".git-icon")!;
    expect(icon.getAttribute("title")).toBe("Değişti");
    expect(icon.getAttribute("aria-label")).toBe("Değişti");
  });

  it("satırın kendi ipucu yol olarak kalıyor", () => {
    // İki ayrı ipucu: simgede durum, satırın geri kalanında yol.
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-row")!.getAttribute("title")).toBe("src/app.ts");
  });

  it("her durum kendi rengini ve metnini alıyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
      { status: " D", path: "c.ts" },
      { status: "R ", path: "d.ts" },
      { status: "??", path: "e.ts" },
    ]);
    const { container } = render(<GitChanges />);
    const icons = [...container.querySelectorAll(".git-icon")];
    expect(icons).toHaveLength(5);

    const seen = icons.map((el) => [el.className, el.getAttribute("title")]);
    expect(seen).toEqual([
      ["git-icon mod", "Değişti"],
      ["git-icon new", "Eklendi"],
      ["git-icon del", "Silindi"],
      ["git-icon mod", "Yeniden adlandırıldı"],
      // Takip edilmeyen dosya EKLENENLE AYNI RENKTE DEĞİL: ikisi de yeşil
      // olunca "yeni dosya eklendi" diye okunuyordu, oysa eklenen dosya
      // indekste, takip edilmeyen hiçbir yerde.
      ["git-icon untracked", "Takip edilmiyor — henüz git add yapılmamış"],
    ]);
  });

  it("eklenen ile takip edilmeyen hem renkte hem simgede ayrışıyor", () => {
    // Renk ilk ayrım (yeşil / sarı), simge ikincisi: renk körlüğünde ya da
    // düşük parlaklıkta tek bir kanal yetmiyor.
    seed([
      { status: "A ", path: "b.ts" },
      { status: "??", path: "e.ts" },
    ]);
    const { container } = render(<GitChanges />);
    const icons = [...container.querySelectorAll(".git-icon")];
    expect(icons[0].className).toBe("git-icon new");
    expect(icons[1].className).toBe("git-icon untracked");
    const [added, untracked] = icons.map((el) => el.querySelector("svg")!);
    expect(added.innerHTML).not.toBe(untracked.innerHTML);
  });

  it("bileşik durumda indeks harfi belirleyici", () => {
    // `AM` = indekste eklendi, ağaçta değiştirildi. Commit'e girecek olan
    // indeks tarafı.
    seed([{ status: "AM", path: "b.ts" }]);
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-icon")!.getAttribute("title")).toBe("Eklendi");
  });
});

/**
 * Satır eylemleri: yolu kopyala, değişiklikleri geri al, dosyayı aç.
 *
 * Geri alma YIKICI ve iki farklı iş yapıyor: takip edilen dosya son
 * commit'teki hâline dönüyor (geri getirilebilir), takipsiz dosya SİLİNİYOR
 * ve git'te kaydı olmadığı için geri getirilemiyor. Testlerin asıl konusu bu
 * ayrımın kaybolmaması — aynı soruyu iki duruma da sormak, ikincisini
 * olduğundan masum gösterirdi.
 */
describe("satır eylemleri", () => {
  it("üç eylem de satırda duruyor", () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    const titles = [...container.querySelectorAll(".git-actions button")].map((b) =>
      b.getAttribute("title"),
    );
    expect(titles).toEqual(["Dosya yolunu kopyala", "Değişiklikleri geri al", "Dosyayı aç"]);
  });

  it("eylemler katlama düğmesinin İÇİNDE değil", () => {
    // İç içe düğme geçersiz işaretleme; tıklamalar da karışıyor (eyleme
    // basmak satırı katlıyordu).
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-row .git-actions"), "eylemler satır düğmesinin içinde")
      .toBe(null);
  });

  it("geri alma ONAY olmadan çalışmıyor", async () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const gitRevert = vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({ askConfirm: async () => false });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(gitRevert, "onay reddedildiği hâlde geri alındı").not.toHaveBeenCalled();
  });

  it("onay verilince doğru dosya geri alınıyor", async () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const gitRevert = vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({ askConfirm: async () => true, refreshGit: async () => {} });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(gitRevert).toHaveBeenCalledWith(CWD, "src/app.ts", false);
  });

  it("takipsiz dosyada SİLME dili kullanılıyor", async () => {
    // "Geri al" demek yanıltıcı olurdu: geri alınacak bir değişiklik yok,
    // dosyanın kendisi değişiklik ve silinmesi geri alınamaz.
    seed([{ status: "??", path: "yeni.ts" }]);
    let istek: { title?: string; detail?: string; confirmLabel?: string } = {};
    vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({
      askConfirm: async (r) => {
        istek = r;
        return true;
      },
      refreshGit: async () => {},
    });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(istek.title).toBe("Dosyayı sil");
    expect(istek.confirmLabel).toBe("Sil");
    expect(istek.detail, "geri getirilemeyeceği söylenmiyor").toContain("geri getirilemez");
  });

  it("takipsiz bayrağı Rust tarafına geçiyor", async () => {
    // Silme ile HEAD'e dönüş tamamen farklı iki iş; bayrak kaybolursa yanlış
    // olan çalışır.
    seed([{ status: "??", path: "yeni.ts" }]);
    const gitRevert = vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({ askConfirm: async () => true, refreshGit: async () => {} });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(gitRevert).toHaveBeenCalledWith(CWD, "yeni.ts", true);
  });
});
