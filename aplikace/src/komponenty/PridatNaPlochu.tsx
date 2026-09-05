// „Přidat na plochu" — instalace webové verze (PWA) do telefonu/počítače.
// Chrome/Edge/Android nabídnou nativní prompt (beforeinstallprompt); iOS Safari
// prompt nemá, tak ukážeme návod. V nainstalované aplikaci a v desktopové
// (Tauri) verzi se komponenta nezobrazuje.
import { useEffect, useState, type ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function beziJakoAplikace(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function jeIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Jen webové prostředí (hostovaná verze) — v Tauri je origin tauri://…/http://tauri.localhost. */
function jeWebovaVerze(): boolean {
  return window.location.protocol === 'https:';
}

export default function PridatNaPlochu() {
  const [podnet, setPodnet] = useState<BeforeInstallPromptEvent | null>(null);
  const [nainstalovano, setNainstalovano] = useState(false);

  useEffect(() => {
    const zachyt = (e: Event) => {
      e.preventDefault();
      setPodnet(e as BeforeInstallPromptEvent);
    };
    const poInstalaci = () => {
      setNainstalovano(true);
      setPodnet(null);
    };
    window.addEventListener('beforeinstallprompt', zachyt);
    window.addEventListener('appinstalled', poInstalaci);
    return () => {
      window.removeEventListener('beforeinstallprompt', zachyt);
      window.removeEventListener('appinstalled', poInstalaci);
    };
  }, []);

  if (!jeWebovaVerze() || beziJakoAplikace()) return null;

  let obsah: ReactNode;
  if (nainstalovano) {
    obsah = <p className="pridat-na-plochu">✅ QUESTOR je přidaný na ploše — příště ho spustíš jako aplikaci.</p>;
  } else if (podnet) {
    obsah = (
      <div className="pridat-na-plochu">
        <button
          type="button"
          className="tlacitko tlacitko--zlate"
          onClick={() => {
            void podnet.prompt();
          }}
        >
          📲 Přidat QUESTOR na plochu
        </button>
        <span className="pridat-na-plochu__pozn">Poběží jako aplikace — celá obrazovka, vlastní ikona.</span>
      </div>
    );
  } else if (jeIos()) {
    obsah = (
      <p className="pridat-na-plochu">
        📲 Na iPhonu/iPadu: otevři tuhle stránku v <strong>Safari</strong>, ťukni na <strong>Sdílet</strong>{' '}
        (čtvereček se šipkou) a vyber <strong>Přidat na plochu</strong>.
      </p>
    );
  } else {
    obsah = (
      <p className="pridat-na-plochu">
        📲 V prohlížeči v menu vyber <strong>Přidat na plochu</strong> / <strong>Nainstalovat aplikaci</strong>.
      </p>
    );
  }

  return (
    <div className="nastaveni-sekce">
      <h2>Aplikace v telefonu</h2>
      <div className="panel">{obsah}</div>
    </div>
  );
}
