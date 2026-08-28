import ReactDOM from "react-dom/client";

import "./styles/global.css";
import { App } from "./App";

// StrictMode bilerek kullanilmiyor: efektleri iki kez kosturuyor, bu da her
// sekme icin iki kabuk sureci baslatilmasina yol aciyor.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
