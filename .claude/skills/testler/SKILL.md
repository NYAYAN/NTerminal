---
name: testler
description: N-Terminal'in tam doğrulama zincirini koşar — TypeScript tip denetimi, vitest arayüz testleri ve cargo Rust testleri. Kullanıcı "test", "testleri çalıştır", "npm test", "kontrol et", "hepsi geçiyor mu", "doğrula" dediğinde ya da bir değişikliği bitirmeden önce doğrulaman gerektiğinde bu skill'i kullan. Rust testlerinin neden doğrudan `cargo test` ile koşulamayacağını ve hangi testin gerçekten kırık, hangisinin zamanlamaya bağlı olduğunu da anlatıyor.
---

# Doğrulama

Bu depoda testler bir formalite değil: CSS kuralları, sabit kodlanmış metinler,
ızgara hizaları ve ayar arama indeksi bile testle bağlı. Bir değişikliğin
"bitti" sayılması üç aşamanın da geçmesine bağlı.

## Hepsi birden

```bash
npm test
```

`scripts/test.ps1` sırayla `tsc --noEmit`, `vitest run` ve `cargo test`
koşuyor; hangisinin düştüğünü sonunda özetliyor.

## Tek tek (geliştirirken daha hızlı)

```bash
npx tsc --noEmit
```

```bash
npx vitest run
```

Rust tarafı **doğrudan çağrılamıyor** — önce `win-env.ps1` ortamı kurmalı,
yoksa bu makinedeki iki Visual Studio kurulumundan çalışmayanı seçip
`LNK1104: cannot open file 'msvcrt.lib'` veriyor. Ayrıca PowerShell aracının
çalışma dizini çağrılar arasında kaldığı için **mutlak yol** ver:

```powershell
Set-Location "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal"
. .\scripts\win-env.ps1
Set-Location "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal\src-tauri"
cargo test -- --test-threads=1
```

`cargo`ya `2>&1` **ekleme**: PowerShell 5.1 yerel exe'nin stderr satırlarını
`NativeCommandError`a çevirip çıkış kodu 0 olsa bile hata gibi gösteriyor.

## Gürültü ve gerçek hata ayrımı

- `Not implemented: HTMLCanvasElement's getContext()` — jsdom xterm'in canvas
  çağrısını karşılamıyor. **Beklenen**, testler yine geçiyor. Çıktıyı okurken
  `grep -v "Not implemented"` ile ele.
- `cmd_entegrasyonu_istem_ve_dizin_bildirir` — gerçek ConPTY + gerçek
  `cmd.exe` başlatan uçtan uca test. Tüm paket `--test-threads=1` ile
  koşarken zaman aşımına düşebiliyor. Düştüğünde **tek başına yeniden koş**;
  geçiyorsa zamanlamadır, kodun değil:

  ```powershell
  cargo test --test shell_integration cmd_entegrasyonu -- --test-threads=1
  ```

  Yeniden koşumda da düşüyorsa gerçek bir hata var, atlama.

## Sık düşen testler ve ne demek istedikleri

Bunlar kırık değil, **elle tutulan bir listeyi güncellemedin** demek:

| Test | Ne yapmalısın |
|---|---|
| `settingsIndex.test.ts` › "işaretli bölümlerde indeks kaynakla birebir" | Yeni ayar satırına `data-setting="<anahtar>"` koy **ve** `settingsIndex.ts` içindeki `SETTINGS_INDEX`e ekle. Bir bölümde bir satırı işaretlediysen o bölümün indeksteki TÜM satırları işaretli olmalı. |
| `messages.test.ts` › "kullanılmayan anahtar yok" | Sözlükten bir metnin kullanımını kaldırdıysan anahtarı da sil. |
| `messages.test.ts` › "metinler büyük harfle başlıyor" / "eylem etiketleri cümle stilinde" | Metni cümle stiline çevir. Ürün adıysa `messages.test.ts` içindeki `PROPER` listesine ekle. |
| `hardcodedText.test.ts` | JSX'e doğrudan metin yazmışsın; `messages.ts`e taşı ve `t()` ile çağır. Ayrıntı için `arayuz-metni` skill'ine bak. |
| `layout.test.ts` | CSS'te ölçülmüş bir karardan geri dönmüşsün. Testin başındaki açıklama hangi hatanın bir kez ödendiğini yazıyor — önce onu oku. |
| `SettingsDialog.test.tsx` › "bölüm değiştirmek içeriği değiştiriyor" | Ayarlar penceresine `<h3>` başlığı eklemişsin; testteki beklenen başlık listesini güncelle. |
| `ipcContract.test.ts` | Yeni bir Rust komutu eklemişsin ya da argümanını değiştirmişsin: komutu `lib.rs` içindeki `generate_handler!` listesine yaz; `ipc.ts`deki argüman anahtarları Rust parametrelerinin camelCase karşılığı olmalı (`file_path` ↔ `filePath`). Arayüz testleri IPC'yi taklit ettiği için komut adındaki yazım hatasını yalnızca bu test görüyor. |

## Yeni test yazarken

Bu depoda testler **neden** var olduklarını anlatıyor: çoğunun başında
ölçülmüş bir hata ve sayısı duruyor ("627px yükseklik / 12px hücre = 52 satır
→ 5px bindirme"). Yeni test eklerken aynı biçimi sürdür — testin adı ne
kontrol ettiğini, yorumu neden kontrol ettiğini söylesin. Yalnızca "çalışıyor
mu" diye bakan bir test, altı ay sonra silinmesi gereken mi yoksa korunması
gereken mi olduğunu söyleyemiyor.

Bileşen testleri jsdom istiyor; dosyanın ilk satırına:

```ts
// @vitest-environment jsdom
```

Depoyu örnek al: `src/components/dnd.test.tsx` gerçek DOM olaylarıyla
sürükle-bırak koşuyor, `src/components/shellBadge.test.tsx` depoyu kurup
bileşeni çiziyor.
