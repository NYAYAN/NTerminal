/**
 * Arayüzün kendi sağlığını ölçen sonda.
 *
 * ## Neden var
 *
 * BİLDİRİLEN HATA: uygulama arada "yanıt vermiyor" hâline giriyor — sekme
 * geçişi işlemiyor, pencereyi başlıktan sürüklemek takılıyor. Bir kez
 * yalnızca uygulama kapatılıp açılınca geçti, bir kez 30-40 saniye sonra
 * kendiliğinden düzeldi.
 *
 * Sebep ARANDI ve bulunamadı. Ölçümle ELENENLER (canlı uygulamada, gerçek iş
 * yüküyle):
 *
 *  - Ham çıktı hacmi: 130 MB kesintisiz akış arayüzü 60 fps'de tuttu
 *    (ConPTY bayt borusu değil ekran borusu; kaydırıp geçen çıktıyı
 *    özetliyor, verim ~1,2 MB/s'de kalıyor).
 *  - CPU açlığı: 16 çekirdek %97 doygunken sekme geçişi 62 ms'de tamamlandı.
 *  - Bildirilen komutun kendisi: `ng build --configuration dev` koşarken ana
 *    iş parçacığı p99 = 18 ms, birleştirici kaybı p99 = 1 ms.
 *
 * Yani belirti tek bir iş yükünden doğmuyor ve tahminle aranmaya devam
 * etmenin faydası yok. Bu modül TAHMİNİ ÖLÇÜMLE DEĞİŞTİRİYOR: donma geçtikten
 * sonra da elde sayı kalsın diye takılmaları bir halka tamponda tutuyor.
 * Donmuş bir uygulamada kullanıcı Ayarlar'ı açamaz; kayıt sonradan okunmalı.
 *
 * ## İki ayrı sondaj ve neden ikisi birden
 *
 * Donmanın JAVASCRIPT tarafında mı yoksa ÇİZİM döngüsünde mi olduğunu
 * ayırmak teşhisi ikiye indiriyor. İki sondanın farklı yollardan geçmesi
 * bunu ölçülebilir yapıyor:
 *
 *  - **Görev kuyruğu** (`setTimeout` sapması): ana iş parçacığı meşgul
 *    olmadıkça zamanında ateşliyor. Çizimden BAĞIMSIZ.
 *  - **Çizim döngüsü** (`requestAnimationFrame` boşluğu): çizim hattına bağlı.
 *    Birleştirici ya da GPU tıkanırsa, ana iş parçacığı boş olsa bile kare
 *    gelmiyor.
 *
 * Okuma tablosu:
 *
 * | Görev kuyruğu | Çizim | Anlamı |
 * |---|---|---|
 * | takılıyor | takılıyor | Ana iş parçacığı bloke: JavaScript, React, xterm |
 * | temiz | takılıyor | Çizim hattı tıkanmış: WebView2 / GPU / birleştirici |
 * | temiz | temiz | Donma arayüzde değil (pencere yönetimi, sürücü, işletim sistemi) |
 *
 * ## Bir yanlış sondaj denendi ve ATILDI
 *
 * İlk hâli birleştiriciyi compositor'da koşan bir CSS animasyonunun
 * `currentTime`ından okuyordu. ÖLÇÜM YANLIŞLADI: ana iş parçacığını bilerek
 * 900 ms bloke ettiğimizde animasyon da 889 ms "geride" görünüyordu — çünkü
 * `Animation.currentTime` belge zaman çizelgesine bağlı ve o da kare başına
 * bir kez ilerliyor. Yani iki sayı aynı şeyi ölçüyordu ve panel, sebebi
 * tümüyle JavaScript olan bir donmada "çizim tıkandı" diyordu. Yanıltıcı bir
 * sayı, hiç sayı olmamasından kötü.
 */

/** Bir takılmanın "takılma" sayılması için gereken en küçük boşluk (ms). */
export const JANK_MS = 250;
/** Halka tamponda tutulan takılma sayısı. */
export const JANK_LIMIT = 20;
/**
 * Yüzdelik hesabı için tutulan kare sayısı.
 *
 * 60 fps'de yaklaşık bir dakika. Daha uzun bir pencere donmayı ortalamanın
 * içinde eritir; daha kısası kullanıcı Ayarlar'ı açana kadar boşalır.
 */
export const FRAME_WINDOW = 3600;
/**
 * Görev kuyruğu sondasının aralığı (ms).
 *
 * Kare süresine yakın (16 ms) ki iki sonda aynı zaman ölçeğinde okunsun:
 * "çizim 900 ms boşluk verdi, kuyruk 4 ms saptı" karşılaştırılabilir bir
 * cümle, farklı aralıklarda değil.
 */
export const TASK_INTERVAL = 16;
/**
 * Takılmanın kuyruk değeri kaç ms sonra doldurulur.
 *
 * Geç kalan `setTimeout` geri çağrısının koşmasına yetecek kadar uzun,
 * kullanıcının paneli açmasından (en az bir saniye) kısa. Gerekçesi
 * `maxDriftIn` üzerinde.
 */
export const JANK_SETTLE_MS = 150;
/**
 * Görev kuyruğu örneklerinin tutulduğu süre (ms).
 *
 * Yalnızca takılmanın aralığını geriye doğru okumak için gerekiyor, yüzdelik
 * hesabı ayrı bir tamponda; beş saniye en uzun takılmayı bile kapsıyor.
 */
export const TASK_SAMPLE_WINDOW = 5000;

export interface JankEvent {
  /** Duvar saati (ms, epoch) — kullanıcı "saat kaçta" diye sorabilsin. */
  at: number;
  /** Çizim döngüsündeki boşluk (rAF). */
  gapMs: number;
  /**
   * Aynı anda görev kuyruğunun sapması.
   *
   * İkisi birlikte okunuyor: yalnızca çizim takıldıysa sebep GPU tarafında,
   * ikisi birden takıldıysa ana iş parçacığı bloke.
   */
  taskMs: number;
}

export interface FrameStats {
  ortanca: number;
  p95: number;
  enBuyuk: number;
  olcum: number;
}

/**
 * Yüzdelikler. Boş listede `null` — "ölçüm yok" ile "sıfır" ayrı şeyler ve
 * ikisini karıştırmak sağlıklı görünen bir panel üretirdi.
 */
export function frameStats(gaps: readonly number[]): FrameStats | null {
  if (gaps.length === 0) return null;
  const sorted = [...gaps].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    ortanca: Math.round(at(0.5)),
    p95: Math.round(at(0.95)),
    enBuyuk: Math.round(sorted[sorted.length - 1]),
    olcum: sorted.length,
  };
}

/** Halka tampona ekler; sınırı aşarsa en eskiyi düşürür. */
export function pushJank(list: JankEvent[], event: JankEvent, limit = JANK_LIMIT): JankEvent[] {
  const next = [...list, event];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Zaman damgalı görev kuyruğu örneği. */
export interface TaskSample {
  /** `performance.now()` — geri çağrının GERÇEKTEN koştuğu an. */
  at: number;
  drift: number;
}

/**
 * Bir zaman aralığındaki en büyük kuyruk sapması.
 *
 * ## Neden aralık, neden "o anki değer" değil
 *
 * İlk hâli takılmayı kaydederken o an bilinen son sapmayı yazıyordu ve
 * ÖLÇÜM YANLIŞLADI: ana iş parçacığı 900 ms bloke edildiğinde panel "çizim
 * 915 ms · kuyruk 0 ms" diyordu — yani sebebi tam olarak JavaScript olan bir
 * donmayı "çizim tıkandı" diye gösteriyordu.
 *
 * Sebep sıralama: bloklanma bitince hem gecikmiş `requestAnimationFrame` hem
 * gecikmiş `setTimeout` kuyruğa giriyor ve hangisinin önce koşacağı garanti
 * değil. rAF önce koşarsa büyük sapma örneği HENÜZ YOK.
 *
 * Çözüm zamanı geriye doğru okumak: takılmanın kapsadığı aralıkta görülen en
 * büyük sapma. Değer takılmadan biraz SONRA doldurulıyor (bkz.
 * `JANK_SETTLE_MS`), böylece geç kalan örnek de aralığa girmiş oluyor.
 */
export function maxDriftIn(samples: readonly TaskSample[], from: number, to: number): number {
  let max = 0;
  for (const s of samples) {
    if (s.at >= from && s.at <= to && s.drift > max) max = s.drift;
  }
  return max;
}

export interface HealthSnapshot {
  /** Uygulamanın açık kalma süresi (ms). */
  uptimeMs: number;
  /** `setTimeout` sapması: ana iş parçacığının görev kuyruğu sağlığı. */
  gorevKuyrugu: FrameStats | null;
  /** `requestAnimationFrame` boşluğu: çizim hattı sağlığı. */
  cizim: FrameStats | null;
  /** En son takılmalar, eskiden yeniye. */
  takilmalar: JankEvent[];
  /** Ölçüm hiç koştu mu? Kapalıysa panel "ölçüm yok" demeli. */
  calisiyor: boolean;
}

/**
 * Kare ölçümü. Uygulama ömrü boyunca tek örnek (`frameMonitor`).
 *
 * Ölçümün kendisi ucuz olmak ZORUNDA: kareyi ölçen şey kareyi geciktirirse
 * ölçtüğü sayı kendi maliyetini içerir. Kare başına yapılan iş iki çıkarma,
 * iki dizi yazımı ve bir karşılaştırma.
 */
export class FrameMonitor {
  private drawGaps: number[] = [];
  private taskGaps: number[] = [];
  private janks: JankEvent[] = [];
  private started = 0;
  private running = false;
  private lastFrame = 0;
  private lastTask = 0;
  /** Zaman damgalı sapma örnekleri: takılmanın aralığını geriye okumak için. */
  private taskSamples: TaskSample[] = [];
  private frame: number | null = null;
  private timer: number | null = null;
  /** Kuyruk değeri henüz doldurulmamış takılmalar. */
  private settleTimers: number[] = [];

  /**
   * Başlatır ya da duraklatılmış sondayı sürdürür.
   *
   * `started` yalnızca İLK başlangıçta yazılıyor: `stop` + `start` çifti
   * (pencere arka plana geçti, geri geldi) açık kalma süresini ve halka
   * tamponları sıfırlamıyor — panel "uygulama ne zamandır açık" sorusuna
   * cevap vermeye devam ediyor, takılma kayıtları da duruyor.
   */
  start() {
    if (this.running) return;
    this.running = true;
    if (!this.started) this.started = Date.now();
    const now = performance.now();
    this.lastFrame = now;
    this.lastTask = now;
    this.tick();
    this.taskTick();
  }

  stop() {
    this.running = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    // Bekleyen doldurma zamanlayıcıları: sönmüş bir sondada koşmalarının
    // zararı yok ama geride bırakmak da sızıntı.
    for (const id of this.settleTimers) window.clearTimeout(id);
    this.settleTimers = [];
  }

  /** Çizim döngüsü: kare geldi mi? */
  private tick = () => {
    const now = performance.now();
    const gap = now - this.lastFrame;
    this.lastFrame = now;

    this.drawGaps.push(gap);
    if (this.drawGaps.length > FRAME_WINDOW) this.drawGaps.shift();

    if (gap >= JANK_MS) {
      /*
       * Olay HEMEN kaydediliyor (kullanıcı zamanı görmeli), kuyruk değeri
       * biraz sonra dolduruluyor: geç kalan `setTimeout` geri çağrısı rAF'tan
       * sonra da koşabiliyor. Gerekçesi `maxDriftIn` üzerinde.
       *
       * Nesne yerinde değiştiriliyor; `pushJank` diziyi kopyalıyor ama
       * ÖĞELERİ aynı bırakıyor, yani halkadaki kayıt da güncelleniyor.
       */
      const event: JankEvent = { at: Date.now(), gapMs: Math.round(gap), taskMs: 0 };
      this.janks = pushJank(this.janks, event);

      const from = now - gap - TASK_INTERVAL;
      const timer = window.setTimeout(() => {
        this.settleTimers = this.settleTimers.filter((id) => id !== timer);
        event.taskMs = Math.round(
          maxDriftIn(this.taskSamples, from, performance.now()),
        );
      }, JANK_SETTLE_MS);
      this.settleTimers.push(timer);
    }

    if (this.running) this.frame = requestAnimationFrame(this.tick);
  };

  /**
   * Görev kuyruğu: zamanlayıcı zamanında ateşledi mi?
   *
   * `setTimeout` çizim hattından geçmiyor; gecikmesi doğrudan "ana iş
   * parçacığı meşgul" demek. Aralık `TASK_INTERVAL` ve sapma o aralığın
   * ÜZERİNE binen kısım — motorun kendi alt sınırı (çoğu tarayıcıda 4 ms)
   * ölçümü kirletmesin diye çıkarılıyor.
   */
  private taskTick = () => {
    if (!this.running) return;
    this.timer = window.setTimeout(() => {
      const now = performance.now();
      const drift = Math.max(0, now - this.lastTask - TASK_INTERVAL);
      this.lastTask = now;

      this.taskGaps.push(drift);
      if (this.taskGaps.length > FRAME_WINDOW) this.taskGaps.shift();

      this.taskSamples.push({ at: now, drift });
      const kesim = now - TASK_SAMPLE_WINDOW;
      while (this.taskSamples.length > 0 && this.taskSamples[0].at < kesim) {
        this.taskSamples.shift();
      }

      this.taskTick();
    }, TASK_INTERVAL);
  };

  snapshot(): HealthSnapshot {
    return {
      uptimeMs: this.started ? Date.now() - this.started : 0,
      gorevKuyrugu: frameStats(this.taskGaps),
      cizim: frameStats(this.drawGaps),
      takilmalar: [...this.janks],
      calisiyor: this.running,
    };
  }
}

export const frameMonitor = new FrameMonitor();
