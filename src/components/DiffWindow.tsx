import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import "../styles/diffWindow.css";
import {
  applyEdit,
  displayOffset,
  EditHistory,
  editableEol,
  indentUnit,
  lineAt,
  textEdit,
  toDisplay,
  toFile,
} from "../lib/diffEdit";
import { changeAtLine, nextChangeIndex, prevChangeIndex } from "../lib/diffView";
import { diffQuery, diffWindowTitle, parseDiffQuery, type DiffTarget } from "../lib/diffWindow";
import { baseName } from "../lib/format";
import { applyUiFont } from "../lib/fonts";
import { setLanguage, tp, useT } from "../lib/i18n";
import { api, onDiffTarget, onSettingsChanged } from "../lib/ipc";
import { matchCombo, prettyCombo } from "../lib/keys";
import type { MsgKey } from "../lib/messages";
import { isMac, setFileManager, setPlatform } from "../lib/platform";
import {
  appendChange,
  applyChange,
  countChanges,
  diffTexts,
  foldGap,
  lineSeparator,
  splitLines,
  transferLine,
  unchangedGaps,
  type Fold,
  type Gap,
  type HighlightPolicy,
  type IgnorePolicy,
  type TextDiff,
} from "../lib/textDiff";
import { applyThemeToDocument, getTheme } from "../lib/themes";
import type { DiffSides, FileText, GitChange, Settings } from "../types";
import type { EditorBinding, EditorHandle } from "./DiffEditor";
import { OneSide, SideBySide, Unified, type Caret, type PaneLabels, type PanesHandle } from "./DiffPanes";
import { useLabel } from "./gitLabel";

/**
 * Fark penceresi — Değişiklikler panelinde "Farkı yeni pencerede göster".
 *
 * İSTEK: "yeni pencerede göster dediğimde IntelliJ / WebStorm'daki gibi yeni
 * bir pencere açılmalı, solda eskisi sağda yenisi; IntelliJ'de nasılsa bire
 * bir aynı şekilde." Düzen ve davranış IntelliJ'in 2026.2 sürümünden alındı:
 * belgedeki ekran görüntüleri piksel piksel ölçüldü, metinler ve sabitler
 * IntelliJ Community kaynağından (DiffBundle, SyncScrollSupport,
 * FoldingModelSupport, DiffRequestFactoryImpl) okundu.
 *
 * Ayrı bir SAYFA: ana pencerenin deposunu (sekmeler, kabuklar) paylaşmıyor.
 * Ayarları açılış verisinden alıyor ve ana pencere kaydettikçe
 * (`onSettingsChanged`) güncelliyor; git'i ve dosyayı kendisi okuyor.
 */

/** IntelliJ'in `CONTEXT_RANGE`i: katlamada bırakılan bağlam (4, 8, 16, sonra hepsi). */
const CONTEXT_RANGE = 4;
const FOLD_LEVELS = 3;

type Viewer = "side" | "unified";

/**
 * Görünüm tercihleri — tarayıcı deposunda, pencereler arasında ortak.
 *
 * Eş zamanlı kaydırma burada YOK: IntelliJ'de de kalıcı değil (`@Transient`),
 * her pencere açık başlıyor. Katlama varsayılan olarak KAPALI: ayrı pencerede
 * IntelliJ'in varsayılanı "hepsi açık" (`EXPAND_BY_DEFAULT`).
 */
interface Prefs {
  viewer: Viewer;
  ignore: IgnorePolicy;
  highlight: HighlightPolicy;
  collapse: boolean;
}

const PREFS_KEY = "nterminal.diffWindow";
const DEFAULT_PREFS: Prefs = { viewer: "side", ignore: "none", highlight: "words", collapse: false };

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      viewer: parsed.viewer === "unified" ? "unified" : "side",
      ignore: (["none", "trim", "whitespace", "blankLines"] as const).includes(parsed.ignore as IgnorePolicy)
        ? (parsed.ignore as IgnorePolicy)
        : "none",
      highlight: (["words", "lines", "split", "chars", "none"] as const).includes(parsed.highlight as HighlightPolicy)
        ? (parsed.highlight as HighlightPolicy)
        : "words",
      collapse: parsed.collapse === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Depo kapalıysa tercih bu pencereyle sınırlı kalır; görünüm yine çalışıyor.
  }
}

/** Araç çubuğunun geri al / ileri al / kaydet simgeleri (16'lık ızgara, ince çizgi). */
const UNDO_ICON = "M5.5 3.5 L2.5 6.5 L5.5 9.5 M2.5 6.5 H9.5 A3.5 3.5 0 0 1 9.5 13.5 H6.5";
const REDO_ICON = "M10.5 3.5 L13.5 6.5 L10.5 9.5 M13.5 6.5 H6.5 A3.5 3.5 0 0 0 6.5 13.5 H9.5";
const SAVE_ICON = "M3 2.5 H11 L13.5 5 V13.5 H3 Z M5.5 2.5 V5.5 H10 V2.5 M5.5 13.5 V9.5 H10.5 V13.5";

/** IntelliJ'in kısayolları: varsayılan (Windows/Linux) ve macOS tuş haritası. */
function keymap() {
  const mac = isMac();
  return {
    prevDiff: "Shift+F7",
    nextDiff: "F7",
    prevFile: mac ? "Ctrl+Shift+ArrowLeft" : "Alt+Shift+ArrowLeft",
    nextFile: mac ? "Ctrl+Shift+ArrowRight" : "Alt+Shift+ArrowRight",
    source: mac ? "Cmd+ArrowDown" : "F4",
    settings: mac ? "Cmd+Shift+D" : "Ctrl+Shift+D",
    apply: mac ? "Ctrl+Cmd+ArrowRight" : "Ctrl+Alt+R",
    opposite: "Ctrl+Shift+Tab",
    undo: mac ? "Cmd+Z" : "Ctrl+Z",
    redo: mac ? "Cmd+Shift+Z" : "Ctrl+Y",
    save: mac ? "Cmd+S" : "Ctrl+S",
  };
}

/** Bir yazının satır ayırıcısı etiketi; ikisi farklıysa başlıklarda görünüyor. */
function separatorLabel(text: string): string {
  const sep = lineSeparator(text);
  return sep === "\r\n" ? "CRLF" : sep === "\r" ? "CR" : "LF";
}

type Mode = "loading" | "error" | "two" | "added" | "deleted" | "binary" | "missing";

/**
 * Canlı tazelemenin yoklama aralığı. Yarım saniye: kaydettikten sonra göz fark
 * penceresine dönene kadar geçen süreden kısa; yoklamanın kendisi bir dosya
 * okuması, yani bu sıklıkta bile iz bırakmıyor.
 */
const LIVE_POLL_MS = 500;

/**
 * Yazmayı bıraktıktan sonra kaydetmeden önce beklenen süre.
 *
 * IntelliJ belgeyi bellekte tutup pencereden çıkınca kaydediyor; burada dosyaya
 * başka programlar da bakıyor (git, ana penceredeki Değişiklikler, kullanıcının
 * öteki düzenleyicisi), o yüzden kısa bir duraksama yetiyor. Her tuşta yazmak
 * diski ve canlı yoklamayı boşuna meşgul ederdi. `»` ve geri alma beklemiyor.
 */
const SAVE_DELAY_MS = 400;

/** Dosyanın kimliği: depo + yol (pencere başka bir depoya da geçebiliyor). */
function fileKey(root: string, path: string): string {
  return `${root}\n${path}`;
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf("\n");
  return [key.slice(0, i), key.slice(i + 1)];
}

/** Sağ taraftaki metin: yazılan, kaydedilmemiş olabilir; `base` diskte olduğu bilinen. */
interface Edit {
  key: string;
  /** Dosyanın kendi biçiminde (`\r\n` dahil). */
  raw: string;
  /** Bu metnin üzerine yazıldığı disk içeriği; kayıtta `expected`. */
  base: string;
}

/** Yazı alanı odakta mı (kısayollar oradayken tarayıcının kendi işini bozmasın). */
function editorFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLTextAreaElement && el.classList.contains("dw-editor");
}

/**
 * Diskteki dosya, ekrandaki sağ taraftan farklı mı?
 *
 * Yoklama görüntüleyicinin okumasını kullanıyor (yarım megabayt sınırlı); fark
 * penceresi dört megabayta kadar okuyor. Sınıra takılan dosyada metin
 * karşılaştırılamıyor — orada boyut ve baştaki yarım megabayt bakılıyor.
 */
function fileDiffers(shown: FileText | null, disk: FileText | null): boolean {
  if (!shown || !disk) return !shown !== !disk;
  if (shown.binary || disk.binary) return shown.binary !== disk.binary || shown.size !== disk.size;
  if (disk.truncated) return disk.size !== shown.size || !shown.text.startsWith(disk.text);
  return disk.text !== shown.text;
}

export function DiffWindow({ target }: { target: DiffTarget }) {
  const t = useT();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [files, setFiles] = useState<GitChange[]>([]);
  // Pencere tek ve yeniden kullanılıyor: başka bir depodan bir dosya da gelebilir.
  const [root, setRoot] = useState(target.root);
  const [path, setPath] = useState(target.path);
  const [sides, setSides] = useState<{ root: string; path: string; data: DiffSides } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [sync, setSync] = useState(true);
  const [caret, setCaret] = useState<Caret>({ side: 2, line: 0 });
  const [levels, setLevels] = useState<Map<string, number>>(() => new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<"settings" | "files" | null>(null);
  const [banner, setBanner] = useState(true);
  const [appendMode, setAppendMode] = useState(false);
  const panes = useRef<PanesHandle>(null);
  /** Yeni açılan dosyada nereye gidilecek: ilk farka, son farka ya da yerinde kal. */
  const jump = useRef<"first" | "last" | null>("first");
  const seq = useRef(0);

  /*
   * Sağ tarafta yazılan metin. Yokken sağ taraf diskteki; varken fark, `»` ve
   * kayıt onu kullanıyor. Ref'ler eş zamansız işler (kayıt, yükleme) en son
   * değeri görsün diye: durum ancak bir sonraki çizimde güncelleniyor.
   */
  const [edit, setEdit] = useState<Edit | null>(null);
  const editRef = useRef<Edit | null>(null);
  /** En son yazmaya kalkılan metin: yoklama onu dışarıdan gelen bir değişiklik sanmasın. */
  const lastWritten = useRef<string | null>(null);
  /** Kaydedilemiyor: dosya arada diskte değişti ya da UTF-8 değil. Kayıt bekliyor. */
  const [issue, setIssue] = useState<{ key: string; kind: "conflict" | "notText" } | null>(null);
  const issueRef = useRef(issue);
  const history = useRef({ key: "", log: new EditHistory() });
  const [selection, setSelection] = useState<EditorBinding["selection"]>(null);
  const selectionSeq = useRef(0);
  const editorHandle = useRef<EditorHandle>(null);
  const saveTimer = useRef<number | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  /** "Benimkini kaydet": yeniden yüklerken çakışma yeniden işaretlenmesin. */
  const resolving = useRef(false);
  /** Kalemden sonra odaklanılacak satır: yazı alanı bir sonraki çizimde kuruluyor. */
  const focusRequest = useRef<number | null>(null);
  const [, setFocusTick] = useState(0);
  /**
   * Düzenleme açık mı (kalem basılı). Kapalıyken sağ taraf salt okunur.
   * İSTEK: "kaleme basınca düzenleme açılıyor fakat tekrar basınca
   * kapanmıyor" — kalem aç/kapa düğmesi. Dosya değişince açık kalıyor.
   */
  const [editMode, setEditMode] = useState(false);

  const putEdit = useCallback((next: Edit | null) => {
    editRef.current = next;
    setEdit(next);
  }, []);
  const putIssue = useCallback((next: { key: string; kind: "conflict" | "notText" } | null) => {
    issueRef.current = next;
    setIssue(next);
  }, []);
  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((cur) => (cur === text ? null : cur)), 4000);
  }, []);

  /**
   * Diskten yeni okunan sağ taraf. Yazılmamış değişiklik yoksa sağ taraf
   * diskteki oluyor. Varsa ve diski BAŞKASI değiştirdiyse çakışma (IntelliJ:
   * "File Cache Conflict"): hiçbir şeyin üzerine yazılmıyor, kullanıcı seçiyor.
   */
  const adoptDisk = useCallback(
    (key: string, file: FileText | null) => {
      const ed = editRef.current;
      if (!ed || ed.key !== key) return;
      const now = file && !file.binary ? file.text : null;
      if (ed.raw === now) return putEdit(null);
      if (now === null || ed.raw === ed.base) {
        // Geçmiş eski metnin konumlarını tutuyordu.
        putEdit(null);
        if (history.current.key === key) history.current = { key, log: new EditHistory() };
        return;
      }
      if (now === ed.base || now === lastWritten.current) return;
      if (resolving.current) putEdit({ ...ed, base: now });
      else putIssue({ key, kind: "conflict" });
    },
    [putEdit, putIssue],
  );

  /**
   * Yazılan metni dosyaya yazar. Kayıtlar sırayla: biri sürerken gelen
   * ikincisi onu bekliyor ve en son metni yazıyor. `expected` metnin üzerine
   * yazıldığı disk içeriği; dosya arada değiştiyse Rust yazmıyor (`changed`).
   */
  const save = useCallback(() => {
    saveChain.current = saveChain.current.then(async () => {
      const ed = editRef.current;
      if (!ed || ed.raw === ed.base || issueRef.current?.key === ed.key) return;
      const [r, p] = splitKey(ed.key);
      lastWritten.current = ed.raw;
      try {
        await api.gitWriteFile(r, p, ed.base, ed.raw);
      } catch (err) {
        const text = String(err);
        if (text.includes("changed")) putIssue({ key: ed.key, kind: "conflict" });
        else if (text.includes("not-text")) putIssue({ key: ed.key, kind: "notText" });
        else flash(text);
        return;
      }
      const latest = editRef.current;
      if (latest?.key === ed.key) putEdit({ ...latest, base: ed.raw });
      setSides((prev) =>
        prev && fileKey(prev.root, prev.path) === ed.key && prev.data.current
          ? {
              ...prev,
              data: {
                ...prev.data,
                current: { ...prev.data.current, text: ed.raw, size: new TextEncoder().encode(ed.raw).length },
              },
            }
          : prev,
      );
    });
    return saveChain.current;
  }, [flash, putEdit, putIssue]);

  const scheduleSave = () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void save();
    }, SAVE_DELAY_MS);
  };

  /** Bekleyen kaydı hemen yapar (dosya değişirken, pencere kapanırken, Ctrl+S). */
  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    return save();
  }, [save]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  // Kapanış kaydı `onCloseRequested`ta; sökülen bileşenin zamanlayıcısı sonradan yazmasın.
  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const update = (patch: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });

  // ------------------------------------------------------------- açılış

  const applySettings = useCallback((next: Settings) => {
    setLanguage(next.language);
    applyThemeToDocument(getTheme(next.appearance.theme));
    applyUiFont(next.appearance.uiFontFamily, next.appearance.uiFontSize);
    setSettings(next);
  }, []);

  useEffect(() => {
    void api
      .bootstrap()
      .then((boot) => {
        setPlatform(boot.platform);
        setFileManager(boot.fileManager, boot.fileManagerEn);
        applySettings(boot.settings);
      })
      .catch((err) => setError(String(err)));
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onSettingsChanged(applySettings).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [applySettings]);

  // ------------------------------------------------------------- veri

  /**
   * Dosyanın iki tarafını ve değişiklik listesini okur.
   *
   * Liste her seferinde yeniden okunuyor: pencere açıkken commit atılabilir,
   * dosya geri alınabilir; "2/5 dosya" ve önceki/sonraki dosya o anki listeye
   * göre olmalı. Sıra numarası eski bir yanıtın yenisinin üstüne yazmasını
   * engelliyor (hızlı dosya geçişi).
   */
  const load = useCallback(
    async (p: string) => {
      const mine = ++seq.current;
      try {
        const info = await api.gitInfo(root).catch(() => null);
        const list = info?.changes ?? [];
        const change = list.find((c) => c.path === p);
        const untracked = change?.status.trim() === "??";
        const data = await api.gitDiffSides(root, p, change?.origPath, untracked);
        if (mine !== seq.current) return;
        adoptDisk(fileKey(root, p), data.current);
        setFiles(list);
        setSides({ root, path: p, data });
        setError(null);
      } catch (err) {
        if (mine !== seq.current) return;
        setError(String(err));
      }
    },
    [adoptDisk, root],
  );

  useEffect(() => {
    void load(path);
  }, [load, path]);

  // Pencereye dönünce hemen tazele (aşağıdaki yoklamayı beklemeden).
  useEffect(() => {
    const onFocus = () => void load(path);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load, path]);

  /*
   * CANLI tazeleme: pencere görünürken dosya ve depo yoklanıyor.
   *
   * BİLDİRİLEN: "değişiklik yapınca açık pencereye anlık yansımıyor." Fark
   * yalnızca pencere odağı geri alınca tazeleniyordu; oysa fark penceresi
   * çoğu zaman düzenleyicinin YANINDA duruyor ve ona tıklanmadan bakılıyor.
   * IntelliJ'de fark belgeyle birlikte canlı.
   *
   * Yoklama ucuz: dosyanın kendisi (bir okuma) ve deponun imzası (HEAD +
   * indeks + stash günlüğü, iki üç dosya durumu). Pahalı olan — iki `git`
   * süreci ve fark hesabı — yalnızca biri DEĞİŞTİYSE koşuyor. İmza commit'i ve
   * sahnelemeyi yakalıyor (sol taraf HEAD'den geliyor), dosya okuması
   * düzenlemeyi (imza bunu görmüyor: çalışma ağacındaki dosya indekse
   * dokunmuyor). Pencere görünmezken (simge durumunda, tümüyle örtülü)
   * yoklanmıyor; yeniden görününce hemen bakılıyor.
   */
  const currentRef = useRef<FileText | null | undefined>(undefined);
  const loaded = sides?.root === root && sides.path === path ? sides.data : null;
  currentRef.current = loaded ? loaded.current : undefined;
  useEffect(() => {
    let busy = false;
    let lastPrint: string | null | undefined;
    // Yeniden yüklemeyi tetikleyen son disk durumu. Aynı durum ikinci kez
    // tetiklemiyor: dosya var ama okunamıyorsa (yoklama `null` görür, fark
    // penceresi okumuştur) her yoklamada iki `git` süreci başlatılırdı.
    let lastTrigger: string | null = null;
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const [print, file] = await Promise.all([
          api.gitFingerprint(root).catch(() => null),
          api.readTextFile(`${root}/${path}`).catch(() => null),
        ]);
        const repoChanged = lastPrint !== undefined && print !== lastPrint;
        lastPrint = print;
        const shown = currentRef.current;
        if (shown === undefined) return; // ilk yükleme sürüyor
        const diskKey = !file ? "-" : file.binary ? `b${file.size}` : `${file.size}|${file.text}`;
        const fileChanged = fileDiffers(shown, file) && diskKey !== lastTrigger;
        if (fileChanged) lastTrigger = diskKey;
        if (repoChanged || fileChanged) await load(path);
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void check(), LIVE_POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, path, root]);

  const change = files.find((c) => c.path === path);
  const fileIndex = files.findIndex((c) => c.path === path);

  // Pencere başlığı IntelliJ'in biçiminde: `ad (klasör)`.
  useEffect(() => {
    void getCurrentWindow()
      .setTitle(diffWindowTitle(root, path, change?.origPath))
      .catch(() => {});
  }, [root, path, change?.origPath]);

  // ------------------------------------------------------------- fark

  const data = loaded;
  const base = data?.base ?? null;
  /** Sağ taraf diskte. */
  const disk = data?.current ?? null;
  const key = fileKey(root, path);
  const editing = edit?.key === key ? edit : null;
  /** Sağ taraf ekranda: yazılan metin, yoksa diskteki. Fark ve `»` bunu kullanıyor. */
  const current = useMemo(
    () => (disk && editing && editing.raw !== disk.text ? { ...disk, text: editing.raw } : disk),
    [disk, editing],
  );
  const diskNow = useRef<{ key: string; text: string } | null>(null);
  diskNow.current = disk && !disk.binary ? { key, text: disk.text } : null;
  const mode: Mode = error
    ? "error"
    : !data
      ? "loading"
      : base && disk
        ? base.binary || disk.binary
          ? "binary"
          : "two"
        : disk
          ? disk.binary
            ? "binary"
            : "added"
          : base
            ? base.binary
              ? "binary"
              : "deleted"
            : "missing";

  const highlightOff = prefs.highlight === "none";
  const diff: TextDiff | null = useMemo(() => {
    if (mode !== "two" || !base || !current) return null;
    // "Do not highlight": fark hesaplanmıyor, iki metin olduğu gibi.
    if (highlightOff) return { lines1: splitLines(base.text), lines2: splitLines(current.text), changes: [] };
    return diffTexts(base.text, current.text, { ignore: prefs.ignore, highlight: prefs.highlight });
  }, [mode, base, current, highlightOff, prefs.ignore, prefs.highlight]);

  const changes = useMemo(() => diff?.changes ?? [], [diff]);
  const visible = countChanges(changes);

  const gaps = useMemo(
    () => (diff ? unchangedGaps(changes, diff.lines1.length, diff.lines2.length) : []),
    [diff, changes],
  );
  const gapKey = (g: Gap) => `${g.start1}:${g.end1}:${g.start2}:${g.end2}`;
  /** Katlamalar ve her birinin hangi aralıktan geldiği (tıklayınca bir kademe açılsın). */
  const { folds, foldGaps } = useMemo(() => {
    const out: Fold[] = [];
    const from: Gap[] = [];
    if (prefs.collapse && visible > 0) {
      for (const gap of gaps) {
        const level = levels.get(gapKey(gap)) ?? 0;
        if (level >= FOLD_LEVELS) continue;
        const fold = foldGap(gap, CONTEXT_RANGE * 2 ** level);
        if (fold) {
          out.push(fold);
          from.push(gap);
        }
      }
    }
    return { folds: out, foldGaps: from };
  }, [gaps, levels, prefs.collapse, visible]);

  const expandFold = (k: number) => {
    const gap = foldGaps[k];
    if (!gap) return;
    setLevels((prev) => {
      const next = new Map(prev);
      next.set(gapKey(gap), (prev.get(gapKey(gap)) ?? 0) + 1);
      return next;
    });
  };

  // ------------------------------------------------------------- gezinme

  const scrollTo = (side: 1 | 2, line: number) => {
    setCaret({ side, line });
    // Yazarken F7: imleç de farka gidiyor (IntelliJ'de de), yoksa yazılan eski yere düşerdi.
    if (side === 2 && editorFocused()) editorHandle.current?.focusLine(line);
    panes.current?.scrollToLine(side, line);
  };

  const goToChange = (index: number, side = caret.side) => {
    const c = changes[index];
    scrollTo(side, side === 1 ? c.start1 : c.start2);
  };

  // Yeni dosya açıldı: IntelliJ ilk farka gidiyor (önceki dosyaya geçildiyse son farka).
  useEffect(() => {
    if (!jump.current || mode === "loading") return;
    const where = jump.current;
    jump.current = null;
    if (mode === "added" || mode === "deleted") {
      setCaret({ side: mode === "deleted" ? 1 : 2, line: 0 });
      return;
    }
    if (!diff) return;
    const first = changes.findIndex((c) => !c.ignored);
    if (first < 0) {
      setCaret({ side: 2, line: 0 });
      return;
    }
    let index = first;
    if (where === "last") for (let i = changes.length - 1; i >= 0; i--) if (!changes[i].ignored) { index = i; break; }
    // Bölmeler bu çizimde kuruluyor; kaydırma bir sonraki karede.
    const side = 2;
    const line = changes[index].start2;
    setCaret({ side, line });
    window.setTimeout(() => panes.current?.scrollToLine(side, line), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, diff]);

  // Görünüm değişince (yan yana ↔ birleşik) imlecin satırı yerinde kalsın:
  // yeni bölmeler sıfırdan kuruluyor ve kendi başına en tepeden başlardı.
  const caretRef = useRef(caret);
  caretRef.current = caret;
  useEffect(() => {
    const { side, line } = caretRef.current;
    const timer = window.setTimeout(() => panes.current?.scrollToLine(side, line), 0);
    return () => window.clearTimeout(timer);
  }, [prefs.viewer]);

  const openFile = (p: string, where: "first" | "last") => {
    // Kayıt yazılan dosyanın kimliğini kendisi taşıyor; geçişi beklemesine gerek yok.
    void flush();
    setMenu(null);
    setBanner(true);
    setLevels(new Map());
    jump.current = where;
    setPath(p);
  };

  /*
   * Değişiklikler panelinde başka bir dosyaya tıklandı: ikinci pencere
   * açılmıyor, bu pencere ona geçiyor (Rust öne getiriyor). Aynı dosyaysa
   * yalnızca öne geldi; yerinde kalıyor. Başka bir depoysa liste o depoya ait
   * değil (geri alma geçmişi zaten dosya başına).
   *
   * Dinleyici kurulunca Rust'a hazır olduğumuzu söylüyoruz: sayfa yüklenirken
   * gelen tıklama orada bekliyor (olay o an kaybolurdu).
   */
  const retarget = useRef<(query: string | null) => void>(() => {});
  retarget.current = (query) => {
    const next = query ? parseDiffQuery(query) : null;
    if (!next || (next.root === root && next.path === path)) return;
    if (next.root !== root) {
      setRoot(next.root);
      setFiles([]);
    }
    openFile(next.path, "first");
  };
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onDiffTarget((query) => retarget.current(query)).then((fn) => {
      if (disposed) return fn();
      unlisten = fn;
      void api
        .diffWindowReady()
        .then((query) => retarget.current(query))
        .catch(() => {});
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Sayfa yeniden yüklenirse (geliştirmede tam yenileme) gösterilen dosyayla açılsın.
  useEffect(() => {
    window.history.replaceState(null, "", `?${diffQuery({ root, path })}`);
  }, [root, path]);

  const nextFile = fileIndex >= 0 && fileIndex < files.length - 1 ? files[fileIndex + 1] : null;
  const prevFile = fileIndex > 0 ? files[fileIndex - 1] : null;

  const nextIndex = mode === "two" ? nextChangeIndex(changes, caret.side, caret.line) : null;
  const prevIndex = mode === "two" ? prevChangeIndex(changes, caret.side, caret.line) : null;

  /**
   * Son farkta F7 DOĞRUDAN sonraki dosyanın ilk farkına, ilk farkta Shift+F7
   * önceki dosyanın son farkına geçiyor.
   *
   * IntelliJ burada önce "Press again to go to the next file" deyip ikinci
   * basışı bekliyor. Bu ara adım bilinçli olarak YOK — İSTEK: "o yazıyı
   * kaldıralım, basınca geçer zaten." Ayrıca bir hata kaynağıydı: ikinci
   * basıştan önce gelen her olay (Shift'in kendi keydown'u, düğmenin
   * `mousedown`u) ipucunu siliyor ve geçiş hiç olmuyordu.
   */
  const step = (dir: "next" | "prev") => {
    const index = dir === "next" ? nextIndex : prevIndex;
    if (index !== null) {
      goToChange(index);
      return;
    }
    const file = dir === "next" ? nextFile : prevFile;
    if (file) openFile(file.path, dir === "next" ? "first" : "last");
  };

  // ------------------------------------------------------------- yazma

  /** Dosyanın satır sonu; karışıksa `null` ve yazı alanı yok (`»` yine çalışıyor). */
  const eol = useMemo(() => (disk && !disk.binary && !disk.truncated ? editableEol(disk.text) : null), [disk]);
  const indent = useMemo(() => (disk && !disk.binary ? indentUnit(toDisplay(disk.text, "\r\n")) : "    "), [disk]);
  const display = useMemo(() => (current && eol ? toDisplay(current.text, eol) : ""), [current, eol]);

  /**
   * Sağ taraf burada yazılabilir mi: metin, tam okunmuş, tek tür satır sonu.
   * Yan yana görünümde ya da yeni dosyada; birleşik görünümde ve katlanmış
   * satır varken yazı alanı yok (satırları bölmeninkilerle örtüşmüyor).
   */
  const editable = !!disk && !disk.binary && !disk.truncated && eol !== null && (mode === "two" || mode === "added");

  /** `»` gösterilsin mi: sağ dosya tam okundu ve iki taraflı fark. */
  const canApply = mode === "two" && !!current && !current.truncated && !highlightOff;

  const historyFor = (k: string) => {
    if (history.current.key !== k) history.current = { key: k, log: new EditHistory() };
    return history.current.log;
  };

  /**
   * Sağ tarafın yeni metni (dosyanın kendi biçiminde): geçmişe giriyor ve
   * kaydediliyor. Klavyeden gelen bir duraksamadan sonra, `»` hemen.
   */
  const rewrite = (next: string, typing: boolean) => {
    const ed = editRef.current?.key === key ? editRef.current : null;
    const base = ed ? ed.base : diskNow.current?.key === key ? diskNow.current.text : null;
    if (base === null) return;
    const prev = ed ? ed.raw : base;
    const step = textEdit(prev, next);
    if (!step) return;
    historyFor(key).push(step, typing);
    putEdit({ key, raw: next, base });
    if (typing) scheduleSave();
    else void flush();
  };

  const applyAt = (index: number, append: boolean) => {
    if (!canApply || !diff || !current) return;
    const c = changes[index];
    if (!c || c.ignored) return;
    const after = append ? appendChange(current.text, diff.lines1, c) : applyChange(current.text, diff.lines1, c);
    if (after !== current.text) rewrite(after, false);
  };

  /**
   * Ctrl+Z / Cmd+Z: yazılanı ve `»`ü aynı sırayla geri alıyor; imleç
   * değişikliğin yerine gidiyor.
   */
  const undoRedo = (which: "undo" | "redo") => {
    const ed = editRef.current?.key === key ? editRef.current : null;
    const base = ed ? ed.base : diskNow.current?.key === key ? diskNow.current.text : null;
    if (base === null) return;
    const log = historyFor(key);
    const step = which === "undo" ? log.undo() : log.redo();
    if (!step) return;
    const next = applyEdit(ed ? ed.raw : base, step.edit);
    putEdit({ key, raw: next, base });
    void flush();
    const offset = eol ? displayOffset(next, step.caret, eol) : step.caret;
    setSelection({ start: offset, end: offset, seq: ++selectionSeq.current });
    const line = lineAt(next, step.caret);
    setCaret({ side: 2, line });
    // Odaktaki yazı alanı imleci kendisi gösteriyor.
    if (!editorFocused()) panes.current?.scrollToLine(2, line);
  };

  /** Çakışmada: buradaki değişiklikleri bırak, diskteki gelsin. */
  const loadDisk = () => {
    putIssue(null);
    putEdit(null);
    history.current = { key, log: new EditHistory() };
    void load(path);
  };

  /** Çakışmada: diskteki hâlin üzerine buradakini yaz. */
  const keepMine = async () => {
    putIssue(null);
    resolving.current = true;
    try {
      await load(path);
    } finally {
      resolving.current = false;
    }
    void flush();
  };

  /** Yazı alanı şu an ekranda mı (düzenleme açık ve görünüm onu taşıyabiliyor). */
  const editorShown =
    editMode && editable && eol !== null && (mode === "added" || (prefs.viewer === "side" && folds.length === 0));

  /** Düzenlemeyi kapatır: bekleyen kayıt hemen, sağ taraf yeniden salt okunur. */
  const stopEditing = () => {
    setEditMode(false);
    void flush();
  };

  /**
   * Kalem ("Düzenle", F4 / ⌘↓): düzenlemeyi açıp kapatıyor. Açarken imleç
   * sağdaki yazı alanına, imlecin satırına gidiyor.
   *
   * BİLDİRİLEN: "basınca dosya açılıyor fakat düzenleme yapamıyorum" ve
   * ardından "düzenleme de bizim terminalimizde olmalı" — dış düzenleyici
   * değil, IntelliJ'deki gibi farkın sağ tarafı. Birleşik görünümde ya da
   * katlanmış satır varken yazı alanı yok: önce yan yana / açık görünüme
   * geçiliyor. Burada yazılamayan dosya (ikili, çok büyük, karışık satır
   * sonu) ana pencerenin görüntüleyicisinde açılıyor.
   */
  const editSource = () => {
    if (!disk) return;
    if (!editable) {
      void api.mainWindowOpenFile(`${root}/${path}`).catch((err) => flash(String(err)));
      return;
    }
    if (editorShown) return stopEditing();
    setEditMode(true);
    const line = caret.side === 2 ? caret.line : Math.floor(transferLine(changes, caret.line, true));
    if (mode === "two" && prefs.viewer !== "side") update({ viewer: "side" });
    if (folds.length > 0) update({ collapse: false });
    focusRequest.current = line;
    setFocusTick((n) => n + 1);
  };

  useEffect(() => {
    const line = focusRequest.current;
    if (line === null || !editorHandle.current) return;
    focusRequest.current = null;
    editorHandle.current.focusLine(line);
    panes.current?.scrollToLine(2, line);
  });

  const log = history.current.key === key ? history.current.log : null;
  const canUndo = !!log?.canUndo;
  const canRedo = !!log?.canRedo;
  /** Yazılmış ama henüz diske gitmemiş bir şey var (kayıt kendiliğinden de oluyor). */
  const dirty = !!editing && editing.raw !== editing.base;

  const binding: EditorBinding | null =
    editMode && editable && eol
      ? {
          text: display,
          selection,
          indent,
          onInput: (text, typing) => rewrite(toFile(text, eol), typing),
          onCaretLine: (line) => setCaret((prev) => (prev.side === 2 && prev.line === line ? prev : { side: 2, line })),
          onUndo: () => undoRedo("undo"),
          onRedo: () => undoRedo("redo"),
          handle: editorHandle,
          label: t("diff.currentVersion"),
        }
      : null;

  // ------------------------------------------------------------- klavye

  // Klavye işleyicisi her çizimde güncel kapanışı görsün: tek dinleyici, ref'ten çağrı.
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandler.current = (event: KeyboardEvent) => {
    // IME bir sözcük kurarken (Esc onu iptal ediyor) tuşlar onun.
    if (event.isComposing) return;
    const keys = keymap();
    const inEditor = editorFocused();
    if (event.key === "Control") setAppendMode(true);
    const run = (fn: () => void) => {
      event.preventDefault();
      event.stopPropagation();
      fn();
    };
    if (event.key === "Escape") {
      // Açık menü önce kapanıyor, sonra düzenleme; sonra pencere (IntelliJ: `closeOnEsc`).
      return run(() => {
        if (menu) setMenu(null);
        else if (editorShown) stopEditing();
        else void getCurrentWindow().close();
      });
    }
    if (matchCombo(event, keys.nextDiff)) return run(() => step("next"));
    if (matchCombo(event, keys.prevDiff)) return run(() => step("prev"));
    if (matchCombo(event, keys.nextFile) || (isMac() && event.metaKey && event.shiftKey && event.code === "BracketRight")) {
      return run(() => nextFile && openFile(nextFile.path, "first"));
    }
    if (matchCombo(event, keys.prevFile) || (isMac() && event.metaKey && event.shiftKey && event.code === "BracketLeft")) {
      return run(() => prevFile && openFile(prevFile.path, "first"));
    }
    // Yazı alanındayken mac'te ⌘↓ tarayıcının (metnin sonuna gidiyor); F4 orada da kalem.
    const nativeDown = inEditor && isMac() && matchCombo(event, keys.source);
    if (!nativeDown && (matchCombo(event, keys.source) || (isMac() && matchCombo(event, "F4")))) return run(editSource);
    if (matchCombo(event, keys.settings)) return run(() => setMenu(menu === "settings" ? null : "settings"));
    if (matchCombo(event, keys.apply)) {
      return run(() => {
        const index = changeAtLine(changes, caret.side, caret.line) ?? nextChangeIndex(changes, caret.side, caret.line - 1);
        if (index !== null) applyAt(index, false);
      });
    }
    if (matchCombo(event, keys.opposite)) {
      return run(() => {
        if (mode !== "two") return;
        const other: 1 | 2 = caret.side === 1 ? 2 : 1;
        const index = changeAtLine(changes, caret.side, caret.line);
        const line = index !== null ? (other === 1 ? changes[index].start1 : changes[index].start2) : caret.line;
        setCaret({ side: other, line });
      });
    }
    const mod = isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (mod && !event.altKey && event.code === "KeyW") return run(() => void getCurrentWindow().close());
    if (mod && !event.altKey && !event.shiftKey && event.code === "KeyS") return run(() => void flush());
    if (mod && !event.altKey && event.code === "KeyZ") return run(() => undoRedo(event.shiftKey ? "redo" : "undo"));
    if (!isMac() && mod && !event.shiftKey && event.code === "KeyY") return run(() => undoRedo("redo"));
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => keyHandler.current(event);
    const up = (event: KeyboardEvent) => {
      if (event.key === "Control") setAppendMode(false);
    };
    // Pencereden çıkınca bekleyen kayıt hemen (IntelliJ de pencereden çıkınca kaydediyor).
    const blur = () => {
      setAppendMode(false);
      void flushRef.current();
    };
    window.addEventListener("keydown", down, { capture: true });
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    // WebView'ün kendi sağ tık menüsü (Yenile, İncele) burada da anlamsız;
    // yazı alanında kalıyor (Kes / Kopyala / Yapıştır).
    const menuOff = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLTextAreaElement)) event.preventDefault();
    };
    document.addEventListener("contextmenu", menuOff);
    /*
     * Kapatırken (Esc, ⌘W, pencerenin düğmesi) yazılmamış değişiklik
     * kaybolmasın. Asılı kalan bir kayıt pencereyi kapanmaz da bırakmasın.
     */
    let unlistenClose: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow()
      .onCloseRequested(async () => {
        await Promise.race([flushRef.current(), new Promise((resolve) => window.setTimeout(resolve, 2000))]);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlistenClose = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlistenClose?.();
      window.removeEventListener("keydown", down, { capture: true });
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("contextmenu", menuOff);
    };
  }, []);

  // ------------------------------------------------------------- çizim

  const keys = keymap();
  // `prettyCombo` tuş adını küçük harfe çeviriyor (ayar dosyasındaki biçim);
  // işlev tuşu ipucunda IntelliJ'deki gibi büyük: `⇧F7`, `F4`. ÖLÇÜLDÜ: gerçek
  // pencerenin erişilebilirlik ağacında ipucu "Önceki fark (⇧f7)" okunuyordu.
  const shortcut = (title: string, combo: string) =>
    `${title} (${prettyCombo(combo).replace(/f(\d{1,2})$/, "F$1")})`;
  const fontSize = settings?.appearance.fontSize ?? 14;
  // JetBrains Mono'nun satır ölçüsü 1.32em; IntelliJ'in satır aralığı 1.2.
  // 14px'te 22px — belgedeki ekran görüntüsünde ölçülen satır yüksekliği.
  const lineHeight = Math.round(fontSize * 1.584);

  const labels: PaneLabels = {
    apply: shortcut(t("diff.revert"), keys.apply),
    append: t("diff.append"),
    fold: (n) => tp("git.unmodifiedLines", n),
  };

  const status = (() => {
    if (mode !== "two") return null;
    if (highlightOff) return t("diff.highlightOff");
    if (visible > 0) return tp("diff.count", visible);
    return base && current && splitLines(base.text).join("\n") !== splitLines(current.text).join("\n")
      ? t("diff.ignored")
      : t("diff.noDifferences");
  })();

  /** Bilgi bandı (IntelliJ `DiffNotifications`): yalnızca metinler AYNIYSA ya da dosya kesildiyse. */
  const bannerText: string | null = (() => {
    if (!banner || !data) return null;
    if ((base?.truncated || current?.truncated) && mode === "two") return t("diff.tooLarge");
    if (mode !== "two" || !base || !current) return null;
    if (base.text === current.text) return t("diff.identical");
    if (splitLines(base.text).join("\n") === splitLines(current.text).join("\n")) return t("diff.onlySeparators");
    return null;
  })();

  const separatorsDiffer =
    mode === "two" && !!base && !!current && separatorLabel(base.text) !== separatorLabel(current.text);

  const baseTitle = (
    <DiffTitle
      lock
      lockLabel={t("diff.readOnly")}
      revision={data?.head ?? ""}
      path={change?.origPath ?? path}
      separator={separatorsDiffer && base ? separatorLabel(base.text) : null}
    />
  );
  /*
   * Sağ başlık düzenlemenin açık olup olmadığını söylüyor. İSTEK: "kalem
   * açık kapalı özelliği ekledik ama kullanıcının da anlaması gerek."
   * Kapalıyken solda olduğu gibi kilit (IntelliJ'de kilit = salt okunur) ve
   * ipucunda nasıl açılacağı; açıkken vurgu renginde kalem ve "Düzenleniyor".
   */
  const currentTitle = (
    <DiffTitle
      lock={!editorShown}
      lockLabel={editable ? shortcut(t("diff.readOnlyEditHint"), keys.source) : t("diff.readOnly")}
      editing={editorShown ? t("diff.editing") : null}
      revision={t("diff.currentVersion")}
      path={mode === "added" || (change?.origPath && change.origPath !== path) ? path : null}
      separator={separatorsDiffer && current ? separatorLabel(current.text) : null}
    />
  );

  const multi = files.length > 1;
  const counter = !multi
    ? t("diff.oneFile")
    : t("diff.fileOf", { i: fileIndex >= 0 ? fileIndex + 1 : "?", n: files.length });

  const editorStyle = {
    ["--dw-font-size" as string]: `${fontSize}px`,
    ["--dw-line-height" as string]: `${lineHeight}px`,
  };

  let body: ReactNode;
  if (mode === "loading") body = <div className="dw-message">{t("common.loading")}</div>;
  else if (mode === "error") {
    body = (
      <div className="dw-message">
        <p>{t("diff.loadFailed")}</p>
        <p className="mono">{error}</p>
      </div>
    );
  } else if (mode === "missing") body = <div className="dw-message">{t("diff.missing")}</div>;
  else if (mode === "binary") {
    body = (
      <div className="dw-message">
        {!base ? t("diff.contentAdded") : !current ? t("diff.contentRemoved") : t("diff.binaryDifferent")}
      </div>
    );
  } else if (mode === "added" || mode === "deleted") {
    const text = (mode === "added" ? current : base)!.text;
    body = (
      <OneSide
        ref={panes}
        lines={splitLines(text)}
        kind={mode === "added" ? "ins" : "del"}
        lineHeight={lineHeight}
        colorize={!highlightOff}
        caret={caret}
        onCaret={setCaret}
        labels={labels}
        editor={mode === "added" ? binding : null}
      />
    );
  } else if (diff && prefs.viewer === "side") {
    body = (
      <SideBySide
        ref={panes}
        diff={diff}
        folds={folds}
        lineHeight={lineHeight}
        colorize={!highlightOff}
        sync={sync}
        caret={caret}
        onCaret={setCaret}
        onFold={expandFold}
        canApply={canApply}
        onApply={(i) => applyAt(i, false)}
        appendMode={appendMode}
        onAppend={(i) => applyAt(i, true)}
        labels={labels}
        editor={binding}
      />
    );
  } else if (diff) {
    body = (
      <Unified
        ref={panes}
        diff={diff}
        folds={folds}
        lineHeight={lineHeight}
        colorize={!highlightOff}
        caret={caret}
        onCaret={setCaret}
        onFold={expandFold}
        canApply={canApply}
        onApply={(i) => applyAt(i, false)}
        labels={labels}
      />
    );
  }

  return (
    <div className="dw" style={editorStyle}>
      <div className="dw-toolbar" role="toolbar">
        <div className="dw-tools">
          <ToolButton
            title={shortcut(t("diff.prevDifference"), keys.prevDiff)}
            disabled={prevIndex === null && !prevFile}
            onClick={() => step("prev")}
          >
            <ToolIcon d="M8 13 V3.5 M4 7.5 L8 3.5 L12 7.5" />
          </ToolButton>
          <ToolButton
            title={shortcut(t("diff.nextDifference"), keys.nextDiff)}
            disabled={nextIndex === null && !nextFile}
            onClick={() => step("next")}
          >
            <ToolIcon d="M8 3 V12.5 M4 8.5 L8 12.5 L12 8.5" />
          </ToolButton>
          <span className="dw-sep" />
          <ToolButton
            name="edit"
            title={shortcut(t(editorShown ? "diff.stopEditing" : "diff.openInEditor"), keys.source)}
            disabled={!disk}
            pressed={editorShown}
            accent
            onClick={editSource}
          >
            <ToolIcon d="M10.5 2.8 L13.2 5.5 L5.6 13.1 L2.6 13.4 L2.9 10.4 Z M9.2 4.1 L11.9 6.8" />
          </ToolButton>
          {/* İSTEK: "düzenle, geri al, ileri al, kaydet gibi şeyler de olmalı."
              Kısayolları zaten vardı; düğmeler onları görünür kılıyor. Kayıt
              kendiliğinden de oluyor; Kaydet beklemeden yazıyor. */}
          <ToolButton
            name="undo"
            title={shortcut(t("edit.undo"), keys.undo)}
            disabled={!canUndo}
            onClick={() => undoRedo("undo")}
          >
            <ToolIcon d={UNDO_ICON} />
          </ToolButton>
          <ToolButton
            name="redo"
            title={shortcut(t("edit.redo"), keys.redo)}
            disabled={!canRedo}
            onClick={() => undoRedo("redo")}
          >
            <ToolIcon d={REDO_ICON} />
          </ToolButton>
          <ToolButton name="save" title={shortcut(t("edit.save"), keys.save)} disabled={!dirty} onClick={() => void flush()}>
            <ToolIcon d={SAVE_ICON} />
          </ToolButton>
          <span className="dw-sep" />
          {multi && (
            <ToolButton
              title={shortcut(t("diff.prevFile"), keys.prevFile)}
              disabled={!prevFile}
              onClick={() => prevFile && openFile(prevFile.path, "first")}
            >
              <ToolIcon d="M13 8 H3.5 M7.5 4 L3.5 8 L7.5 12" />
            </ToolButton>
          )}
          <div className="dw-files-anchor">
            <button
              type="button"
              className="dw-files"
              disabled={!multi}
              title={t("diff.goToFile")}
              onClick={() => setMenu(menu === "files" ? null : "files")}
            >
              {counter}
            </button>
            {menu === "files" && (
              <FilesPopup
                files={files}
                current={path}
                onPick={(p) => openFile(p, "first")}
                onClose={() => setMenu(null)}
              />
            )}
          </div>
          {multi && (
            <ToolButton
              title={shortcut(t("diff.nextFile"), keys.nextFile)}
              disabled={!nextFile}
              onClick={() => nextFile && openFile(nextFile.path, "first")}
            >
              <ToolIcon d="M3 8 H12.5 M8.5 4 L12.5 8 L8.5 12" />
            </ToolButton>
          )}
          <span className="dw-sep" />
          <ToolButton
            title={t("diff.collapse")}
            pressed={prefs.collapse}
            disabled={mode !== "two"}
            onClick={() => {
              setLevels(new Map());
              update({ collapse: !prefs.collapse });
            }}
          >
            <ToolIcon d="M4 3 L8 6.5 L12 3 M4 13 L8 9.5 L12 13" />
          </ToolButton>
        </div>

        <div className="dw-status">{status}</div>

        <div className="dw-viewer" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={prefs.viewer === "side"}
            className={prefs.viewer === "side" ? "on" : ""}
            title={t("diff.sideBySide")}
            onClick={() => update({ viewer: "side" })}
          >
            <ToolIcon d="M2.5 3.5 H13.5 V12.5 H2.5 Z M8 3.5 V12.5" />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={prefs.viewer === "unified"}
            className={prefs.viewer === "unified" ? "on" : ""}
            title={t("diff.unified")}
            onClick={() => update({ viewer: "unified" })}
          >
            <ToolIcon d="M3.5 3.5 H12.5 V12.5 H3.5 Z" />
          </button>
        </div>

        <div className="dw-gear-anchor">
          <ToolButton
            title={shortcut(t("diff.settings"), keys.settings)}
            pressed={menu === "settings"}
            onClick={() => setMenu(menu === "settings" ? null : "settings")}
          >
            <GearIcon />
          </ToolButton>
          {menu === "settings" && (
            <SettingsMenu
              sync={sync}
              ignore={prefs.ignore}
              highlight={prefs.highlight}
              onSync={() => setSync(!sync)}
              onIgnore={(ignore) => update({ ignore })}
              onHighlight={(highlight) => update({ highlight })}
              onClose={() => setMenu(null)}
            />
          )}
        </div>
      </div>

      {(mode === "two" || mode === "added" || mode === "deleted") && (
        <div className={`dw-titles ${mode === "two" && prefs.viewer === "side" ? "two" : "stack"}`}>
          {mode === "two" && (
            <>
              {baseTitle}
              {prefs.viewer === "side" && <span className="dw-title-gap" />}
              {currentTitle}
            </>
          )}
          {mode === "added" && currentTitle}
          {mode === "deleted" && baseTitle}
        </div>
      )}

      {issue?.key === key && (
        <div className="dw-banner warn" role="alert">
          <span>{issue.kind === "conflict" ? t("diff.conflict") : t("diff.notText")}</span>
          <button type="button" className="dw-link" onClick={loadDisk}>
            {t("diff.loadDisk")}
          </button>
          {issue.kind === "conflict" && (
            <button type="button" className="dw-link" onClick={() => void keepMine()}>
              {t("diff.keepMine")}
            </button>
          )}
        </div>
      )}

      {bannerText && (
        <div className="dw-banner">
          <span>{bannerText}</span>
          <button type="button" className="dw-link" onClick={() => setBanner(false)}>
            {t("diff.hide")}
          </button>
        </div>
      )}

      <div className="dw-body">{body}</div>

      {notice && <div className="toast err">{notice}</div>}
    </div>
  );
}

// ------------------------------------------------------------- parçalar

/**
 * Editörün üstündeki başlık: kilit (salt okunur), sürüm ve soluk yol.
 *
 * Yerel değişiklikte IntelliJ solda HEAD'in sekiz haneli kısa kimliğini ve
 * dosyanın yolunu, sağda "Current version" yazıyor; dal adı hiçbir yerde yok.
 * Satır ayırıcıları iki tarafta farklıysa sağda etiketi (LF / CRLF).
 */
function DiffTitle(props: {
  lock?: boolean;
  lockLabel?: string;
  /** Sağ taraf şu an yazılabilir: kalem simgesi ve "Düzenleniyor". */
  editing?: string | null;
  revision: string;
  path: string | null;
  separator: string | null;
}) {
  return (
    <div className={props.editing ? "dw-title editing" : "dw-title"}>
      {props.lock && (
        <span className="dw-lock" title={props.lockLabel} aria-label={props.lockLabel}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7.5" rx="1.5" />
            <path d="M5.5 7 V5 A2.5 2.5 0 0 1 10.5 5 V7" />
          </svg>
        </span>
      )}
      <span className="dw-rev">{props.revision}</span>
      {props.path && (
        <span className="dw-path" title={props.path}>
          {props.path}
        </span>
      )}
      {props.separator && (
        <span className={`dw-sep-label ${props.separator === "LF" ? "lf" : "crlf"}`}>{props.separator}</span>
      )}
      {props.editing && (
        <span className="dw-editing">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.5 2.8 L13.2 5.5 L5.6 13.1 L2.6 13.4 L2.9 10.4 Z M9.2 4.1 L11.9 6.8" />
          </svg>
          {props.editing}
        </span>
      )}
    </div>
  );
}

function ToolButton(props: {
  title: string;
  disabled?: boolean;
  pressed?: boolean;
  /** Basılıyken vurgu renginde (bir KİP açık: düzenleme). */
  accent?: boolean;
  /** Testlerin ve ekran okuyucunun değişmeyen adı (başlık duruma göre değişiyor). */
  name?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-tool={props.name}
      className={`dw-tool${props.pressed ? " on" : ""}${props.pressed && props.accent ? " accent" : ""}`}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/** Yeni arayüz simgeleri ince çizgili: uygulamanın 1.7'lik çizgisi burada kalın kaçıyor. */
function ToolIcon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Ayar dişlisi ve sağ altındaki küçük açılır ok (IntelliJ'in "Settings" düğmesi). */
function GearIcon() {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8 V3.2 M8 12.8 V14.2 M1.8 8 H3.2 M12.8 8 H14.2 M3.6 3.6 L4.6 4.6 M11.4 11.4 L12.4 12.4 M3.6 12.4 L4.6 11.4 M11.4 4.6 L12.4 3.6" strokeLinecap="round" />
      <circle cx="8" cy="8" r="4.6" />
      <path d="M14.5 12.5 L16 14 L17.5 12.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Dışarı tıklayınca kapanan açılır kutu. */
function usePopupClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (event: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [onClose]);
  return ref;
}

const IGNORE_KEYS: [IgnorePolicy, MsgKey][] = [
  ["none", "diff.ignore.none"],
  ["trim", "diff.ignore.trim"],
  ["whitespace", "diff.ignore.whitespace"],
  ["blankLines", "diff.ignore.blankLines"],
];

const HIGHLIGHT_KEYS: [HighlightPolicy, MsgKey][] = [
  ["words", "diff.highlight.words"],
  ["lines", "diff.highlight.lines"],
  ["split", "diff.highlight.split"],
  ["chars", "diff.highlight.chars"],
  ["none", "diff.highlight.none"],
];

/**
 * Dişlinin menüsü — IntelliJ 2026.2'de boşluk ve vurgulama seçenekleri araç
 * çubuğundaki açılır listelerden buraya, alt menülere taşındı.
 *
 * Seçim menüyü KAPATMIYOR (IntelliJ kapatıyor). İSTEK: "her seçim yaptığımda
 * kapanıyor, yeniden açmak durumunda kalıyorum." Seçeneklerin işi farkı
 * karşılaştırmalı denemek; her denemede menüyü yeniden açmak o işi bölüyordu.
 * Seçimin etkisi hemen arkada görünüyor, onay işareti yeni seçeneğe geçiyor.
 * Kapatmak: dışarı tıklamak, Esc ya da dişliye yeniden basmak.
 */
function SettingsMenu(props: {
  sync: boolean;
  ignore: IgnorePolicy;
  highlight: HighlightPolicy;
  onSync: () => void;
  onIgnore: (value: IgnorePolicy) => void;
  onHighlight: (value: HighlightPolicy) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ref = usePopupClose(props.onClose);
  const [sub, setSub] = useState<"ignore" | "highlight" | null>(null);
  return (
    <div className="dw-menu" ref={ref} role="menu">
      <button type="button" role="menuitemcheckbox" aria-checked={props.sync} className="dw-menu-item" onMouseEnter={() => setSub(null)} onClick={props.onSync}>
        <span className="dw-check">{props.sync ? <CheckMark /> : null}</span>
        {t("diff.syncScroll")}
      </button>
      <div className="dw-menu-sep" />
      {(
        [
          ["ignore", "diff.ignore", IGNORE_KEYS, props.ignore, props.onIgnore],
          ["highlight", "diff.highlight", HIGHLIGHT_KEYS, props.highlight, props.onHighlight],
        ] as const
      ).map(([id, label, items, value, pick]) => (
        <div key={id} className="dw-menu-sub" onMouseEnter={() => setSub(id)}>
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub === id} className={sub === id ? "dw-menu-item on" : "dw-menu-item"} onClick={() => setSub(sub === id ? null : id)}>
            <span className="dw-check" />
            {t(label)}
            <span className="dw-menu-arrow">›</span>
          </button>
          {sub === id && (
            <div className="dw-menu dw-submenu" role="menu">
              {(items as readonly [string, MsgKey][]).map(([key, msg]) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === key}
                  className="dw-menu-item"
                  onClick={() => (pick as (v: string) => void)(key)}
                >
                  <span className="dw-check">{value === key ? <CheckMark /> : null}</span>
                  {t(msg)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2.5 6.2 L5 8.5 L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * "Go to Changed File" açılır listesi: sayaca basınca değişen dosyalar.
 * Durum simgesi Değişiklikler panelindekiyle aynı dili konuşuyor.
 */
function FilesPopup(props: {
  files: readonly GitChange[];
  current: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const ref = usePopupClose(props.onClose);
  return (
    <div className="dw-menu dw-files-menu" ref={ref} role="menu">
      {props.files.map((file) => (
        <FileItem key={file.path} file={file} active={file.path === props.current} onPick={props.onPick} />
      ))}
    </div>
  );
}

function FileItem(props: { file: GitChange; active: boolean; onPick: (path: string) => void }) {
  const { text, tone, Icon } = useLabel(props.file.status);
  return (
    <button
      type="button"
      role="menuitem"
      className={props.active ? "dw-menu-item on" : "dw-menu-item"}
      title={props.file.path}
      onClick={() => props.onPick(props.file.path)}
    >
      <span className={`git-icon ${tone}`} role="img" aria-label={text}>
        <Icon size={13} />
      </span>
      <span className="dw-file-name">{baseName(props.file.path)}</span>
      <span className="dw-file-dir">{props.file.path}</span>
    </button>
  );
}
