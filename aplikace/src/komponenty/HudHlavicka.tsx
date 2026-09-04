// HUD v hlavičce: mini avatar, level + animovaný XP bar, streak plamínek.
// Plamínek pohasíná, dokud dnes nebyla aktivita; ledová varianta, když streak
// zachránilo zmrazení.
import { useEffect, useRef, useState } from 'react';
import { denZData, stavLevelu } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import Avatar from '../hra/Avatar';
import './HudHlavicka.css';

export default function HudHlavicka() {
  const progres = pouzijStav((s) => s.progres);
  const zmrazeniPouzitoDen = pouzijStav((s) => s.zmrazeniPouzitoDen);

  const level = stavLevelu(progres.xp);
  const dnes = denZData(new Date());
  const aktivniDnes = progres.streak.posledniDen === dnes;
  const ledovy = zmrazeniPouzitoDen === dnes;

  // Pulz XP baru při přírůstku XP.
  const predchoziXp = useRef(progres.xp);
  const [pulz, setPulz] = useState(false);
  useEffect(() => {
    if (progres.xp > predchoziXp.current) {
      setPulz(true);
      const t = setTimeout(() => setPulz(false), 700);
      predchoziXp.current = progres.xp;
      return () => clearTimeout(t);
    }
    predchoziXp.current = progres.xp;
  }, [progres.xp]);

  const tridaPlaminku = [
    'hud__plaminek',
    !aktivniDnes ? 'hud__plaminek--pohasly' : '',
    ledovy ? 'hud__plaminek--ledovy' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="hud-hlavicka">
      <Avatar konfigurace={progres.avatar} velikost={40} />
      <div className="hud__level-blok" title={`${progres.xp} XP celkem`}>
        <div className="hud__level-radek">
          <span className="hud__level">LVL {level.level}</span>
          <span className="hud__xp-text">
            {level.xpVLevelu}/{level.xpNaDalsiLevel} XP
          </span>
        </div>
        <div className={pulz ? 'ukazatel ukazatel--zlaty hud__xp-bar hud__xp-bar--pulz' : 'ukazatel ukazatel--zlaty hud__xp-bar'}>
          <div style={{ width: `${Math.round(level.procento * 100)}%` }} />
        </div>
      </div>
      <div
        className={tridaPlaminku}
        title={
          ledovy
            ? `Streak ${progres.streak.aktualni} dní — zachráněno zmrazením ❄️`
            : aktivniDnes
              ? `Streak ${progres.streak.aktualni} dní — dnes splněno!`
              : `Streak ${progres.streak.aktualni} dní — dnes ještě nic. Dokonči test!`
        }
      >
        <span className="hud__plaminek-ikona" aria-hidden="true">
          {ledovy ? '🧊' : '🔥'}
        </span>
        <span className="hud__plaminek-cislo">{progres.streak.aktualni}</span>
      </div>
    </div>
  );
}
