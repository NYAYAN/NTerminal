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
 *
 * ## Maliyet
 *
 * Sonda ilk hâlinde uygulama ömrü boyunca sürekli çalışıyordu (16 ms
 * zamanlayıcı + her karede rAF) ve BOŞTA bile çekirdeğin ~%13'ünü yiyordu.
 * Şimdi yalnızca kullanıcı etkinliğinden sonra beş saniye sık örnekliyor,
 * boştayken 250 ms'de bir yokluyor, pencere gizliyken duruyor (bkz.
 * `FrameMonitor`, `ACTIVE_WINDOW_MS`). Ölçümün amacı olan takılma yakalama
 * bozulmuyor: donma etkileşim sırasında fark ediliyor.
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
/**
 * Kullanıcı etkinliğinden sonra sondanın SIK örneklemede kalacağı süre (ms).
 *
 * ÖLÇÜLEN MALİYET: sürekli 16 ms zamanlayıcı + her karede rAF, uygulama
 * BOŞTAYKEN bile Rust ana süreci %6 + WebContent %5,6 + GPU %1,2 CPU yiyordu
 * (izleyici durdurulunca 12,9 -> 6,0). rAF'in sürekli istenmesi macOS'ta
 * arayüz sürecini de saniyede 60 kez uyandırıyor (CVDisplayLink); pil
 * tüketiminin görünür kısmı bu.
 *
 * Donma ARAYÜZLE ETKİLEŞİM sırasında fark ediliyor (yazarken, sekme
 * değiştirirken, pencereyi sürüklerken); kimse hareketsiz bir pencerenin
 * takıldığını görmüyor. O yüzden sık örnekleme yalnızca etkinlikten sonra bu
 * kadar sürüyor; sonrası seyrek yoklamaya (`IDLE_INTERVAL`) iniyor. Uzun
 * (>= JANK_MS) bir takılma seyrek yoklamada da yakalanıyor.
 */
export const ACTIVE_WINDOW_MS = 5000;
/**
 * Boştayken yoklama aralığı (ms).
 *
 * `JANK_MS`'ye (250) yakın: bir takılmanın yoklamayı kaçırmaması için aralık
 * eşikten büyük olamaz. Zamanlayıcı ve çizim istemi AYNI yoklamada: saniyede
 * dört zamanlayıcı ve dört rAF, eskiden 62 + 60.
 */
export const IDLE_INTERVAL = 250;

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

/** Sondanın çalışma kipi. */
export type MonitorMode = "fast" | "slow" | "paused";

/**
 * Kip kararı — SAF, testli.
 *
 * `paused`: pencere gizli (küçültülmüş/örtülü): ölçülecek bir kullanıcı yok,
 * zamanlayıcılar zaten saniyede bire iniyor.
 * `fast`: son etkinlikten `ACTIVE_WINDOW_MS` geçmedi.
 * `slow`: geri kalan her durum.
 */
export function decideMode(hidden: boolean, sinceActivityMs: number): MonitorMode {
  if (hidden) return "paused";
  return sinceActivityMs <= ACTIVE_WINDOW_MS ? "fast" : "slow";
}

/** Sondanın "kullanıcı etkinliği" saydığı pencere olayları. */
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "focus"] as const;

/**
 * Kare ölçümü. Uygulama ömrü boyunca tek örnek (`frameMonitor`).
 *
 * Ölçümün kendisi ucuz olmak ZORUNDA: kareyi ölçen şey kareyi geciktirirse
 * ölçtüğü sayı kendi maliyetini içerir. Kare başına yapılan iş iki çıkarma,
 * iki dizi yazımı ve bir karşılaştırma.
 *
 * ## Üç kip (bkz. `ACTIVE_WINDOW_MS`)
 *
 * - `fast`: 16 ms zamanlayıcı + kare başına bir rAF. Kullanıcı etkinliğinden
 *   sonra ilk beş saniye ve açılışta. Yüzdelik pencereleri YALNIZ bu kipte
 *   dolar: seyrek kipteki örnekler ("çizim isteği ne kadar sonra karşılandı")
 *   ile sık kipteki ("iki kare arası") aynı dağılım değil, karıştırmak ortancayı
 *   anlamsızlaştırırdı.
 * - `slow`: 250 ms'de bir TEK zamanlayıcı; her yoklamada bir rAF istenip
 *   isteğin ne kadar sonra karşılandığı ölçülüyor. Bir takılma (>= `JANK_MS`)
 *   burada da kaydediliyor.
 * - `paused`: pencere gizli, hiçbir şey çalışmıyor.
 *
 * Çizim "boşluğu" her iki kipte de aynı tanımda: rAF'in İSTENDİĞİ andan
 * KARŞILANDIĞI ana kadar geçen süre. Sık kipte istek bir önceki karede
 * yapıldığı için bu iki kare arası süreyle aynı sayı (eski tanım).
 */
export class FrameMonitor {
  private drawGaps: number[] = [];
  private taskGaps: number[] = [];
  private janks: JankEvent[] = [];
  private started = 0;
  private running = false;
  private mode: MonitorMode = "paused";
  private lastActivity = 0;
  private lastTask = 0;
  private drawPending = false;
  private drawRequestedAt = 0;
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
    this.lastActivity = performance.now();
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, this.poke, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    this.enter(decideMode(document.hidden, 0));
  }

  stop() {
    this.running = false;
    for (const type of ACTIVITY_EVENTS) {
      window.removeEventListener(type, this.poke, { capture: true });
    }
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.cancelProbes();
    this.mode = "paused";
    // Bekleyen doldurma zamanlayıcıları: sönmüş bir sondada koşmalarının
    // zararı yok ama geride bırakmak da sızıntı.
    for (const id of this.settleTimers) window.clearTimeout(id);
    this.settleTimers = [];
  }

  /**
   * Kullanıcı etkinliği: sık örneklemeye dön.
   *
   * Pencere olaylarından çok sık çağrılıyor (`pointermove`): iş bir karşılaştırma
   * ve bir atama. Kip zaten `fast` ise başka hiçbir şey yapmıyor.
   */
  poke = () => {
    this.lastActivity = performance.now();
    if (this.running && this.mode === "slow") this.enter("fast");
  };

  private onVisibility = () => {
    if (!this.running) return;
    if (document.hidden) {
      this.enter("paused");
    } else {
      // Görünür olunca ilk örnek "gizliyken geçen süre"yi takılma sanmasın:
      // `enter` bütün başlangıç noktalarını sıfırlıyor.
      this.lastActivity = performance.now();
      this.enter("fast");
    }
  };

  private cancelProbes() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.drawPending = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Kip değiştirir; başlangıç noktalarını sıfırlar ki geçiş takılma sayılmasın. */
  private enter(mode: MonitorMode) {
    this.cancelProbes();
    this.mode = mode;
    if (mode === "paused") return;
    this.lastTask = performance.now();
    this.requestDraw();
    this.taskTick();
  }

  /** Bir çizim isteği: karşılanma süresi ölçülecek. Zaten bekleyen varsa yenisi açılmıyor. */
  private requestDraw() {
    if (this.drawPending) return;
    this.drawPending = true;
    this.drawRequestedAt = performance.now();
    this.frame = requestAnimationFrame(this.onFrame);
  }

  /** Çizim döngüsü: istek karşılandı. */
  private onFrame = () => {
    this.frame = null;
    this.drawPending = false;
    const now = performance.now();
    const gap = now - this.drawRequestedAt;

    if (this.mode === "fast") {
      this.drawGaps.push(gap);
      if (this.drawGaps.length > FRAME_WINDOW) this.drawGaps.shift();
    }

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

    // Yalnızca sık kipte kare kare sürüyor; seyrek kipte bir sonraki yoklama
    // yeni istek açacak.
    if (this.running && this.mode === "fast") this.requestDraw();
  };

  /**
   * Görev kuyruğu: zamanlayıcı zamanında ateşledi mi?
   *
   * `setTimeout` çizim hattından geçmiyor; gecikmesi doğrudan "ana iş
   * parçacığı meşgul" demek. Aralık sık kipte `TASK_INTERVAL`, seyrek kipte
   * `IDLE_INTERVAL`; sapma o aralığın ÜZERİNE binen kısım — motorun kendi alt
   * sınırı (çoğu tarayıcıda 4 ms) ölçümü kirletmesin diye çıkarılıyor.
   */
  private taskTick = () => {
    if (!this.running || this.mode === "paused") return;
    const interval = this.mode === "fast" ? TASK_INTERVAL : IDLE_INTERVAL;
    this.timer = window.setTimeout(() => {
      const now = performance.now();
      const drift = Math.max(0, now - this.lastTask - interval);
      this.lastTask = now;

      // Yüzdelik penceresi yalnız sık kipte dolar (bkz. sınıf başlığı); zaman
      // damgalı örnekler ise takılma atfı için HER kipte tutuluyor.
      if (this.mode === "fast") {
        this.taskGaps.push(drift);
        if (this.taskGaps.length > FRAME_WINDOW) this.taskGaps.shift();
      }

      this.taskSamples.push({ at: now, drift });
      const kesim = now - TASK_SAMPLE_WINDOW;
      while (this.taskSamples.length > 0 && this.taskSamples[0].at < kesim) {
        this.taskSamples.shift();
      }

      // Etkinlik bitti mi? Sık kipten seyreğe iniş yalnızca burada.
      const next = decideMode(document.hidden, now - this.lastActivity);
      if (next !== this.mode) {
        this.enter(next);
        return;
      }
      // Seyrek kipte her yoklama bir çizim isteği de açıyor.
      if (this.mode === "slow") this.requestDraw();
      this.taskTick();
    }, interval);
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
