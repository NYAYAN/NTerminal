import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  contextLines,
  diffItems,
  diffStat,
  parseDiff,
  splitGap,
  type DiffLine,
} from "../lib/diff";
import { openDiffWindow } from "../lib/diffWindow";
import { baseName, dirName } from "../lib/format";
import { changeTotal, diffKind, stagePaths, stageState, stageSummary, unstagePaths } from "../lib/gitStage";
import { tp, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import {
  ArrowIcon,
  ChevronIcon,
  CopyIcon,
  DiffWindowIcon,
  FolderIcon,
  RevertIcon,
  UnfoldIcon,
} from "./Icons";
import type { GitChange, GitInfo } from "../types";
import { GitCommitBox } from "./GitCommit";
import { useActiveGit, useLabel } from "./gitShared";
import { StashSection } from "./StashSection";

/**
 * Değişen dosyalar — sağ panelin "Değişiklikler" sekmesi.
 *
 * ## Neden var olan panelin içinde
 *
 * İlk hâli kendi çekmecesiydi ve geri alındı. Kullanıcının zaten bildiği
 * çekmece bu: geçmiş ve favoriler orada. İkinci bir çekmece ikinci bir kapatma
 * yolu, ikinci bir genişlik tutamacı ve ikinci bir "bu nasıl kapanıyor" sorusu
 * demekti.
 *
 * ## Fark YERİNDE açılıyor
 *
 * Dosyaya tıklamak satırı katlıyor ve altında farkı gösteriyor. Önceki hâli
 * `git diff` komutunu komut satırına yazıyordu — çalışması için bir tuş daha
 * gerekiyordu ve çıktı terminale gidip listeyi ekrandan atıyordu. Oysa aranan
 * şey "şu dosyada ne değişti" sorusunun listeyi KAYBETMEDEN yanıtlanması.
 *
 * Satırlar KAPALI geliyor (istek: "Değişiklikler default olarak hepsi kapalı
 * gelsin"): liste önce dosya adlarını gösteriyor, fark tıklayınca açılıyor.
 * Önceki hâli tersiydi — "neler değişmiş" sorusunun yanıtı listenin tamamı diye
 * satırlar açık geliyordu. Fark yalnızca AÇIK satır için isteniyor; yani elli
 * dosyalık bir değişiklik elli `git diff` ile başlamıyor. "Hepsini aç" düğmesi
 * ise hepsini birden istiyor ve dörtlü kuyruktan (`DIFF_LIMIT`) geçiyor.
 */
/**
 * Toplu katlamanın yönü: hiçbiri açık değilse düğme AÇAR, yoksa DARALTIR.
 *
 * Kısmen açıkken (biri açık, ötekiler kapalı) düğme DARALTIR: "listeyi topla"
 * her durumda tek basış, ikinci basış hepsini açıyor. Boş listede "hepsi kapalı"
 * saymıyoruz (`length > 0`): dosya yokken düğme zaten çizilmiyor, ama kural
 * burada olunca çağıranın ayrıca denetlemesi gerekmiyor.
 *
 * `expanded` listede artık olmayan yolları da taşıyabilir (bir dosya commit'lendi);
 * yalnızca GÜNCEL satırlara bakıldığı için sayılmıyorlar.
 */
export function allFilesCollapsed(
  changes: readonly GitChange[],
  expanded: readonly string[],
): boolean {
  if (changes.length === 0) return false;
  const open = new Set(expanded);
  return changes.every((change) => !open.has(change.path));
}

export function GitChanges() {
  const t = useT();
  const { cwd, git, changes, loading } = useActiveGit();

  /*
   * Satırlar KAPALI açılıyor; listede tutulan da AÇILANLAR.
   *
   * Küme boş başlıyor: liste dosya adlarıyla geliyor, farkı görmek isteyen
   * satıra tıklıyor (ya da başlıktaki düğmeyle hepsini açıyor). Önceki hâli
   * tersiydi ve akordeondan sonra gelmişti: satırlar açık geliyor, tutulan
   * KAPATILANLAR oluyordu. İstek üzerine yön döndü; yeni beliren bir dosya da
   * artık kapalı geliyor ve fark, satır açılana kadar istenmiyor.
   *
   * Küme DEPODA (`ui.gitExpanded`), bileşenin yerel durumunda değil: toplu
   * aç/kapa düğmesi panelin başlığında duruyor ve aynı gerçeği görmeli.
   */
  const expanded = useStore((s) => s.ui.gitExpanded);
  const showPaths = useStore((s) => s.ui.gitShowPaths);
  const setUi = useStore((s) => s.setUi);

  const toggle = (path: string) => {
    const next = new Set(expanded);
    if (!next.delete(path)) next.add(path);
    setUi({ gitExpanded: [...next] });
  };

  const expandedSet = useMemo(() => new Set(expanded), [expanded]);

  return (
    <>
      {/* Commit kutusu listenin DIŞINDA ve üstünde: liste kayarken ileti alanı
          ve düğmeler yerinde kalıyor. Kutu kendi görünürlüğüne kendisi karar
          veriyor (değişiklik yok ve gönderilecek bir şey yoksa hiçbir şey
          çizmiyor). */}
      {git && cwd && <GitCommitBox cwd={cwd} git={git} changes={changes} />}
      <div className="panel-list git-list">
      {/* Henüz bakılmamış dizin "depo değil" DEĞİL (bkz. `useActiveGit`). */}
      {loading && <div className="pop-empty">{t("common.loading")}</div>}
      {!loading && !git && <div className="pop-empty">{t("git.noRepo")}</div>}
      {/* Stash bölümü listenin en üstünde ve depo varken HER ZAMAN: temiz bir
          çalışma ağacında da stash'i uygulamak gerekiyor ve o zaman aşağıdaki
          "değişiklik yok" yazısından başka bir şey görünmezdi. Kendi görünürlüğüne
          kendisi karar veriyor (depo yoksa hiçbir şey çizmiyor). */}
      <StashSection />
      {git && changes.length === 0 && <div className="pop-empty">{t("git.clean")}</div>}
      {git && cwd && changes.length > 0 && <ChangesHeader cwd={cwd} git={git} changes={changes} />}

      {changes.map((change) => (
        <ChangeRow
          /*
           * Anahtar yalnızca YOL, durum değil.
           *
           * Önceki hâli `status + path` idi. Kutuya basmak durumu değiştiriyor
           * (` M` → `M `), yani satır SÖKÜLÜP yeniden kuruluyordu: açılmış
           * bağlam satırları kayboluyor, fark yeniden isteniyor ve — asıl kötüsü
           * — klavyeyle Boşluk'a basan kişinin odağı yok oluyordu. Yol bir
           * dosyayı tanımlıyor; durum onun bir özelliği.
           */
          key={change.path}
          change={change}
          cwd={cwd!}
          root={git?.root || cwd!}
          open={expandedSet.has(change.path)}
          showPaths={showPaths}
          onToggle={() => toggle(change.path)}
        />
      ))}
      </div>
    </>
  );
}

/**
 * Dosya listesinin başlığı: tablo başlığı gibi bir satır.
 *
 * İSTEK: "0 dosya seçildi checkbox'ını dosyaların üstüne alalım. Dosyaların
 * üstüne bir header ekleyelim. Table gibi olsun." Toplu seçim kutusu commit
 * kutusundaydı, yönettiği satırlardan uzakta; artık satırların kutularıyla AYNI
 * sütunda (aynı `.git-check` sınıfı, aynı sol boşluk), sütunun başında. Sağda
 * kaç dosyanın commit'e gireceği.
 *
 * Kutu üç hâlli: hepsi seçiliyse hepsini bırakıyor, yoksa (kısmen dâhil)
 * hepsini seçiyor. "Kısmen"de seçmek doğru yön: kutuya basan kişi "hepsini
 * commit'e al" diyor, geri almak için ikinci basış var.
 *
 * Hata KALICI ve başlığın hemen altında (commit kutusundaki hatayla aynı
 * görünüş): `git add` bir kilit ya da yok sayılan yol yüzünden düşebiliyor ve
 * git'in metni üç saniyelik bir bildirimde okunmaz.
 */
function ChangesHeader({
  cwd,
  git,
  changes,
}: {
  cwd: string;
  git: GitInfo;
  changes: readonly GitChange[];
}) {
  const t = useT();
  const summary = stageSummary(changes);
  const master = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "Kısmen" durumu yalnızca DOM özelliği olarak var, öznitelik değil.
  useEffect(() => {
    if (master.current) master.current.indeterminate = summary.state === "partial";
  });

  // Başka bir depoya geçildi: öncekinin hatası burada anlamsız.
  useEffect(() => {
    setError(null);
  }, [cwd]);

  const toggleAll = async () => {
    const store = useStore.getState();
    // Yeni bir deneme eski hatayı siliyor: yoksa başarılı bir seçimden sonra da
    // "Dosya seçimi değiştirilemedi" kutusu ekranda kalıyordu.
    setError(null);
    try {
      if (summary.state === "staged") await store.unstageFiles(cwd, unstagePaths(changes));
      else await store.stageFiles(cwd, stagePaths(changes));
    } catch (err) {
      setError(String(err));
    }
  };

  const label = t(summary.state === "staged" ? "git.deselectAll" : "git.selectAll");
  return (
    <>
      <div className="git-table-head">
        <input
          ref={master}
          type="checkbox"
          className="git-check"
          checked={summary.state === "staged"}
          title={label}
          aria-label={label}
          onChange={() => void toggleAll()}
        />
        <span className="git-table-col">{t("git.colFile")}</span>
        <span className="git-table-count">{tp("git.selectedOf", git.staged, { total: changeTotal(git) })}</span>
      </div>
      {error && (
        <div className="git-commit-error" role="alert">
          <div className="git-commit-error-head">
            <strong>{t("git.stageFailed")}</strong>
            <button
              type="button"
              className="icon-btn"
              title={t("common.close")}
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
          <pre>{error}</pre>
        </div>
      )}
    </>
  );
}

/**
 * Aynı anda koşan `git diff` sayısı.
 *
 * Sınır GEREKLİ: akordeon hâlinde tek seferde tek satır açıktı, yani istek de
 * tek taneydi. "Hepsini aç" düğmesi yüz dosyalık bir değişiklikte yüz `git`
 * sürecini AYNI ANDA doğuruyor ve makine bunu hissediyor (satırlar artık kapalı
 * geliyor, yani bu yalnızca o düğmeye basınca oluyor).
 *
 * Dört: bekleyen iş diskten okuma, çekirdek sayısını doldurmanın karşılığı
 * yok; kuyruk sıradan bir depoda zaten ilk karelerde eriyor.
 */
const DIFF_LIMIT = 4;

let diffRunning = 0;
const diffQueue: (() => void)[] = [];

/**
 * Bağlam açıcısının bir basışta açtığı satır sayısı.
 *
 * Elli: kullanıcının istediği sayı ve makul — bir ekran dolusu koddan biraz
 * fazlası. Kalan gizli satır bundan azsa hepsi bir basışta açılıyor, yoksa
 * son basış "3 satır için de bir düğme" gibi görünürdü.
 */
const EXPAND_STEP = 50;

/**
 * Dosya metnini satırlara böler.
 *
 * Sondaki boş parça ATILIYOR: metin `\n` ile bitiyorsa `split` son bir boş
 * dize üretiyor ve o, dosyada olmayan bir satır olarak sayılırdı — açıcı
 * "1 satır gizli" deyip basınca boş bir satır açardı.
 */
function splitLines(text: string): string[] {
  const out = text.split("\n");
  if (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * Kuyrukta sıra bekler; dönen işlev sırayı BIRAKIYOR ve çağrılmak zorunda.
 *
 * İptal edilen satır da bırakmalı (bu yüzden çağıran tarafta `finally`):
 * kapanan bir panel kuyruğu kilitli bırakırsa liste bir daha hiç yüklenmez.
 */
function acquireDiffSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const start = () => {
      diffRunning++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        diffRunning--;
        diffQueue.shift()?.();
      });
    };
    if (diffRunning < DIFF_LIMIT) start();
    else diffQueue.push(start);
  });
}

function ChangeRow({
  change,
  cwd,
  root,
  open,
  showPaths,
  onToggle,
}: {
  change: GitChange;
  /** Kabuğun bulunduğu dizin; git komutları depo kökünü buradan buluyor. */
  cwd: string;
  /** Deponun kökü; `change.path` ona göre. */
  root: string;
  open: boolean;
  /** Dosya adının solunda klasör zinciri de gösterilsin mi. */
  showPaths: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const { text, tone, Icon } = useLabel(change.status);
  /** Dosyanın commit'e girme durumu: kutunun üç hâli. */
  const stage = stageState(change.status);
  /**
   * Farkın nereden alınacağını belirleyen sınıf; sahnelemeden BAĞIMSIZ.
   *
   * Fark isteğinin anahtarı ve bağımlılığı ham durum değil bu: fark HEAD'e karşı
   * alınıyor (bkz. `git.rs` `diff`), yani kutuya basmak içeriği değiştirmiyor ve
   * her basışta `git diff` yeniden koşmamalı.
   */
  const kind = diffKind(change.status);
  /**
   * Kutuya az önce basıldı ve işlem sürüyor: kutu hedef durumu gösteriyor.
   *
   * `git add` + tazeleme yüzlerce milisaniye sürebiliyor; bu süre boyunca kutu
   * eski durumunda kalırsa basış işlemedi sanılıyor ve ikinci kez basılıyor
   * (ki bu ilkini geri alır). İşlem BİTİNCE (başarılı ya da değil) gerçek
   * durum çiziliyor: hata olduysa kutu kendiliğinden eski hâline dönüyor.
   */
  const [pending, setPending] = useState<boolean | null>(null);
  const [lines, setLines] = useState<DiffLine[] | null>(null);
  /**
   * Dosyanın ÇALIŞMA AĞACINDAKİ satırları; okunamadıysa boş dizi.
   *
   * Bağlam açıcıları buradan besleniyor. Fark metni gizli satırları
   * TAŞIMIYOR — `git diff` yalnızca değişenlerin çevresindeki üç satırı
   * veriyor — ve daha geniş bağlam istemek (`-U50`) her hunk'ın iki yanını
   * birden açardı; kullanıcının istediği ise yönlü açma.
   *
   * Çalışma ağacındaki dosya farkın YENİ tarafıdır, yani açılan satırlar
   * doğrudan oradan geliyor. Silinmiş dosyada okunacak bir şey yok; orada
   * dizi boş kalıyor ve açıcı hiç çizilmiyor.
   */
  const [fileLines, setFileLines] = useState<string[] | null>(null);
  /**
   * Boşluk başına açılmış satır sayıları.
   *
   * Anahtar boşluğun DEĞİŞMEYEN sınırları (`from-to`); açılma miktarları
   * değişse de anahtar sabit kalıyor. `top` açıcı satırın üstünde, `bottom`
   * altında açılan satır sayısı — adlar ekrandaki yöne göre.
   */
  const [opened, setOpened] = useState<Record<string, { top: number; bottom: number }>>({});
  /**
   * Hangi dosya için istek yapıldı.
   *
   * Durum yerine REF: "bunu zaten getirdim mi" sorusunun yanıtı bir yeniden
   * çizim tetiklememeli ve — asıl önemlisi — isteğin bağımlılığı olmamalı.
   * Bağımlılık olduğunda sonucu yazmak isteğin kendisini iptal ediyordu
   * (gerekçesi aşağıdaki etkide).
   */
  const loadedKey = useRef<string | null>(null);

  /** Boşluğun bir yanını `n` satır daha açar. */
  const expand = (key: string, yon: "top" | "bottom", n: number) =>
    setOpened((prev) => {
      const cur = prev[key] ?? { top: 0, bottom: 0 };
      return { ...prev, [key]: { ...cur, [yon]: cur[yon] + n } };
    });

  /*
   * Fark ve dosya yalnızca satır AÇIKKEN isteniyor.
   *
   * Kapalıyken de istemek yüz dosyalık bir değişiklikte yüz `git` süreci
   * demekti. Bir kez alınan sonuç saklanıyor: aynı satırı kapatıp açmak yeni
   * bir çağrı üretmiyor.
   *
   * Dosya okuması farkla AYNI kuyruktan geçiyor ama maliyeti bambaşka: `git
   * diff` bir süreç başlatıyor, bu yalnızca bir dosya okuyor. Farkla birlikte
   * alınması bilinçli — dosyanın sonunda gizli satır kalıp kalmadığı ancak
   * satır sayısı bilinince belli oluyor ve o bilinmeden "aşağıyı aç" düğmesi
   * çizilemez.
   *
   * ## Neden `lines` bağımlılık DEĞİL
   *
   * BİLDİRİLEN HATA: "'Bu satırlar açılamıyor — dosya okunamadı' yazıyor ama
   * dosya var." Sebep bir yarıştı ve tam olarak burada duruyordu.
   *
   * Eskiden koşul `if (!open || lines !== null) return` ve `lines` de
   * bağımlılıktı. Zincir şöyle işliyordu: `setLines` bir yeniden çizim
   * tetikliyor → `lines` değiştiği için React etkiyi yeniden koşuyor →
   * bundan ÖNCE eskisinin TEMİZLİĞİNİ çağırıyor → temizlik `cancelled = true`
   * diyor. Dosya okuması o an hâlâ yoldaysa sonucu atılıyor ve `fileLines`
   * sonsuza kadar boş kalıyordu; düğme de kapalı.
   *
   * Belirti yalnızca GERÇEK gecikmede çıkıyordu: sahte IPC anında çözüldüğü
   * için dosya, React yeniden çizmeye fırsat bulamadan geliyordu. Testi bu
   * yüzden okumayı bilinçli olarak bir sonraki döngüye atıyor.
   *
   * Bugün "bunu zaten getirdim mi" sorusunu bir ANAHTAR yanıtlıyor; durumun
   * kendisi bağımlılık değil, dolayısıyla sonucu yazmak isteği iptal
   * etmiyor.
   */
  useEffect(() => {
    if (!open) return;
    const key = `${root}|${cwd}|${change.path}|${kind}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;

    let cancelled = false;
    const untracked = kind === "untracked";
    void (async () => {
      const release = await acquireDiffSlot();
      try {
        if (cancelled) return;
        const text = await api.gitDiff(cwd, change.path, untracked).catch(() => null);
        if (cancelled) return;
        setLines(parseDiff(text ?? ""));

        // Takipsiz dosyanın farkı zaten dosyanın TAMAMI; açılacak boşluk yok.
        if (untracked) {
          setFileLines([]);
          return;
        }
        const file = await api.readTextFile(fullPath).catch(() => null);
        if (!cancelled) setFileLines(file && !file.binary ? splitLines(file.text) : []);
      } finally {
        release();
        // Gerçekten iptal edildiyse (satır kapandı, dosya değişti) anahtar
        // geri alınıyor: satır yeniden açıldığında istek de yeniden koşsun,
        // yoksa "Yükleniyor…" ekranda asılı kalırdı.
        if (cancelled && loadedKey.current === key) loadedKey.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, root, cwd, change.path, kind]);

  /*
   * Çizilecek öğeler: fark satırları ve aradaki GİZLİ aralıklar.
   *
   * Dosya satır sayısı ancak dosya okunduğunda biliniyor; okunmadıysa
   * (silinmiş dosya, ikili dosya, okuma hatası) sondaki boşluk hiç
   * üretilmiyor — bkz. `diffItems`.
   */
  const items = useMemo(
    () => (lines ? diffItems(lines, fileLines && fileLines.length > 0 ? fileLines.length : null) : []),
    [lines, fileLines],
  );
  /** Açacak içerik var mı: dosya okunamadıysa düğme çizilmiyor. */
  const canExpand = (fileLines?.length ?? 0) > 0;

  /* Satır numarası SOLDA, ayrı bir sütunda.
   *
   * Silinen satırda ESKİ, eklenen satırda YENİ numara yazıyor; bağlam
   * satırında ikisi de aynı şeyi gösterdiği için yeni yeterli. Tek sütun
   * bilinçli: iki sütun dar panelde metne kalan yeri yarıya indiriyor ve
   * fark okunamaz hâle geliyor.
   *
   * `user-select: none` (CSS): farkı kopyalayan kişi satır numaralarını
   * değil kodu istiyor. */
  const diffRow = (line: DiffLine, key: string) => (
    <div key={key} className={`diff-line ${line.kind}`}>
      <span className="diff-no" aria-hidden="true">
        {line.newLine ?? line.oldLine ?? ""}
      </span>
      <span className="diff-text">{line.text}</span>
    </div>
  );

  const stat = lines ? diffStat(lines) : null;
  const untracked = change.status.trim() === "??";
  // Yol depo KÖKÜNE göre (porcelain öyle veriyor), o yüzden tam yol da kökten
  // kuruluyor. Kabuğun dizinini kullanmak, kabuk bir alt klasördeyse var
  // olmayan bir yol üretiyordu.
  const fullPath = `${root}/${change.path}`;
  /** Yolun klasör kısmı; kökteki dosyada `null` ve ön ek hiç çizilmiyor. */
  const dir = dirName(change.path);

  /**
   * Kutuya basmak: commit'e ekle ya da çıkar.
   *
   * `none` ve `partial` durumunda EKLİYOR: kısmen eklenmiş dosyada kutu
   * "işaretli değil" sayılıyor ve basış geri kalan düzenlemeleri de dâhil
   * ediyor. Yalnızca tam eklenmiş dosyada çıkarıyor. Hata bildirimde: satırın
   * kendine ait bir hata alanı yok ve bir dosya eklenememesi nadir (kilitli
   * indeks gibi), toplu kutudaki gibi kalıcı bir kutuyu hak etmiyor.
   */
  const toggleStage = async () => {
    if (pending !== null) return;
    const store = useStore.getState();
    const include = stage !== "staged";
    setPending(include);
    try {
      if (include) await store.stageFiles(cwd, [change.path]);
      else await store.unstageFiles(cwd, unstagePaths([change]));
    } catch (err) {
      store.toast(String(err), "err");
    } finally {
      setPending(null);
    }
  };

  /*
   * Geri alma YIKICI, o yüzden her zaman soruyor.
   *
   * İki ayrı soru: takip edilen dosya son commit'teki hâline döner (geri
   * getirilebilir), takipsiz dosya SİLİNİR ve git'te kaydı olmadığı için geri
   * getirilemez. Aynı metni iki duruma da göstermek ikincisini olduğundan
   * masum gösterirdi.
   */
  const revert = async () => {
    const store = useStore.getState();
    const ok = await store.askConfirm({
      title: t(untracked ? "confirm.revertUntrackedTitle" : "confirm.revertTitle"),
      message: t(untracked ? "confirm.revertUntrackedMessage" : "confirm.revertMessage", {
        path: change.path,
      }),
      detail: t(untracked ? "confirm.revertUntrackedDetail" : "confirm.revertDetail"),
      confirmLabel: t(untracked ? "confirm.deleteFile" : "confirm.revertButton"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.gitRevert(cwd, change.path, untracked);
    } catch (err) {
      store.toast(String(err), "err");
      return;
    }
    // Liste komuttan bağımsız değişti; rozet ve satırlar tazelensin.
    await store.refreshGit(cwd);
  };

  return (
    <div className={open ? "git-item open" : "git-item"}>
      {/*
        Satır ile eylemler AYNI SIRADA, yan yana.

        Eylemler eskiden mutlak konumluydu ve yalnızca imleç satırdayken
        görünüyordu; sağ uçtaki sayacın (`+15 -1`) üstüne biniyorlardı. İkisi
        birden görünür olunca mutlak konum bir çakışma garantisine dönüşüyor —
        akışta durunca çakışma diye bir şey kalmıyor ve yola ayrılan yer
        kendiliğinden doğru hesaplanıyor.
      */}
      <div className="git-head">
      {/* Commit'e ekle / çıkar.
       *
       * Satırın SOLUNDA ve katlama düğmesinin DIŞINDA: satırın kendisi bir
       * düğme ve iç içe etkileşimli öge hem geçersiz işaretleme hem karışık
       * tıklama (kutuya basmak satırı katlıyordu). Üç hâl: işaretli (tam
       * eklendi), işaretsiz, ara (kısmen). Ara hâl yalnızca DOM özelliği. */}
      <input
        type="checkbox"
        className="git-check"
        checked={pending ?? stage === "staged"}
        ref={(el) => {
          if (el) el.indeterminate = pending === null && stage === "partial";
        }}
        onChange={() => void toggleStage()}
        title={t(stage === "staged" ? "git.unstage" : stage === "partial" ? "git.stagePartial" : "git.stage")}
        aria-label={t(stage === "staged" ? "git.unstage" : stage === "partial" ? "git.stagePartial" : "git.stage")}
      />
      <button type="button" className="git-row" title={change.path} onClick={onToggle}>
        <span className="git-caret" aria-hidden="true">
          <ChevronIcon open={open} size={11} />
        </span>
        {/* İpucu satırın kendisininkinden (dosya yolu) ayrı: simgenin
            üstünde durumun adı, geri kalanında yol. */}
        <span className={`git-icon ${tone}`} title={text} role="img" aria-label={text}>
          <Icon size={13} />
        </span>
        {/* Varsayılan olarak yalnızca DOSYA ADI.
         *
         * Liste dikey taranıyor ve aranan şey "hangi dosya değişmiş". Klasör
         * zinciri her satırda tekrarlanan, çoğu zaman aynı olan bir ön ekti;
         * dar panelde asıl ayırt edici bilgiyi — adı — kırpıyordu.
         *
         * Yol kaybolmuyor: başlıktaki düğme onu geri getiriyor (soluk bir ön
         * ek olarak, adın solunda) ve satırın `title` ipucunda her durumda
         * tam yol duruyor. */}
        {showPaths && dir && <span className="git-dir">{dir}</span>}
        <span className="git-path">{baseName(change.path)}</span>
        {stat && (
          <span className="git-stat">
            <span className="add">{`+${stat.added}`}</span>
            <span className="del">{`-${stat.removed}`}</span>
          </span>
        )}
      </button>

      {/* Satır eylemleri.
       *
       * Satırın KENDİSİ katlama düğmesi olduğu için bunlar onun dışında ve
       * ayrı düğmeler: iç içe düğme geçersiz işaretleme ve tıklamalar
       * karışıyor.
       *
       * HER ZAMAN görünüyorlar. Önceki hâlleri imleç satıra gelince beliriyordu
       * ve gizli bir eylem, bir kez keşfedilene kadar yok demek. Dördünün her
       * satırda bir araç çubuğu tarlası oluşturmaması için ağırlık düşürüldü:
       * soluk duruyorlar, satırın üstündeyken tam parlaklığa çıkıyorlar. */}
      <div className="git-actions">
        <button
          type="button"
          className="icon-btn"
          title={t("git.copyPath")}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(change.path)
              .then(() => useStore.getState().toast(t("common.pathCopied"), "ok"))
              .catch(() => {});
          }}
        >
          <CopyIcon size={14} />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          title={t("git.revert")}
          onClick={() => void revert()}
        >
          <RevertIcon size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t("git.openFile")}
          onClick={() => useStore.getState().openFile(fullPath)}
        >
          {/* Klasör simgesi: uygulamada "aç" eylemlerinin dili bu (dosya
              sütunu, dizin seçici). İSTEK: "dosya aç ikonu klasör ikonu
              olmalı, diğer ikonlarla tutarlı değil." */}
          <FolderIcon size={14} />
        </button>
        {/* Farkı ayrı bir pencerede, IntelliJ'deki gibi iki dosyanın TAMAMI yan
            yana. Satırın kendi farkı panelde açılıyor ama dar panelde yalnızca
            değişen satırların çevresi sığıyor; uzun bir dosyayı okumak, kaydırmak
            ve blok blok geri almak için pencere gerekiyor. "Dosyayı aç"ın
            yanında: ikisi de dosyayı panelin dışında açan eylemler. */}
        <button
          type="button"
          className="icon-btn"
          title={t("git.openDiffWindow")}
          onClick={() => {
            void openDiffWindow({ root, path: change.path }, change.origPath).catch((err) =>
              useStore.getState().toast(String(err), "err"),
            );
          }}
        >
          <DiffWindowIcon size={14} />
        </button>
      </div>
      </div>

      {open && (
        <div className="git-diff">
          {lines === null && <div className="pop-empty">{t("common.loading")}</div>}
          {lines !== null && lines.length === 0 && (
            <div className="pop-empty">{t("git.noDiff")}</div>
          )}
          {items.map((item, i) => {
            if (item.kind === "line") return diffRow(item.line, `l${i}`);

            // Boşluk yok (ilk hunk dosyanın başında): çizecek bir şey de yok.
            if (item.to < item.from) return null;

            const key = `${item.from}-${item.to}`;
            const state = opened[key] ?? { top: 0, bottom: 0 };
            const split = splitGap(item, state.top, state.bottom);
            const hiddenCount = split.hidden ? split.hidden.to - split.hidden.from + 1 : 0;
            const step = Math.min(EXPAND_STEP, hiddenCount);

            return (
              <Fragment key={`g${i}`}>
                {split.top &&
                  contextLines(fileLines ?? [], split.top.from, split.top.to).map((line, n) =>
                    diffRow(line, `${key}t${n}`),
                  )}

                {split.hidden && (
                  /*
                   * Açıcı satır.
                   *
                   * Oklar EKRANDAKİ yönü gösteriyor: yukarı ok satırları bu
                   * satırın üstünde, aşağı ok altında açıyor. Kalan gizli
                   * satır bir adımdan azsa tek bir "Tümünü aç" düğmesi
                   * kalıyor — iki yön de aynı sonucu verirken iki düğme
                   * göstermek seçim varmış gibi yapardı.
                   */
                  <div className="diff-gap">
                    {
                      // Düğmeler AYRI bir blokta, solda: satırın geri kalanı
                      // okunacak bir şey, burası basılacak bir şey. Warp'ın
                      // açıcısı da böyle ayrılıyor.
                      <span className="diff-gap-actions">
                        {!canExpand ? (
                          // Dosya okunamadı. Düğme yine çiziliyor ama kapalı:
                          // hiç çizmemek "burada açacak bir şey yok" diye
                          // okunuyordu ve kullanıcı düğmeyi arıyordu.
                          <button
                            type="button"
                            disabled
                            title={t("git.expandUnavailable", { path: fullPath })}
                          >
                            <UnfoldIcon size={12} />
                          </button>
                        ) : hiddenCount > EXPAND_STEP ? (
                          <>
                            <button
                              type="button"
                              title={t("git.expandDown", { n: step })}
                              onClick={() => expand(key, "top", step)}
                            >
                              <ArrowIcon dir="up" size={12} />
                            </button>
                            <button
                              type="button"
                              title={t("git.expandUp", { n: step })}
                              onClick={() => expand(key, "bottom", step)}
                            >
                              <ArrowIcon dir="down" size={12} />
                            </button>
                          </>
                        ) : (
                          // Kalan bir adımdan azken yön diye bir şey yok:
                          // iki ok da aynı sonucu verirdi. Tek düğme, iki
                          // yana açılan simgeyle.
                          <button
                            type="button"
                            title={t("git.expandAll")}
                            onClick={() => expand(key, "top", hiddenCount)}
                          >
                            <UnfoldIcon size={12} />
                          </button>
                        )}
                      </span>
                    }
                    <span className="diff-gap-count">
                      {tp("git.unmodifiedLines", hiddenCount)}
                    </span>
                    {/* Hunk başlığının tek özgün parçası: kapsayan işlevin
                        adı. Başlığın geri kalanı (satır numaraları) soldaki
                        sütunda zaten yazıyor. */}
                    {item.context && <span className="diff-gap-context">{item.context}</span>}
                  </div>
                )}

                {split.bottom &&
                  contextLines(fileLines ?? [], split.bottom.from, split.bottom.to).map(
                    (line, n) => diffRow(line, `${key}b${n}`),
                  )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
