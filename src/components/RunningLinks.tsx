import { api } from "../lib/ipc";
import { useT } from "../lib/i18n";
import { shortUrl } from "../lib/serverLinks";
import { sessions, useStore } from "../store/useStore";

/**
 * Çalışan komutun sunucu adresleri — sabit bir yerde.
 *
 * ## Neden gerekiyor
 *
 * Bir sunucu başlattığınızda adres bir kez, en başta yazılıyor
 * (`Now listening on: http://localhost:5000`). Sonra loglar akmaya başlıyor ve
 * o satır yukarı süzülüyor: adrese bakmak için kaydırmak gerekiyor, uzun süren
 * bir işte de kaydırma geçmişinden büsbütün düşüyor ve adres KAYBOLUYOR.
 *
 * Şerit adresi çıktıdan ayırıp komut satırının hemen üstünde tutuyor. Komut
 * çalıştığı sürece orada; bittiğinde kayboluyor, çünkü ölü bir porta tıklamak
 * yalnızca hayal kırıklığı.
 *
 * Rozetler tıklanabilir: adres zaten elde, tarayıcıda açmak için kopyalayıp
 * yapıştırmaya gerek yok.
 */
export function RunningLinks() {
  const t = useT();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const running = useStore((s) => s.running);
  /*
   * Bu abonelik YENİDEN ÇİZİM tetikleyicisi; değeri kullanılmıyor.
   *
   * Gösterilen adresler oturumdan okunuyor (aşağıda). Ama React'i uyandıran
   * şey depodaki bir değerin değişmesi, o yüzden abonelik gerekiyor.
   */
  useStore((s) => s.runLinks);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const tabId = tab?.id;

  /*
   * Adresler OTURUMDAN okunuyor; depodaki kopya yalnızca yeniden çizimi
   * tetikliyor.
   *
   * ÖLÇÜLEN BELİRTİ: `ng serve` durdurulup yeniden çalıştırıldığında eski
   * portun rozeti duruyor, tıklayınca yanlış yere gidiyordu. Yalnızca depodaki
   * kopyaya bakılıyordu; o kopya bir olayla yazılıyor ve olayı kaçıran ya da
   * sıralaması bozulan tek bir yol onu kalıcı olarak eski bırakıyordu.
   */
  /*
   * Depodaki kopyaya DÜŞÜLMÜYOR: gösterilen değer her zaman oturumdan geliyor.
   * Oturum yoksa (sekme kuruluyor ya da kapanıyor) gösterilecek bir şey de
   * yok — kopyaya düşmek eski adresi ekranda tutuyordu.
   */
  const urls = (tabId ? sessions.get(tabId)?.runUrls() : undefined) ?? [];
  // Komut bittiyse gösterme: ölü bir porta tıklamak yalnızca hayal kırıklığı.
  if (!tabId || !running[tabId] || urls.length === 0) return null;

  return (
    <div className="run-links">
      <span className="run-links-label">{t("runLinks.label")}</span>
      {urls.map((url) => (
        <button
          key={url}
          type="button"
          className="run-link"
          title={url}
          onClick={() => void api.openExternal(url).catch(() => {})}
        >
          {shortUrl(url)}
        </button>
      ))}
    </div>
  );
}
