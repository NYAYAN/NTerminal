import { describe, expect, it } from "vitest";

import { keyBarInfo, programName } from "./keyPrograms";

/*
 * Tam ekran programın çubuğu (`KeyBar`): adı ve çıkış düğmeleri.
 *
 * BİLDİRİLEN: "`git pull` dediğimde komut yazın kısmında değil üst kısımda
 * `:q!` yazmak gerekiyor." git birleştirme mesajı için vim açıyor; çubuk
 * vim'i tanıyıp çıkışı tek tıka indiriyor.
 */
describe("tam ekran çubuğu", () => {
  it("git'in açtığı vim: kaydet/kaydetmeden çık ve git ipucu", () => {
    const info = keyBarInfo("vim", "git pull");
    expect(info.name).toBe("vim");
    expect(info.hint).toBe("input.keysGitHint");
    // Önce Esc: kullanıcı ekleme kipindeyse `:wq` metne yazılırdı.
    expect(info.actions.map((a) => a.keys)).toEqual(["\x1b:wq\r", "\x1b:q!\r"]);
  });

  it("macOS'un vi'si ve neovim de vim ailesi", () => {
    for (const ad of ["vi", "nvim", "view", "vimdiff"]) {
      expect(keyBarInfo(ad, "git commit").hint, ad).toBe("input.keysGitHint");
      expect(keyBarInfo(ad, null).actions, ad).toHaveLength(2);
    }
  });

  it("git dışında vim'de git ipucu yok", () => {
    expect(keyBarInfo("vim", "vim notlar.md").hint).toBe("input.keysHint");
  });

  it("sayfalayıcı ve izleyicilerde tek düğme: q", () => {
    for (const ad of ["less", "more", "man", "htop", "top", "btop"]) {
      expect(keyBarInfo(ad, null).actions.map((a) => a.keys), ad).toEqual(["q"]);
    }
  });

  it("nano'da kaydet onaylı, fzf'de Esc", () => {
    expect(keyBarInfo("nano", null).actions.map((a) => a.keys)).toEqual(["\x0f\r", "\x18"]);
    expect(keyBarInfo("fzf", null).actions.map((a) => a.keys)).toEqual(["\x1b"]);
  });

  it("bilinmeyen programda düğme yok: yanlış programa `:q!` başka bir şey yapar", () => {
    // tmux, mc, ssh ardındaki program: çubukta yalnızca ad ve Durdur.
    for (const ad of ["tmux", "mc", "ssh"]) {
      expect(keyBarInfo(ad, null).actions, ad).toEqual([]);
    }
    // Süreç adı dışarıdan geliyor; nesnenin kendi alanlarına düşmemeli.
    expect(keyBarInfo("constructor", null).actions).toEqual([]);
  });

  it("program okunamadıysa ad komuttan, düğme yalnızca program doğrudan çalışıyorsa", () => {
    // Windows'ta grup bilgisi yok: ad çalışan komuttan geliyor.
    const dogrudan = keyBarInfo(null, "cd notlar && vim yapilacak.md");
    expect(dogrudan.name).toBe("vim");
    expect(dogrudan.actions).toHaveLength(2);
    // `git` bir başlatıcı: tam ekranda hangi programın açık olduğu bilinmiyor.
    const baslatici = keyBarInfo(null, "git pull");
    expect(baslatici.name).toBe("git");
    expect(baslatici.actions).toEqual([]);
    // Komut da yoksa ad yok ("Tam ekran program").
    expect(keyBarInfo(null, null).name).toBe(null);
  });

  it("süreç adı karşılaştırılabilir hâle geliyor", () => {
    expect(programName("/usr/bin/vim")).toBe("vim");
    expect(programName("C:\\Program Files\\Vim\\Vim.exe")).toBe("vim");
    expect(programName("  less ")).toBe("less");
    expect(programName("")).toBe(null);
    expect(programName(null)).toBe(null);
  });
});
