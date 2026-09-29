import { useEffect, useMemo, useRef, useState } from "react";

import { checkoutCommand, isNavigable, pickerRows } from "../lib/branches";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { anchorAbove } from "../lib/popover";
import type { GitBranch } from "../types";
import { BranchIcon, ChevronIcon } from "./Icons";

/**
 * Dal seçici — dal rozetine tıklayınca açılıyor.
 *
 * ## Geçiş neden ÇALIŞTIRILIYOR
 *
 * Değişen dosyalar listesinde bir dosyaya tıklamak komutu satıra YAZIYOR,
 * çalıştırmıyor: `git diff` çıktısı uzun ve kullanıcı ne isteyeceğine karar
 * vermeli. Dal geçişi öyle değil — tek bir sonucu var ve `git checkout`
 * kendisi güvenli: çalışma ağacındaki değişiklikleri ezecekse git zaten
 * reddediyor. Geri dönüş de aynı komutla bir adım.
 *
 * Komut kabuktan geçiyor, uygulamanın içinden değil: geçmişte kaydı kalıyor,
 * çıktısı ekranda görünüyor ve hata olursa kullanıcı sebebini okuyor.
 *
 * ## Uzak dallar AYRI bir bölümde
 *
 * `git fetch` ile gelen dallar da listede ve seçilince `git checkout --track
 * origin/ad` gidiyor: yerel bir izleme dalı oluşuyor ve bunu komutun kendisi
 * söylüyor. Liste her açılışta yeniden okunuyor, önbellek yok — fetch sonrası
 * tıklamak yetiyor.
 *
 * Ama uzaklar yerel dallarla AYNI listedeyken karışıklık yaratıyordu (BİLDİRİLEN
 * SORUN) ve bir depoda yerel dallardan çok daha fazla olabiliyorlar. Şimdi
 * yerel dallar üstte, uzaklar sayıyla birlikte açılıp kapanan bir başlığın
 * altında ve varsayılan KAPALI. Kuralların tamamı ve gerekçeleri `pickerRows`
 * içinde; burası yalnızca çiziyor ve klavyeyi bağlıyor.
 */
export function BranchPicker({
  cwd,
  current,
  onClose,
}: {
  cwd: string;
  current: string;
  onClose: () => void;
}) {
  const t = useT();
  const [list, setList] = useState<GitBranch[] | null>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const remotesOpen = useStore((s) => s.ui.branchRemotesOpen);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /**
   * Bu değişiklik klavyeden mi geldi.
   *
   * Vurgulanan satırı görünür alana kaydırmak yalnızca ok tuşlarında doğru:
   * fareyle üzerine gelinen satır zaten görünüyor ve kenarda yarım kalmışsa
   * kaydırmak listeyi imlecin altından kaydırıp yeni bir `mouseenter`
   * üretiyordu — kendi kendini besleyen bir zıplama.
   */
  const keyNav = useRef(false);
  /** Bölümü kullanıcı az önce AÇTI: başlık en üste kaydırılsın. */
  const justOpened = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api
      .gitBranches(cwd)
      .then((l) => !cancelled && setList(l))
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const rows = useMemo(() => pickerRows(list ?? [], query, remotesOpen), [list, query, remotesOpen]);

  /*
   * Panel rozetin ÜSTÜNE oturuyor ve konumu panelin YÜKSEKLİĞİNDEN hesaplanıyor
   * (`anchorAbove`: üst = rozetin üstü − yükseklik). Yükseklik yalnızca liste
   * yüklenince değil, satır sayısı değişince de değişiyor: "Uzak dallar" açılınca
   * panel 120px'ten 340px'e büyüyor. Konum yeniden hesaplanmazsa üst kenar yerinde
   * kalıp ALT kenar aşağı iniyordu: panel rozetin üstüne biniyor ve satırlar
   * ekranın dışına taşıyordu (gözle görüldü; jsdom'da yerleşim olmadığı için hiçbir
   * test yakalayamazdı). Arama da aynı sebeple: süzülen liste kısalınca panel
   * rozetten uzakta asılı kalıyordu.
   */
  useEffect(() => anchorAbove(boxRef.current, ".ctx-chip.branch"), [list, rows.length]);
  /** Ok tuşlarının uğradığı satırlar: dallar ve açma düğmesi; düz etiket değil. */
  const nav = useMemo(() => rows.filter(isNavigable), [rows]);
  /** Satır sayısı değişebilir (bölüm kapandı); vurgu sınırın dışında kalmasın. */
  const active = Math.min(index, Math.max(0, nav.length - 1));

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!keyNav.current) return;
    keyNav.current = false;
    // jsdom'da yok; gerçek webview'de var.
    listRef.current
      ?.querySelector<HTMLElement>(".pop-row.on, .pop-group.on")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    if (!remotesOpen || !justOpened.current) return;
    justOpened.current = false;
    // Açılan satırlar başlığın ALTINDA; başlık listenin dibindeyse hiçbiri
    // görünmezdi. Başlığı en üste almak hepsini gösteriyor.
    listRef.current
      ?.querySelector<HTMLElement>(".pop-group")
      ?.scrollIntoView?.({ block: "start" });
  }, [remotesOpen]);

  const toggleRemotes = () => {
    justOpened.current = !remotesOpen;
    useStore.getState().setUi({ branchRemotesOpen: !remotesOpen });
  };

  const gecis = (branch: GitBranch) => {
    // Zaten o daldaysak komut göndermenin anlamı yok; kabuk "already on"
    // yazıp geçiyor ve geçmişe boş bir kayıt giriyor.
    if (branch.remote || branch.name !== current) {
      useStore.getState().insertCommand(checkoutCommand(branch), true);
    }
    onClose();
  };

  // Render sırasında ilerleyen sayaç: `nav` içindeki yeri.
  let pos = -1;

  return (
    <div className="overlay popover-overlay" onMouseDown={onClose}>
      <div
        ref={boxRef}
        className="pop-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (nav.length === 0) return;
            const yon = e.key === "ArrowDown" ? 1 : -1;
            keyNav.current = true;
            setIndex((((active + yon) % nav.length) + nav.length) % nav.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const row = nav[active];
            // Başlıkta Enter dal değil BÖLÜMÜ açıp kapatıyor; vurgu başlıkta
            // kalıyor, alt ok açılan satırlara iniyor.
            if (row?.kind === "branch") gecis(row.branch);
            else if (row?.kind === "remote-toggle") toggleRemotes();
          }
        }}
      >
        <input
          ref={inputRef}
          className="pop-search"
          value={query}
          placeholder={t("git.searchBranch")}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />

        <div className="pop-list" ref={listRef}>
          {list === null && <div className="pop-empty">{t("common.loading")}</div>}
          {list !== null && rows.length === 0 && (
            <div className="pop-empty">{t("git.noBranch")}</div>
          )}
          {rows.map((row) => {
            if (row.kind === "remote-label") {
              // Aramada ve yerel dal yokken: katlanacak bir şey olmadığı için
              // basılamayan düz bir başlık.
              return (
                <div key="remote-label" className="pop-group static">
                  <span className="pop-group-name">{t("git.remoteBranches")}</span>
                  <span className="pill-count">{row.count}</span>
                </div>
              );
            }

            pos += 1;
            const at = pos;
            const on = at === active;

            if (row.kind === "remote-toggle") {
              return (
                <button
                  key="remote-toggle"
                  type="button"
                  className={on ? "pop-group on" : "pop-group"}
                  aria-expanded={row.open}
                  title={t("git.remoteGroupHint")}
                  onMouseEnter={() => setIndex(at)}
                  onClick={toggleRemotes}
                >
                  <span className="pop-caret" aria-hidden="true">
                    <ChevronIcon open={row.open} size={11} />
                  </span>
                  <span className="pop-group-name">{t("git.remoteBranches")}</span>
                  <span className="pill-count">{row.count}</span>
                </button>
              );
            }

            const b = row.branch;
            return (
              <button
                key={b.remote ? `${b.remote}/${b.name}` : b.name}
                type="button"
                // Uzak satırlar başlığın altında girintili: hangi bölüme ait
                // oldukları soldan okunuyor.
                className={["pop-row", on && "on", b.remote && "nested"].filter(Boolean).join(" ")}
                title={b.remote ? t("git.remoteHint") : undefined}
                onMouseEnter={() => setIndex(at)}
                onClick={() => gecis(b)}
              >
                <span className="pop-mark" aria-hidden="true">
                  <BranchIcon size={12} />
                </span>
                {b.name}
                {/* Bulunduğun dal işaretli: listede onu ararken "hangisindeyim"
                    sorusunu rozete geri dönüp sormak gerekmesin. */}
                {!b.remote && b.name === current && (
                  <span className="pop-tag">{t("git.currentBranch")}</span>
                )}
                {/* Uzak dal: etiket uzağın adı. Bu satırı seçmek yerel dal
                    oluşturuyor; farkı görünür kılmak gerekiyor. */}
                {b.remote && <span className="pop-tag remote">{b.remote}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
