// `vitest/config` yerine `vite` kullanmak `test` anahtarini tip dizgesinden
// dusuruyor; vitest kendi tiplerini bu girdiyle genisletiyor.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5273,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5274 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  test: {
    // jsdom eksikleri icin yamalar; ortam dosya basina secildigi icin
    // (`// @vitest-environment jsdom`) kurulum her testte zararsiz calisiyor.
    setupFiles: ["./src/test-setup.ts"],
  },
  build: {
    // WebView2 (Chromium) hedefi: Windows 10/11'de güncel Edge çalışma zamanı
    // varsayılıyor, o yüzden geriye dönük dönüştürmeye gerek yok.
    target: "chrome120",
    // Vite 8 küçültme işini oxc ile yapıyor; ayrı bir esbuild paketi yok.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Paket diskten yukleniyor, agdan degil: xterm + React'in ~800 kB'si
    // masaustu uygulamasi icin anlamli bir maliyet degil, parcalamaya gerek yok.
    chunkSizeWarningLimit: 1200,
  },
});
