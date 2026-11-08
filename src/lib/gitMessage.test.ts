import { describe, expect, it } from "vitest";

import { gitMessageTitle, helpText, joinGitMessage, splitGitMessage } from "./gitMessage";

/*
 * git'in mesaj dosyası kutuda (`GitMessageEditor`): düzenlenecek metin ile
 * git'in açıklamaları ayrılıyor, yazılırken yeniden birleşiyor.
 *
 * BİLDİRİLEN: "`git pull` dediğimde ... `:q!` yazmak gerekiyor." Birleştirme
 * mesajı artık kutuda; kullanıcı "Merge branch 'x'"i görüyor, altındaki
 * açıklamayı değil.
 */

/** git 2.50'nin `git merge` sırasında yazdığı MERGE_MSG. */
const MERGE_MSG = `Merge branch 'ozellik'

# Please enter a commit message to explain why this merge is necessary,
# especially if it merges an updated upstream into a topic branch.
#
# Lines starting with '#' will be ignored, and an empty message aborts
# the commit.
`;

describe("git mesaj dosyası", () => {
  it("birleştirme mesajında düzenlenecek tek satır kalıyor", () => {
    const parts = splitGitMessage(MERGE_MSG);
    expect(parts.body).toBe("Merge branch 'ozellik'");
    expect(parts.help.split("\n")).toHaveLength(5);
    expect(parts.tail).toBe("");
  });

  it("dokunulmadan yazılınca git aynı mesajı görüyor", () => {
    // git `#` satırlarını ve sondaki boşlukları kendisi atıyor; geriye kalan
    // mesaj birebir aynı olmalı.
    const yazilan = joinGitMessage(splitGitMessage(MERGE_MSG));
    const temiz = (s: string) =>
      s
        .split("\n")
        .filter((l) => !l.startsWith("#"))
        .join("\n")
        .trim();
    expect(temiz(yazilan)).toBe(temiz(MERGE_MSG));
    expect(yazilan.startsWith("Merge branch 'ozellik'\n\n# Please enter")).toBe(true);
  });

  it("düzenlenen mesaj açıklamaların önüne yazılıyor", () => {
    const parts = { ...splitGitMessage(MERGE_MSG), body: "Özellik dalı birleştirildi\n\nAyrıntı" };
    const yazilan = joinGitMessage(parts);
    expect(yazilan.startsWith("Özellik dalı birleştirildi\n\nAyrıntı\n\n# Please enter")).toBe(true);
  });

  it("boş commit şablonunda düzenlenecek metin boş", () => {
    // `git commit` (-m olmadan): boş mesaj git'te commit'i bırakmak demek.
    const parts = splitGitMessage("\n# Please enter the commit message for your changes.\n");
    expect(parts.body).toBe("");
    expect(joinGitMessage(parts)).toBe("\n\n# Please enter the commit message for your changes.\n");
  });

  it("`commit -v` farkı makas çizgisinden sonra olduğu gibi kalıyor", () => {
    // Farkın satırları `#`siz; yorum sayılsaydı düzenlenecek metne karışırdı.
    const metin =
      "\n# Please enter the commit message.\n" +
      "# ------------------------ >8 ------------------------\n" +
      "# Do not modify or remove the line above.\n" +
      "diff --git a/x b/x\n+yeni satir\n";
    const parts = splitGitMessage(metin);
    expect(parts.body).toBe("");
    expect(parts.tail.startsWith("# ------------------------ >8")).toBe(true);
    expect(parts.tail).toContain("+yeni satir");
    const yazilan = joinGitMessage({ ...parts, body: "Düzeltme" });
    expect(yazilan.endsWith("diff --git a/x b/x\n+yeni satir\n")).toBe(true);
    expect(yazilan.startsWith("Düzeltme\n")).toBe(true);
  });

  it("rebase listesinde komutlar düzenleniyor, yardım altta", () => {
    const parts = splitGitMessage("pick abc123 Birinci\npick def456 İkinci\n\n# Rebase abc..def onto 789\n# p, pick = use commit\n");
    expect(parts.body).toBe("pick abc123 Birinci\npick def456 İkinci");
    expect(helpText(parts.help)).toBe("Rebase abc..def onto 789\np, pick = use commit");
  });

  it("Windows satır sonları da ayrılıyor", () => {
    expect(splitGitMessage("Mesaj\r\n# yorum\r\n").body).toBe("Mesaj");
  });

  it("başlık dosya adından", () => {
    expect(gitMessageTitle("/repo/.git/MERGE_MSG")).toBe("gitEdit.merge");
    expect(gitMessageTitle("C:\\repo\\.git\\COMMIT_EDITMSG")).toBe("gitEdit.commit");
    expect(gitMessageTitle("/repo/.git/TAG_EDITMSG")).toBe("gitEdit.tag");
    expect(gitMessageTitle("/repo/.git/rebase-merge/git-rebase-todo")).toBe("gitEdit.rebase");
    expect(gitMessageTitle("/repo/.git/EDIT_DESCRIPTION")).toBe("gitEdit.message");
  });
});
