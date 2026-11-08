import type { MsgKey } from "./messages";

/**
 * git'in düzenleyiciye verdiği mesaj dosyası, kutudaki mesaj düzenleyicisi
 * için (`GitMessageEditor`).
 *
 * Kutu yalnızca DÜZENLENECEK satırları gösteriyor; git'in `#` ile başlayan
 * açıklamaları altta soluk duruyor. Birleştirme mesajında kullanıcının
 * gördüğü "Merge branch 'x'" oluyor, altındaki beş satırlık "Please enter a
 * commit message…" değil. Yazılırken açıklamalar geri ekleniyor: git onları
 * kendisi siliyor (`commit.cleanup` varsayılanı), ama rebase listesi gibi
 * dosyalarda yardım metni olduğu gibi kalmalı.
 *
 * `commit -v`nin farkı makas çizgisinden sonra ve `#`siz geliyor; yorum
 * sayılmadığı için olduğu gibi sona ekleniyor, düzenlenecek metne karışmıyor.
 */
export interface GitMessageParts {
  /** Kullanıcının düzenleyeceği satırlar (yorum olmayanlar). */
  body: string;
  /** git'in açıklama satırları (`#`). */
  help: string;
  /** Makas çizgisi ve sonrası (`commit -v`). */
  tail: string;
}

const SCISSORS = /^# -+ >8 -+$/;

export function splitGitMessage(text: string): GitMessageParts {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((line) => SCISSORS.test(line));
  const head = cut === -1 ? lines : lines.slice(0, cut);
  const body: string[] = [];
  const help: string[] = [];
  for (const line of head) (line.startsWith("#") ? help : body).push(line);
  return {
    body: trimBlankLines(body).join("\n"),
    help: help.join("\n"),
    tail: cut === -1 ? "" : lines.slice(cut).join("\n"),
  };
}

/** Dosyaya yazılacak metin: mesaj, boş satır, açıklamalar, makas sonrası. */
export function joinGitMessage(parts: GitMessageParts): string {
  let out = `${parts.body.replace(/\s+$/, "")}\n`;
  if (parts.help) out += `\n${parts.help}\n`;
  if (parts.tail) out += parts.tail.endsWith("\n") ? parts.tail : `${parts.tail}\n`;
  return out;
}

/** Açıklamaların gösterilen hâli: `# ` öneki okumayı yoruyor. */
export function helpText(help: string): string {
  return help
    .split("\n")
    .map((line) => line.replace(/^# ?/, ""))
    .join("\n")
    .trim();
}

/** Düzenleyicinin başlığı: hangi mesajı yazdığını dosya adı söylüyor. */
export function gitMessageTitle(path: string): MsgKey {
  switch (path.split(/[\\/]/).pop()) {
    case "MERGE_MSG":
      return "gitEdit.merge";
    case "COMMIT_EDITMSG":
      return "gitEdit.commit";
    case "TAG_EDITMSG":
      return "gitEdit.tag";
    case "git-rebase-todo":
      return "gitEdit.rebase";
    default:
      return "gitEdit.message";
  }
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}
