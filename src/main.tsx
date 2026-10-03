import ReactDOM from "react-dom/client";

import "./styles/global.css";
import { parseDiffQuery } from "./lib/diffWindow";

const root = ReactDOM.createRoot(document.getElementById("root")!);

/*
 * Aynı sayfa iki ayrı pencere: ana pencere ve fark pencereleri.
 *
 * Fark penceresi `index.html?view=diff&…` ile açılıyor (bkz. `lib/diffWindow.ts`).
 * İki dal da DİNAMİK içe aktarma: fark penceresi ana arayüzün modüllerini
 * (depo, terminal oturumları, kabuk başlatma) hiç yüklemiyor. Statik içe
 * aktarma, fark penceresinde de bu modüllerin kök düzeyi kodunu koştururdu.
 */
const diff = parseDiffQuery(window.location.search);
if (diff) {
  void import("./components/DiffWindow").then(({ DiffWindow }) =>
    root.render(<DiffWindow target={diff} />),
  );
} else {
  // StrictMode bilerek kullanilmiyor: efektleri iki kez kosturuyor, bu da her
  // sekme icin iki kabuk sureci baslatilmasina yol aciyor.
  void import("./App").then(({ App }) => root.render(<App />));
}
