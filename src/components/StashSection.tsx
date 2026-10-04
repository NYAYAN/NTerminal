import { useEffect, useRef, useState } from "react";

import { baseName, dirName, formatWhen } from "../lib/format";
import { hiddenFileCount } from "../lib/gitStash";
import { tp, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import type { GitInfo, GitStash, StashFile, StashFiles } from "../types";
import { useActiveGit, useLabel } from "./gitShared";
import { ChevronIcon, GearIcon, StashIcon, TrashIcon, UnstashIcon } from "./Icons";
import { StashDiff } from "./StashDiff";

/**
 * Stash bölümü: "Değişiklikler" sekmesinin listesinin en üstünde açılıp kapanan
 * bir başlık; içinde stash'lerin listesi, içerikleri ve yönetimi.
 *
 * ## Neden sekme değil, bölüm
 *
 * İlk hâli dördüncü bir sekmeydi ve geri alındı: panelin başlığına sığmıyordu
 * (üç sekme ~326px, sağdaki üç simge ~96px; varsayılan 390px'te dört etiket de
 * kırpılıyordu). Stash zaten değişikliklerle aynı konunun parçası — çalışma
 * ağacındaki işin kenara alınmış hâli — ve stash'e atma düğmesi de Değişiklikler'de
 * (commit kutusunda). Yani aynı sekmede durması yolculuğu kısaltıyor.
 *
 * Başlık HER ZAMAN çiziliyor (depo varken), sayaç yalnızca stash varken: temiz bir
 * çalışma ağacında da stash'i uygulamak gerekiyor (en sık an bu) ve o zaman liste
 * "Değişiklik yok" yazısından başka bir şey göstermez; bölüm olmasa stash'e
 * ulaşılamazdı. Varsayılan KAPALI (`ui.stashOpen`): çoğu zaman aranan şey
 * değişiklik listesi.
 *
 * ## IntelliJ'deki gibi
 *
 * İstek: "stash yapısı, IntelliJ / WebStorm'daki gibi: kişi istediklerini stash
 * atsın, isimlendirebilsin, stash'ı açsın." Oradaki "Unstash Changes" penceresi
 * bir stash listesi, üstünde "Pop stash" ve "Reinstate Index" kutuları ve bir
 * "Apply" düğmesi. Burada da aynı: liste satırında TEK bir uygula eylemi, nasıl
 * uygulanacağını iki kutu belirliyor. İki ayrı simge (uygula / uygula ve sil) yan
 * yana durunca hangisinin ne yaptığı ipucuna bakmadan anlaşılmıyordu; kutu ise
 * durumu taşıyor.
 *
 * ## Kutular başlıktaki ayar simgesinin küçük penceresinde
 *
 * Kutular önce açık bölümün üstünde duruyordu ve her açılışta yer kaplıyordu (istek:
 * "Stash altında 2 checkbox var, ayar ikonu koyalım, basınca küçük bir tooltip içinde
 * çıksın"). Simge sayacın SOLUNDA ve yalnızca bölüm başlığında; kutular ona basınca
 * çıkıyor. Kutular gizlendiği için bir seçenek AÇIKKEN (özellikle "uyguladıktan sonra
 * sil", geri dönüşü olmayan taraf) simge vurgulu duruyor ve satırdaki uygula simgesinin
 * ipucu da hangisinin geçerli olduğunu söylüyor.
 *
 * Satıra tıklamak İÇERİĞİ açıyor (dosyalar, dosyaya tıklayınca fark) — IntelliJ'deki
 * "View". Ayrı bir görüntüleme penceresi yok: liste kaybolmadan bakmak,
 * Değişiklikler sekmesinin de dayandığı ilke.
 *
 * ## Liste ne zaman okunuyor
 *
 * Yalnızca bölüm AÇIKKEN (`StashList` açılınca kuruluyor, kapanınca sökülüyor) ve
 * `git` durumu (`useActiveGit`) her tazelendiğinde yeniden. Tazelemeyi zaten
 * tetikleyen her şey listeyi de tazeliyor: kendi işlemlerimiz (`gitWrite`), komut
 * sonu ve terminalden atılan bir `git stash` (imza stash günlüğünü de izliyor,
 * bkz. `git.rs` `fingerprint`). Ayrı bir yoklama ya da depoda ikinci bir liste
 * kopyası yok. Kapalıyken yalnızca sayaç (`GitInfo.stashCount`) görünüyor.
 */
export function StashSection() {
  const t = useT();
  const { cwd, git } = useActiveGit();
  const open = useStore((s) => s.ui.stashOpen);
  const setUi = useStore((s) => s.setUi);

  if (!cwd || !git) return null;

  return (
    <div className="stash-section">
      {/*
        Başlık satırı açıp kapatıyor AMA satırın kendisi düğme değil: içinde ayar düğmesi
        var ve iç içe düğme hem geçersiz işaretleme hem karışık tıklama (bkz. `.git-head`).
        Gerçek düğme `stash-toggle` (klavye ve ekran okuyucu için). Tıklama satıra kadar
        kabarcıklanıyor ve TEK işleyici satırda: satırın boşluğuna ya da sayaca basmak da
        açıp kapatıyor. Ayar simgesi kabarcığı keserek satırı açıp kapatmıyor.
      */}
      <div className="stash-section-head" onClick={() => setUi({ stashOpen: !open })}>
        <button type="button" className="stash-toggle" aria-expanded={open}>
          <span className="git-caret" aria-hidden="true">
            <ChevronIcon open={open} size={11} />
          </span>
          <StashIcon size={13} />
          <span>{t("app.stash")}</span>
        </button>
        <StashSettings />
        {git.stashCount > 0 && <span className="pill-count">{git.stashCount}</span>}
      </div>
      {open && <StashList cwd={cwd} git={git} />}
    </div>
  );
}

/**
 * Ayar simgesi ve açtığı küçük pencere: "uyguladıktan sonra sil" ve "indeksi geri yükle".
 *
 * Pencere simgenin altında, başlık satırına göre konumlanıyor (`position: absolute`,
 * bkz. `.stash-settings-pop`): dar panelde de içeride kalıyor, paneli kaydırmıyor.
 * Dışarı basınca ve Esc ile kapanıyor; Esc yakalanıyor (capture) yoksa uygulamanın genel
 * kısayolu başka bir örtüyü kapatırdı (bkz. `StashDialog`) ve odak simgeye dönüyor.
 * Açılırken ilk kutuya odaklanıyor: klavyeyle açan kişi hemen kullanabilsin.
 *
 * Açık durumu bileşende (yerel): geçici bir arayüz durumu, panel değişince kapanması yeterli.
 * Kutuların DEĞERİ ise depoda (`ui.stashPop`, `ui.stashIndex`): seçim sekme değişince ve
 * pencere kapanınca kalıyor.
 */
function StashSettings() {
  const t = useT();
  const pop = useStore((s) => s.ui.stashPop);
  const index = useStore((s) => s.ui.stashIndex);
  const setUi = useStore((s) => s.setUi);
  const [open, setOpen] = useState(false);
  const gear = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (gear.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      gear.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  // `onClick` kabarcığı kesiyor: simgeye ve pencerenin içine basmak başlık satırını
  // (açıp kapatan işleyici) tetiklemesin.
  return (
    <span className="stash-settings" onClick={(e) => e.stopPropagation()}>
      <button
        ref={gear}
        type="button"
        className={pop || index ? "icon-btn on" : "icon-btn"}
        title={t("git.stashOptions")}
        aria-label={t("git.stashOptions")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <GearIcon size={13} />
      </button>
      {open && (
        <div
          ref={panel}
          className="stash-settings-pop"
          role="dialog"
          aria-label={t("git.stashOptions")}
        >
          <label className="check-row" title={t("git.stashPopHint")}>
            <input
              type="checkbox"
              checked={pop}
              onChange={(e) => setUi({ stashPop: e.target.checked })}
            />
            <span>{t("git.stashPop")}</span>
          </label>
          <label className="check-row" title={t("git.stashIndexHint")}>
            <input
              type="checkbox"
              checked={index}
              onChange={(e) => setUi({ stashIndex: e.target.checked })}
            />
            <span>{t("git.stashIndex")}</span>
          </label>
        </div>
      )}
    </span>
  );
}

/** Açık bölümün gövdesi: stash'lerin listesi (seçenekler başlıktaki ayar simgesinde). */
function StashList({ cwd, git }: { cwd: string; git: GitInfo }) {
  const t = useT();
  const pop = useStore((s) => s.ui.stashPop);
  const index = useStore((s) => s.ui.stashIndex);

  const [list, setList] = useState<GitStash[] | null>(null);
  /**
   * Listenin okunamadığını söyleyen metin.
   *
   * Okuma hatası "Stash yok" diye GÖSTERİLMİYOR: eski hâli hatayı yutup boş liste
   * çiziyordu ve kullanıcı stash'lerinin kaybolduğunu sanırdı. Gerçek örnek: uygulamanın
   * Rust tarafı eski bir derlemeydi ("Command git_stashes not found"); boş liste bunu
   * gizleyip özelliği bozuk gösterirdi.
   */
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; text: string } | null>(null);
  /** İşlemi süren stash'in kimliği; bu sırada başka bir işlem başlamıyor. */
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .gitStashes(cwd)
      .then((l) => {
        if (cancelled) return;
        setList(l);
        setListError(null);
      })
      .catch((err) => {
        if (!cancelled) setListError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, git]);

  // Başka bir depoya geçildi: öncekinin hatası burada anlamsız.
  useEffect(() => {
    setError(null);
  }, [cwd]);

  const label = (stash: GitStash) => stash.name || t("git.stashUnnamed");

  const apply = async (stash: GitStash) => {
    if (busy) return;
    const store = useStore.getState();
    setError(null);
    setBusy(stash.id);
    try {
      await store.applyStash(cwd, stash.id, { pop, index });
      store.toast(t(pop ? "git.stashPopped" : "git.stashApplied", { name: label(stash) }), "ok");
    } catch (err) {
      // Çakışmada git dosyaları `UU` bırakıyor ve stash'i SİLMİYOR; metin nedenini
      // söylüyor, çakışan dosyalar Değişiklikler'de görünüyor (durum tazelendi).
      setError({ title: t("git.stashApplyFailed"), text: String(err) });
    } finally {
      setBusy(null);
    }
  };

  /*
   * Silme GERİ ALINAMAZ (karma yalnızca `git fsck` ile bulunur), o yüzden her
   * zaman soruluyor. Çıkış yolu da yazıyor: önce uygulanabilir. "Uygula ve sil"
   * ise sormuyor: içerik silinmiyor, çalışma ağacına taşınıyor ve kutuyu
   * kullanıcı açıkça açmış; çakışmada git zaten silmiyor.
   */
  const drop = async (stash: GitStash) => {
    if (busy) return;
    const store = useStore.getState();
    const ok = await store.askConfirm({
      title: t("confirm.dropStashTitle"),
      message: t("confirm.dropStashMessage", { name: label(stash) }),
      detail: t("confirm.dropStashDetail"),
      confirmLabel: t("confirm.delete"),
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setBusy(stash.id);
    try {
      await store.dropStash(cwd, stash.id);
      store.toast(t("git.stashDropped", { name: label(stash) }), "ok");
    } catch (err) {
      setError({ title: t("git.stashDropFailed"), text: String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stash-body">
      {error && (
        <div className="git-commit-error" role="alert">
          <div className="git-commit-error-head">
            <strong>{error.title}</strong>
            <button
              type="button"
              className="icon-btn"
              title={t("common.close")}
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
          {/* Git'in kendi metni, olduğu gibi (bkz. `GitCommitBox`). */}
          <pre>{error.text}</pre>
        </div>
      )}

      {listError && (
        <div className="git-commit-error" role="alert">
          <strong>{t("git.stashListFailed")}</strong>
          <pre>{listError}</pre>
        </div>
      )}

      {!listError && list === null && <div className="pop-empty">{t("common.loading")}</div>}
      {!listError && list !== null && list.length === 0 && (
        <div className="pop-empty stash-empty">
          <div>{t("git.stashEmpty")}</div>
          <div className="dim">{t("git.stashEmptyHint")}</div>
        </div>
      )}

      {!listError && list?.map((stash) => (
        <StashRow
          key={stash.id}
          cwd={cwd}
          stash={stash}
          pop={pop}
          busy={busy === stash.id}
          disabled={busy !== null}
          onApply={() => void apply(stash)}
          onDrop={() => void drop(stash)}
        />
      ))}
    </div>
  );
}

/**
 * Listedeki tek stash: başlık satırı ve (açıksa) içeriği.
 *
 * Başlık satırı `Değişiklikler`in dosya satırıyla AYNI sınıfları kullanıyor
 * (`git-item`, `git-head`, `git-row`, `git-actions`): aynı düzen, aynı eylem
 * ağırlığı (soluk, üstüne gelince parlak), aynı katlama oku.
 */
function StashRow({
  cwd,
  stash,
  pop,
  busy,
  disabled,
  onApply,
  onDrop,
}: {
  cwd: string;
  stash: GitStash;
  pop: boolean;
  busy: boolean;
  disabled: boolean;
  onApply: () => void;
  onDrop: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const when = formatWhen(stash.time * 1000);
  const meta = [stash.branch, when].filter(Boolean).join(" · ");

  return (
    <div className={open ? "git-item open" : "git-item"} aria-busy={busy}>
      <div className="git-head">
        <button
          type="button"
          className="git-row"
          title={stash.name}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="git-caret" aria-hidden="true">
            <ChevronIcon open={open} size={11} />
          </span>
          {!stash.named && <span className="stash-wip">{t("git.stashUnnamed")}</span>}
          <span className="git-path stash-name">{stash.name}</span>
          <span className="stash-meta">{meta}</span>
        </button>
        <div className="git-actions">
          <button
            type="button"
            className="icon-btn"
            disabled={disabled}
            title={t(pop ? "git.stashApplyPop" : "git.stashApplyKeep")}
            aria-label={t(pop ? "git.stashApplyPop" : "git.stashApplyKeep")}
            onClick={onApply}
          >
            <UnstashIcon size={14} />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            disabled={disabled}
            title={t("git.stashDrop")}
            aria-label={t("git.stashDrop")}
            onClick={onDrop}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      {open && <StashContents cwd={cwd} stash={stash} />}
    </div>
  );
}

/**
 * Açılan stash'in dosyaları.
 *
 * Dosya listesi ve toplam sayı Rust'tan geliyor; liste 200'de kesiliyor ve
 * kesildiği "… ve N dosya daha" satırıyla söyleniyor (sessizce kesmek "dosyam
 * nerede" diye sordururdu).
 */
function StashContents({ cwd, stash }: { cwd: string; stash: GitStash }) {
  const t = useT();
  const [data, setData] = useState<StashFiles | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(null);
    api
      .gitStashFiles(cwd, stash.id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setFailed(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, stash.id]);

  // Hata git'in kendi metni: stash artık yoksa ("liste değişmiş olabilir") bunu
  // söylüyor ve liste zaten tazelenince satır kayboluyor.
  if (failed) return <div className="pop-empty">{failed}</div>;
  if (!data) return <div className="pop-empty">{t("common.loading")}</div>;
  if (data.files.length === 0) {
    return <div className="pop-empty">{t("git.stashNoFilesInside")}</div>;
  }

  const hidden = hiddenFileCount(data.total, data.files.length);
  return (
    <div className="stash-files">
      {data.files.map((file) => (
        <StashFileRow key={file.path} cwd={cwd} id={stash.id} file={file} />
      ))}
      {hidden > 0 && <div className="pop-empty">{tp("git.stashMoreFiles", hidden)}</div>}
    </div>
  );
}

/**
 * Stash içindeki tek dosya: satıra tıklayınca farkı açılıyor.
 *
 * Fark yalnızca AÇILINCA isteniyor: yüz dosyalık bir stash'te hepsini önden
 * istemek yüz `git` süreci demek (bkz. `DIFF_LIMIT` `GitChanges`te). Gelen sonuç
 * saklanıyor; satırı kapatıp açmak yeni istek üretmiyor.
 */
function StashFileRow({ cwd, id, file }: { cwd: string; id: string; file: StashFile }) {
  const t = useT();
  const { text, tone, Icon } = useLabel(file.status);
  const [open, setOpen] = useState(false);
  /** `undefined` = henüz istenmedi, `null` = okunamadı. */
  const [diff, setDiff] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!open || diff !== undefined) return;
    let cancelled = false;
    api
      .gitStashDiff(cwd, id, file.path, file.origPath, file.untracked)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch(() => {
        if (!cancelled) setDiff(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, diff, cwd, id, file.path, file.origPath, file.untracked]);

  /*
   * Klasör ön eki Değişiklikler listesiyle AYNI ayardan (`ui.gitShowPaths`,
   * panel başlığındaki klasör düğmesi). İSTEK: "Klasör yollarını göster
   * etkisi Stash'te de olmalı" — burada her zaman çiziliyordu.
   */
  const showPaths = useStore((s) => s.ui.gitShowPaths);
  const dir = dirName(file.path);
  return (
    <div className={open ? "stash-file open" : "stash-file"}>
      <button
        type="button"
        className="git-row"
        title={file.origPath ? `${file.origPath} → ${file.path}` : file.path}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="git-caret" aria-hidden="true">
          <ChevronIcon open={open} size={11} />
        </span>
        <span className={`git-icon ${tone}`} title={text} role="img" aria-label={text}>
          <Icon size={13} />
        </span>
        {showPaths && dir && <span className="git-dir">{dir}</span>}
        <span className="git-path">{baseName(file.path)}</span>
      </button>
      {open && diff === undefined && <div className="pop-empty">{t("common.loading")}</div>}
      {open && diff !== undefined && (diff === null || diff === "") && (
        <div className="pop-empty">{t("git.noDiff")}</div>
      )}
      {open && diff && <StashDiff text={diff} />}
    </div>
  );
}
