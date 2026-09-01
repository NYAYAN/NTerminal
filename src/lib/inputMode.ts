/**
 * Tuş vuruşları nereye gidiyor: uygulamanın girdi kutusuna mı, doğrudan
 * kabuğa mı?
 *
 * ## Neden iki kip var
 *
 * İstenen davranış Warp'ınki: komut satırı terminalin ızgarasının dışında,
 * pencerenin dibinde sabit duran bir kutu. Yazdıklarınız kabuğa ancak Enter'a
 * bastığınızda gidiyor. Böylece kaydırma satırı oynatmıyor, satır ekranın bir
 * parçası olmadığı için de kaybolmuyor.
 *
 * Ama bir terminalde girdiyi HER ZAMAN uygulamanın toplaması mümkün değil:
 * `vim`, `ssh` parola istemi, `python` REPL, `git rebase -i` — bunlar tuşları
 * BİR BİR, o an istiyor. Enter'a kadar bekleyen bir kutu bu programları
 * kullanılamaz hâle getirir.
 *
 * Bu yüzden kip, kabuğun ne yaptığına bakarak seçiliyor. Karar burada, saf bir
 * işlevde: gerçek terminalde denemesi zor (doğru anda doğru program çalışıyor
 * olmalı), ama girdiği dört sinyal net.
 *
 * ## Sinyaller
 *
 * `atPrompt` kabuk entegrasyonundan geliyor (OSC 133): `B` "komut girişi
 * başlıyor", `C` "komut çalışmaya başladı". Yani kabuk sizi beklerken true,
 * bir komut çalışırken false.
 *
 * `altScreen` xterm'den: tam ekran programlar (vim, less, htop) ikincil ekran
 * tamponuna geçiyor. Entegrasyon sinyali gecikse bile bu yakalıyor.
 */
export type InputMode = "app" | "raw";

export interface InputSignals {
  /** Ayar açık mı (kullanıcı klasik terminale dönebilmeli). */
  enabled: boolean;
  /** Kabuk entegrasyonu bu sekmede çalışıyor mu. */
  integration: boolean;
  /** Kabuk istemde bekliyor mu (OSC 133;B geldi, 133;C gelmedi). */
  atPrompt: boolean;
  /** İkincil ekran tamponu etkin mi (vim, less, htop). */
  altScreen: boolean;
  /**
   * Kabuk süreci bitti mi.
   *
   * BİLDİRİLEN HATA: "'Bu sekmedeki kabuk kapandı' diyor ama altta komut
   * yazın kısmı aktif."
   *
   * Sebep şuydu: `atPrompt` kabuğun BİLDİRDİĞİ bir durum ve kabuk ölürken
   * "artık istemde değilim" diye bir şey bildirmiyor — son bildirdiği değer
   * neyse o kalıyor. Kutu da o değere bakıp açık duruyordu. Yazılan her şey
   * olmayan bir sürece gidiyor, yani kutu çalışıyormuş gibi görünüp hiçbir
   * şey yapmıyordu.
   *
   * Ölüm sinyali bu yüzden ayrı ve KABUĞUN BİLDİRİMİNDEN bağımsız: süreç
   * bittiğinde uygulama bunu doğrudan biliyor (PTY exit olayı).
   */
  exited: boolean;
}

/**
 * Kipi seçer.
 *
 * Sıralama önemli ve hepsi "hayır"a çalışıyor: kuşkulu her durumda HAM kip
 * kazanıyor. Sebep asimetrik: yanlışlıkla ham kipte kalmak yalnızca eski
 * davranışı verir (satır terminalde çizilir), yanlışlıkla uygulama kipinde
 * kalmak ise çalışan programa tuş ulaşmamasına yol açar — kullanıcı `vim`
 * içinde kilitlenir.
 */
export function resolveInputMode(signals: InputSignals): InputMode {
  if (!signals.enabled) return "raw";
  // Kabuk öldüyse yazılacak bir yer yok. En başta: aşağıdaki koşulların hepsi
  // kabuğun BİLDİRDİĞİ duruma bakıyor ve ölü bir kabuk artık bildirmiyor.
  if (signals.exited) return "raw";
  // Entegrasyon yoksa `atPrompt` hiç gelmiyor; kutu sonsuza kadar kapalı
  // kalırdı. cmd, entegrasyonu kapatılmış profil ve eski kabuklar buraya
  // düşüyor.
  if (!signals.integration) return "raw";
  if (signals.altScreen) return "raw";
  if (!signals.atPrompt) return "raw";
  return "app";
}

/** Uygulama kipinde bile doğrudan kabuğa geçmesi gereken tuşlar. */
export interface PassThroughKey {
  key: string;
  ctrl: boolean;
}

/**
 * Uygulama kipinde yakalanan tuşun kabuğa gönderilecek karşılığı.
 *
 * `null` dönerse tuş kutuda kalıyor (normal yazma).
 *
 * Ctrl+C'nin burada olması şart: kutu boşken bile kabuğa SIGINT gitmeli, yoksa
 * çalışan bir şeyi durdurmanın yolu kalmaz. Ctrl+D (dosya sonu) ve Ctrl+L
 * (ekranı temizle) aynı sebeple: ikisi de kabuğun işi, kutunun değil.
 */
export function passThroughSequence(event: PassThroughKey): string | null {
  if (!event.ctrl) return null;
  switch (event.key.toLowerCase()) {
    case "c":
      return "\x03";
    case "d":
      return "\x04";
    case "l":
      return "\x0c";
    default:
      return null;
  }
}
