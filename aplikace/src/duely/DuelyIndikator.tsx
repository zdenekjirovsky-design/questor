// Indikator cekajicich vyzev (cislo v badge) — hlavni menu + karta na Domu.
// Odvozuje se ciste ze store, takze se obnovi sam po kazdem pullu duelu.
import { pouzijStav } from '../stav/store';
import { pocetCekajicichVyzev } from './engine';

export default function DuelyIndikator({ trida = 'duely-indikator' }: { trida?: string }) {
  const pocet = pouzijStav((s) =>
    s.aktivniProfilId
      ? pocetCekajicichVyzev(s.duely, s.otevreneDuely, s.aktivniProfilId, new Date().toISOString())
      : 0,
  );
  if (pocet === 0) return null;
  return (
    <span className={trida} aria-label={`Čeká na tebe ${pocet} výzev`}>
      {pocet}
    </span>
  );
}
