"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [helpOpen, setHelpOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    setPlatform(/iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /Android/i.test(userAgent) ? "android" : "other");
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(isStandalone);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installedHandler = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!installPrompt) {
      setHelpOpen(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } catch {
      setInstallPrompt(null);
      setHelpOpen(true);
    }
  };

  return <>
    <button aria-label="Install RenewMe as an app" className={compact ? "install-app-button install-app-button-compact" : "install-app-button"} onClick={() => void install()} type="button">
      <span aria-hidden="true" className="material-symbols-outlined">install_mobile</span>
      <span>{compact ? "Install" : "Install app"}</span>
    </button>
    {helpOpen && <div className="install-help-backdrop" onClick={() => setHelpOpen(false)}>
      <section aria-labelledby="install-help-title" aria-modal="true" className="install-help-card" onClick={(event) => event.stopPropagation()} role="dialog">
        <button aria-label="Close install instructions" className="install-help-close" onClick={() => setHelpOpen(false)} type="button"><span aria-hidden="true" className="material-symbols-outlined">close</span></button>
        <span aria-hidden="true" className="install-help-icon material-symbols-outlined">add_to_home_screen</span>
        <h2 id="install-help-title">Add RenewMe to your home screen</h2>
        {platform === "ios" ? <p>In Safari, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong> and confirm.</p> : platform === "android" ? <p>Open the browser menu, choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</p> : <p>Open your browser menu and choose <strong>Install RenewMe</strong> or <strong>Create shortcut</strong>. The wording depends on your browser.</p>}
        <button className="button button-primary" onClick={() => setHelpOpen(false)} type="button">Got it</button>
      </section>
    </div>}
  </>;
}
