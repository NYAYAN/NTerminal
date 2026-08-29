import { useEffect, useState } from "react";

import { localeTag, tp, useLang, useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { isMac } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";

export function StatusBar() {
  const t = useT();
  const lang = useLang();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const profiles = useStore((s) => s.settings.profiles);
  const running = useStore((s) => s.running);
  const paths = useStore((s) => s.paths);
  const restored = useStore((s) => s.restoredSession);
  // Oturum nesnesi React durumunda degil; bu sayac degisince yeniden ciziyoruz.
  useStore((s) => s.statusTick);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];
  const session = tab ? sessions.get(tab.id) : undefined;
  const profile = profiles.find((p) => p.id === tab?.profileId);

  const [historyCount, setHistoryCount] = useState<number | null>(null);

  // Geçmiş sayısı sık değişiyor ama saniyede birkaç kez okumaya değmez.
  useEffect(() => {
    let alive = true;
    const read = () => {
      void api
        .historyStats()
        .then((stats) => {
          if (alive) setHistoryCount(stats.total);
        })
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

  return (
    <div className="statusbar">
      {group && (
        <span className="item">
          <span className="dot" style={{ background: group.color ?? "#666", width: 7, height: 7, borderRadius: "50%" }} />
          {group.name}
        </span>
      )}

      {profile && <span className="item">{profile.name}</span>}

      {tab?.cwd && (
        <span
          className="item cwd"
          title={`${tab.cwd}\n${t("status.revealHint")}`}
          style={{ cursor: "pointer" }}
          onClick={() => void api.revealInExplorer(tab.cwd!).catch(() => {})}
        >
          {tab.cwd}
        </span>
      )}

      <span className="spacer" />

      {tab && running[tab.id] && <span className="pill">{t("status.running")}</span>}

      {session &&
        (session.integration ? (
          <span className="pill ok" title={t("status.integrationOnTitle")}>
            {t("status.integrationOn")}
          </span>
        ) : (
          <span
            className="pill warn"
            title={t("status.integrationOffTitle")}
          >
            {t("status.integrationOff")}
          </span>
        ))}

      {session && session.prediction !== "unknown" && (
        <span
          className={session.prediction === "unsupported" ? "pill warn" : "pill"}
          title={
            session.prediction === "unsupported"
              ? // Cozum yolu platforma gore farkli: Windows'ta PSReadLine
                // guncellemesi, mac'te zsh-autosuggestions kurulumu. Yanlis
                // platformun tavsiyesini gostermek kullaniciyi bos yere
                // ugrastirir.
                t(
                  isMac()
                    ? "status.predictionUnsupportedTitleMac"
                    : "status.predictionUnsupportedTitle",
                )
              : session.prediction === "off"
                ? t("status.predictionOffTitle")
                : t("status.predictionOnTitle", { view: session.prediction })
          }
        >
          {session.prediction === "unsupported"
            ? t("status.predictionUnsupported")
            : session.prediction === "off"
              ? t("status.predictionOff")
              : t("status.predictionOn")}
        </span>
      )}

      {session?.pid != null && (
        <span className="item" title={t("status.pidTitle")}>
          pid {session.pid}
        </span>
      )}

      {historyCount !== null && (
        <span className="item" title={t("status.commandsTitle")}>
          {tp("status.commands", historyCount, {
            n: historyCount.toLocaleString(localeTag(lang)),
          })}
        </span>
      )}

      <span className="item" title={t("status.tabsTitle")}>
        {tp("status.tabs", totalTabs)}
      </span>

      {paths?.portable && (
        <span className="pill" title={t("status.portableTitle", { path: paths.root })}>
          {t("status.portable")}
        </span>
      )}

      {restored && (
        <span className="pill" title={t("status.restoredTitle")}>
          {t("status.restored")}
        </span>
      )}
    </div>
  );
}
