/**
 * Kabuğun İLK istemini görmüş sekmeler.
 *
 * Komut kutusu "Kabuk başlatılıyor…" şeridini yalnızca o ana kadar çiziyor.
 * Sonraki komutlar arasında da istem sinyali kısa süre düşüyor (OSC 133 A → B
 * arası, istem çizilirken) ama orada "başlatılıyor" yazmak yanlış olurdu.
 * Kabuk kapanınca kayıt siliniyor — yeniden başlatılan kabuk yine başlıyor.
 *
 * ## Neden ayrı dosya
 *
 * İlk hâli `CommandInput.tsx` içinde `export const` idi. Vite'ın Fast Refresh'i
 * bileşen dosyasından bileşen olmayan bir dışa aktarım görünce dosyayı
 * yenileyemiyor ("export is incompatible"), modülü baştan kuruyor ve küme
 * boşalıyor: canlıda komut bitince şerit yeniden beliriyordu. Geliştirme
 * kipine özgü bir belirti ama bileşen dosyasını temiz tutmanın bedeli sıfır.
 *
 * Modül düzeyinde: bileşen sekme değişiminde yeniden kurulsa da bilgi kalmalı.
 * Testler her testte `clear()` çağırıyor — her test yeni bir kabuk.
 */
export const promptedTabs = new Set<string>();
