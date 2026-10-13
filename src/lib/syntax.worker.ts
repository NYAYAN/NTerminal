import { createSyntaxService, type SyntaxReply, type SyntaxRequest } from "./syntaxService";

/*
 * Renklendiricinin iş parçacığı.
 *
 * Neden ayrı: TextMate gramerleri JavaScript'in düzenli ifade motorunda
 * yavaş. ÖLÇÜLDÜ (Node 24, bu depo): `DiffWindow.tsx` (1.570 satır) 600 ms,
 * ilk açılışta düzenli ifadeler derlenirken TEK satır 175 ms. Ana pencerede
 * bu, dosya açılınca terminalin ve yazmanın takılması demekti. Oniguruma'nın
 * WASM motoru altı kat hızlı ama içerik güvenlik politikası (`script-src
 * 'self'`) WASM derlemeyi kapatıyor; onu gevşetmek yerine iş buraya alındı.
 *
 * Dilimler arası bekleme `setTimeout` değil `MessageChannel`: art arda
 * kurulan zamanlayıcıları tarayıcı 4 ms'ye çekiyor, büyük bir dosyada işin
 * dörtte biri beklemeyle geçerdi.
 */

const scope = self as unknown as {
  postMessage(message: SyntaxReply): void;
  addEventListener(type: "message", listener: (event: MessageEvent<SyntaxRequest>) => void): void;
};

const channel = new MessageChannel();
let queued: (() => void) | null = null;
channel.port1.onmessage = () => {
  const run = queued;
  queued = null;
  run?.();
};

const handle = createSyntaxService(
  (reply) => scope.postMessage(reply),
  (run) => {
    queued = run;
    channel.port2.postMessage(null);
  },
);

scope.addEventListener("message", (event) => handle(event.data));
