import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  contextLines,
  diffItems,
  diffStat,
  parseDiff,
  splitGap,
  type DiffLine,
} from "../lib/diff";
import { tp, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";
import {
  ArrowIcon,
  ChevronIcon,
  CopyIcon,
  OpenFileIcon,
  RevertIcon,
  UnfoldIcon,
  GitAddedIcon,
  GitDeletedIcon,
  GitModifiedIcon,
  GitRenamedIcon,
  GitUntrackedIcon,
} from "./Icons";
import type { GitChange } from "../types";

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
 * Satırlar AÇIK geliyor: aranan şey "neler değişmiş" ve onun yanıtı listenin
 * tamamı. Bedeli de bilinçli karşılandı — istekler dörtlü bir kuyruktan
 * geçiyor (`DIFF_LIMIT`), yoksa yüz dosyalık bir değişiklik yüz `git` süreci
 * demek.
 */
export function GitChanges() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const allGit = useStore((s) => s.gitInfo);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const cwd = tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;
  const git = cwd ? (allGit[cwd] ?? null) : null;
  const changes = git?.changes ?? [];

  /*
   * Satırlar AÇIK açılıyor; listede tutulan da KAPATILANLAR.
   *
   * İki karar var ve ikisi de bilinçli.
   *
   * 1. Varsayılan açık. Önceki hâli akordeondu: aynı anda tek bir dosya
   *    açılıyor, ötekine geçmek öncekini kapatıyordu. "Neler değişmiş"
   *    sorusunun yanıtı ise listenin TAMAMI — her dosyayı tek tek açmak
   *    aynı soruyu dosya sayısı kadar sormak demekti.
   *
   * 2. Kümede açık olanlar değil KAPALI olanlar duruyor. Liste git
   *    yoklamasıyla kendiliğinden değişiyor; "açıklar" kümesi tutulsaydı yeni
   *    beliren bir dosya kapalı gelir ve tam da görülmesi gereken şey gizli
   *    kalırdı. Bu yönde ise listeye ne girerse açık geliyor, kapalı kalan
   *    yalnızca kullanıcının elle kapattığı.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <div className="panel-list git-list">
      {!git && <div className="pop-empty">{t("git.noRepo")}</div>}
      {git && changes.length === 0 && <div className="pop-empty">{t("git.clean")}</div>}

      {changes.map((change) => (
        <ChangeRow
          key={change.status + change.path}
          change={change}
          cwd={cwd!}
          root={git?.root || cwd!}
          open={!collapsed.has(change.path)}
          onToggle={() => toggle(change.path)}
        />
      ))}
    </div>
  );
}

/**
 * Aynı anda koşan `git diff` sayısı.
 *
 * Sınır ARTIK GEREKLİ: akordeon hâlinde tek seferde tek satır açıktı, yani
 * istek de tek taneydi. Hepsi açık açılınca yüz dosyalık bir değişiklik yüz
 * `git` sürecini AYNI ANDA doğuruyor ve makine bunu hissediyor.
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

/**
 * Durum harflerinin okunabilir karşılığı.
 *
 * Porcelain iki karakter veriyor: ilki indeks, ikincisi çalışma ağacı. `??`
 * takip edilmeyen. Bileşik durumlarda (`AM`) İNDEKS harfi belirleyici, çünkü
 * commit'e girecek olan o.
 *
 * ## Neden yazı değil simge
 *
 * Etiket ("DEĞİŞTİ", "YENİDEN ADLANDIRILDI") sabit 88px'lik bir sütun
 * tutuyordu ve o sütun dosya YOLUNDAN çalınmıştı: panel dar olduğunda asıl
 * aranan bilgi kırpılıyor, her satırda tekrarlanan aynı beş kelimeden biri
 * yerinde duruyordu. Durum listede zaten renkle kodlanmış; simge o rengi
 * taşıyor, tam metin ipucunda ve ekran okuyucuda kalıyor — yani hiçbir bilgi
 * kaybolmuyor, yalnızca yerini bırakıyor.
 */
type StatusLook = {
  text: string;
  tone: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
};

function useLabel(status: string): StatusLook {
  const t = useT();
  const trimmed = status.trim();
  if (trimmed === "??")
    return { text: t("git.untracked"), tone: "untracked", Icon: GitUntrackedIcon };
  const kod = trimmed[0] ?? "";
  if (kod === "A") return { text: t("git.added"), tone: "new", Icon: GitAddedIcon };
  if (kod === "D") return { text: t("git.deleted"), tone: "del", Icon: GitDeletedIcon };
  if (kod === "R") return { text: t("git.renamed"), tone: "mod", Icon: GitRenamedIcon };
  return { text: t("git.modified"), tone: "mod", Icon: GitModifiedIcon };
}

function ChangeRow({
  change,
  cwd,
  root,
  open,
  onToggle,
}: {
  change: GitChange;
  /** Kabuğun bulunduğu dizin; git komutları depo kökünü buradan buluyor. */
  cwd: string;
  /** Deponun kökü; `change.path` ona göre. */
  root: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const { text, tone, Icon } = useLabel(change.status);
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
    const key = `${root}|${cwd}|${change.path}|${change.status}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;

    let cancelled = false;
    const untracked = change.status.trim() === "??";
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
  }, [open, root, cwd, change.path, change.status]);

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
      <button type="button" className="git-row" title={change.path} onClick={onToggle}>
        <span className="git-caret" aria-hidden="true">
          <ChevronIcon open={open} size={11} />
        </span>
        {/* İpucu satırın kendisininkinden (dosya yolu) ayrı: simgenin
            üstünde durumun adı, geri kalanında yol. */}
        <span className={`git-icon ${tone}`} title={text} role="img" aria-label={text}>
          <Icon size={13} />
        </span>
        {/* Yol BAŞTAN kırpılıyor: uzun yollarda ayırt edici olan dosya adı,
            klasör zinciri değil. */}
        <span className="git-path">{change.path}</span>
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
       * ve gizli bir eylem, bir kez keşfedilene kadar yok demek. Üçünün her
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
              .then(() => useStore.getState().toast(t("git.pathCopied"), "ok"))
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
          <OpenFileIcon size={14} />
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
