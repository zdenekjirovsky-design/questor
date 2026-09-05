// Admin mini-web QUESTORu — jedna kompletní HTML stránka (vanilla JS + fetch).
// Barvy a tón podle docs/DESIGN.md („Noční akademie“): tmavé pozadí #0f0d1a,
// panely #1a1730, akcent #8b5cf6, zlatá #f5b942. Stránka sama o sobě nenese
// žádná data — admin token se zadává do pole a ukládá do localStorage.
// POZOR: klientský JS je psaný bez šablonových literálů (soubor je TS template
// literal) a vše dynamické se vkládá přes textContent (žádné innerHTML s daty).

export const ADMIN_HTML = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QUESTOR — admin</title>
<style>
  :root {
    --pozadi: #0f0d1a;
    --panel: #1a1730;
    --panel-2: #221d3d;
    --okraj: rgba(139, 92, 246, 0.25);
    --akcent: #8b5cf6;
    --zlata: #f5b942;
    --text: #e8e4f5;
    --text-tlumeny: #9b93b8;
    --uspech: #34d399;
    --chyba: #f87171;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--pozadi) radial-gradient(1200px 600px at 50% -10%, rgba(139, 92, 246, 0.18), transparent 70%);
    color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    padding: 24px 16px 64px;
  }
  main { max-width: 1080px; margin: 0 auto; display: grid; gap: 20px; }
  header.hlavicka { max-width: 1080px; margin: 0 auto 24px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; }
  h1 { font-size: 1.6rem; letter-spacing: 0.06em; }
  h1 .zn { color: var(--zlata); }
  h1 .role { color: var(--text-tlumeny); font-weight: 400; font-size: 1rem; margin-left: 8px; }
  h2 { font-size: 1.05rem; margin-bottom: 14px; color: var(--akcent); letter-spacing: 0.04em; text-transform: uppercase; }
  section.panel {
    background: var(--panel);
    border: 1px solid var(--okraj);
    border-radius: 14px;
    padding: 20px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  }
  .radek { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  label { color: var(--text-tlumeny); font-size: 0.85rem; }
  input, select, textarea, button {
    font: inherit;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--okraj);
    border-radius: 8px;
    padding: 8px 12px;
  }
  input:focus, select:focus, textarea:focus { outline: 2px solid var(--akcent); outline-offset: 1px; }
  textarea { width: 100%; min-height: 70px; resize: vertical; }
  button { cursor: pointer; background: var(--akcent); border: none; font-weight: 600; }
  button:hover { filter: brightness(1.12); }
  button.zlate { background: var(--zlata); color: #241a04; }
  button.tiche { background: var(--panel-2); border: 1px solid var(--okraj); font-weight: 400; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--okraj); }
  th { color: var(--text-tlumeny); font-weight: 500; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-mrizka { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .kpi { background: var(--panel-2); border: 1px solid var(--okraj); border-radius: 8px; padding: 12px 14px; }
  .profil-mrizka { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
  .profil-karta { background: var(--panel-2); border: 1px solid var(--okraj); border-radius: 8px; padding: 14px; }
  .profil-karta .profil-jmeno { font-size: 1.1rem; font-weight: 700; color: var(--zlata); margin-bottom: 10px; }
  .profil-karta .kpi-mrizka { grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; }
  .profil-karta .kpi { background: var(--panel); padding: 8px 10px; }
  .profil-karta .kpi .hodnota { font-size: 1.15rem; }
  .kpi .hodnota { font-size: 1.5rem; font-weight: 700; color: var(--zlata); }
  .kpi .popisek { font-size: 0.75rem; color: var(--text-tlumeny); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  .xp-bar { height: 10px; border-radius: 5px; background: var(--panel-2); border: 1px solid var(--okraj); overflow: hidden; margin: 6px 0 4px; }
  .xp-bar > div { height: 100%; background: linear-gradient(90deg, var(--akcent), var(--zlata)); width: 0; transition: width 0.4s ease-out; }
  .zprava { margin-top: 10px; font-size: 0.9rem; min-height: 1.2em; }
  .zprava.ok { color: var(--uspech); }
  .zprava.chyba { color: var(--chyba); }
  .tlumene { color: var(--text-tlumeny); }
  .odsaz { margin-top: 14px; }
  form.vyzva { display: grid; gap: 10px; }
</style>
</head>
<body>
<header class="hlavicka">
  <h1><span class="zn">QUESTOR</span><span class="role">admin</span></h1>
  <div class="radek">
    <label for="token">Admin token</label>
    <input id="token" type="password" placeholder="admin token" autocomplete="off">
    <button id="ulozToken" class="tiche" type="button">Uložit</button>
    <button id="obnovit" class="tiche" type="button">Obnovit data</button>
  </div>
</header>
<main>
  <section class="panel" id="panel-banky">
    <h2>Banky otázek</h2>
    <table>
      <thead><tr><th>Předmět</th><th>Název</th><th>Verze</th></tr></thead>
      <tbody id="banky-telo"><tr><td colspan="3" class="tlumene">Načítám…</td></tr></tbody>
    </table>
    <div class="radek odsaz">
      <input id="soubor-banky" type="file" accept="application/json,.json">
      <button id="nahraj-banku" class="zlate" type="button">Nahrát banku (PUT)</button>
    </div>
    <div class="zprava" id="banky-zprava"></div>
  </section>

  <section class="panel" id="panel-vyuka">
    <h2>Výuka</h2>
    <table>
      <thead><tr><th>Předmět</th><th>Verze</th></tr></thead>
      <tbody id="vyuka-telo"><tr><td colspan="2" class="tlumene">Načítám…</td></tr></tbody>
    </table>
    <div class="radek odsaz">
      <input id="soubor-vyuky" type="file" accept="application/json,.json">
      <button id="nahraj-vyuku" class="zlate" type="button">Nahrát výuku (PUT)</button>
    </div>
    <div class="zprava" id="vyuka-zprava"></div>
  </section>

  <section class="panel" id="panel-progres">
    <h2>Progres profilů</h2>
    <div id="progres-obsah"><span class="tlumene">Načítám…</span></div>
    <h2 class="odsaz">Poslední testy</h2>
    <table>
      <thead><tr><th>Kdy</th><th>Profil</th><th>Režim</th><th>Úspěšnost</th><th>XP</th><th>Combo</th><th>Truhla</th></tr></thead>
      <tbody id="testy-telo"><tr><td colspan="7" class="tlumene">Načítám…</td></tr></tbody>
    </table>
  </section>

  <section class="panel" id="panel-vyzva">
    <h2>Poslat výzvu</h2>
    <form class="vyzva" id="form-vyzva">
      <label for="vyzva-zprava">Vzkaz pro studenta</label>
      <textarea id="vyzva-zprava" placeholder="Např.: Zvládneš 10 otázek z marketingu na 80 %?" required></textarea>
      <div class="radek">
        <label for="vyzva-predmet">Předmět</label>
        <select id="vyzva-predmet" required></select>
        <label for="vyzva-rezim">Režim</label>
        <select id="vyzva-rezim">
          <option value="rozcvicka">rozcvička</option>
          <option value="standard" selected>standard</option>
          <option value="hardcore">hardcore</option>
          <option value="adaptivni">adaptivní</option>
          <option value="zkouska">zkouška</option>
        </select>
        <label for="vyzva-pocet">Otázek</label>
        <select id="vyzva-pocet">
          <option value="5">5</option>
          <option value="10" selected>10</option>
          <option value="20">20</option>
        </select>
        <label for="vyzva-cil">Cíl (%)</label>
        <input id="vyzva-cil" type="number" min="1" max="100" step="1" placeholder="—" style="width:80px">
        <label for="vyzva-profil">Komu</label>
        <select id="vyzva-profil"><option value="">všem</option></select>
      </div>
      <div class="radek">
        <button type="submit">Odeslat výzvu</button>
      </div>
    </form>
    <div class="zprava" id="vyzva-zprava-stav"></div>
    <h2 class="odsaz">Otevřené výzvy</h2>
    <table>
      <thead><tr><th>Vytvořeno</th><th>Vzkaz</th><th>Předmět</th><th>Komu</th><th>Stav</th></tr></thead>
      <tbody id="vyzvy-telo"><tr><td colspan="5" class="tlumene">Načítám…</td></tr></tbody>
    </table>
  </section>
</main>
<script>
(function () {
  'use strict';
  var KLIC_TOKENU = 'questor-admin-token';
  function $(id) { return document.getElementById(id); }
  function token() {
    try { return localStorage.getItem(KLIC_TOKENU) || ''; } catch (e) { return ''; }
  }
  function api(cesta, moznosti) {
    moznosti = moznosti || {};
    var hlavicky = moznosti.headers || {};
    hlavicky['x-questor-token'] = token();
    moznosti.headers = hlavicky;
    return fetch(cesta, moznosti);
  }
  function nastavZpravu(id, text, ok) {
    var el = $(id);
    el.textContent = text;
    el.className = 'zprava ' + (ok ? 'ok' : 'chyba');
  }
  function bunka(text) { var td = document.createElement('td'); td.textContent = text; return td; }
  function radekTabulky(bunky) {
    var tr = document.createElement('tr');
    for (var i = 0; i < bunky.length; i++) tr.appendChild(bunka(bunky[i]));
    return tr;
  }
  function prazdnyRadek(telo, pocet, text) {
    telo.textContent = '';
    var tr = document.createElement('tr');
    var td = bunka(text);
    td.colSpan = pocet;
    td.className = 'tlumene';
    tr.appendChild(td);
    telo.appendChild(tr);
  }
  function procenta(podil) { return Math.round(podil * 100) + ' %'; }
  function datumCas(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('cs-CZ');
  }

  // --- Banky ---------------------------------------------------------------
  function nactiBanky() {
    var telo = $('banky-telo');
    var vyber = $('vyzva-predmet');
    return api('/api/banky').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (banky) {
      vyber.textContent = '';
      if (!banky.length) { prazdnyRadek(telo, 3, 'Žádná banka — nahraj JSON níže.'); return; }
      telo.textContent = '';
      for (var i = 0; i < banky.length; i++) {
        telo.appendChild(radekTabulky([banky[i].predmetId, banky[i].nazev, 'v' + banky[i].verze]));
        var opt = document.createElement('option');
        opt.value = banky[i].predmetId;
        opt.textContent = banky[i].nazev;
        vyber.appendChild(opt);
      }
    }).catch(function () {
      prazdnyRadek(telo, 3, 'Nepodařilo se načíst — zkontroluj token.');
    });
  }

  $('nahraj-banku').addEventListener('click', function () {
    var vstup = $('soubor-banky');
    if (!vstup.files || !vstup.files[0]) {
      nastavZpravu('banky-zprava', 'Nejdřív vyber JSON soubor s bankou.', false);
      return;
    }
    var ctecka = new FileReader();
    ctecka.onload = function () {
      var banka;
      try { banka = JSON.parse(String(ctecka.result)); }
      catch (e) { nastavZpravu('banky-zprava', 'Soubor není platný JSON.', false); return; }
      if (!banka || typeof banka.predmetId !== 'string') {
        nastavZpravu('banky-zprava', 'V JSONu chybí predmetId.', false);
        return;
      }
      api('/api/banky/' + encodeURIComponent(banka.predmetId), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(banka)
      }).then(function (r) { return r.json().then(function (data) { return { r: r, data: data }; }); })
        .then(function (v) {
          if (v.r.ok) {
            nastavZpravu('banky-zprava', 'Nahráno — banka „' + banka.predmetId + '“ má teď verzi ' + v.data.verze + '.', true);
            nactiBanky();
          } else {
            nastavZpravu('banky-zprava', v.data.chyba || ('Chyba HTTP ' + v.r.status), false);
          }
        })
        .catch(function () { nastavZpravu('banky-zprava', 'Server neodpovídá.', false); });
    };
    ctecka.readAsText(vstup.files[0]);
  });

  // --- Výuka ---------------------------------------------------------------
  function nactiVyuku() {
    var telo = $('vyuka-telo');
    return api('/api/vyuka').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (vyuky) {
      if (!vyuky.length) { prazdnyRadek(telo, 2, 'Žádná výuka — nahraj JSON níže.'); return; }
      telo.textContent = '';
      for (var i = 0; i < vyuky.length; i++) {
        telo.appendChild(radekTabulky([vyuky[i].predmetId, 'v' + vyuky[i].verze]));
      }
    }).catch(function () {
      prazdnyRadek(telo, 2, 'Nepodařilo se načíst — zkontroluj token.');
    });
  }

  $('nahraj-vyuku').addEventListener('click', function () {
    var vstup = $('soubor-vyuky');
    if (!vstup.files || !vstup.files[0]) {
      nastavZpravu('vyuka-zprava', 'Nejdřív vyber JSON soubor s výukou.', false);
      return;
    }
    var ctecka = new FileReader();
    ctecka.onload = function () {
      var vyuka;
      try { vyuka = JSON.parse(String(ctecka.result)); }
      catch (e) { nastavZpravu('vyuka-zprava', 'Soubor není platný JSON.', false); return; }
      if (!vyuka || typeof vyuka.predmetId !== 'string') {
        nastavZpravu('vyuka-zprava', 'V JSONu chybí predmetId.', false);
        return;
      }
      api('/api/vyuka/' + encodeURIComponent(vyuka.predmetId), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(vyuka)
      }).then(function (r) { return r.json().then(function (data) { return { r: r, data: data }; }); })
        .then(function (v) {
          if (v.r.ok) {
            nastavZpravu('vyuka-zprava', 'Nahráno — výuka „' + vyuka.predmetId + '“ má teď verzi ' + v.data.verze + '.', true);
            nactiVyuku();
          } else {
            nastavZpravu('vyuka-zprava', v.data.chyba || ('Chyba HTTP ' + v.r.status), false);
          }
        })
        .catch(function () { nastavZpravu('vyuka-zprava', 'Server neodpovídá.', false); });
    };
    ctecka.readAsText(vstup.files[0]);
  });

  // --- Progres profilů a poslední testy ------------------------------------
  var profily = []; // [{ profilId, jmeno, ... }] z posledního načtení progresu
  function jmenoProfilu(profilId) {
    for (var i = 0; i < profily.length; i++) {
      if (profily[i].profilId === profilId) return profily[i].jmeno;
    }
    return profilId;
  }
  function kpi(hodnota, popisek) {
    var div = document.createElement('div');
    div.className = 'kpi';
    var h = document.createElement('div'); h.className = 'hodnota'; h.textContent = hodnota;
    var p = document.createElement('div'); p.className = 'popisek'; p.textContent = popisek;
    div.appendChild(h); div.appendChild(p);
    return div;
  }
  function naplnVyberProfilu() {
    var vyber = $('vyzva-profil');
    var vybrane = vyber.value;
    vyber.textContent = '';
    var vsem = document.createElement('option');
    vsem.value = '';
    vsem.textContent = 'všem';
    vyber.appendChild(vsem);
    for (var i = 0; i < profily.length; i++) {
      var opt = document.createElement('option');
      opt.value = profily[i].profilId;
      opt.textContent = profily[i].jmeno;
      vyber.appendChild(opt);
    }
    vyber.value = vybrane;
    if (vyber.selectedIndex < 0) vyber.value = '';
  }
  function kartaProfilu(zaznam) {
    var p = zaznam.progres;
    var lvl = zaznam.level;
    var karta = document.createElement('div');
    karta.className = 'profil-karta';
    var jmeno = document.createElement('div');
    jmeno.className = 'profil-jmeno';
    jmeno.textContent = zaznam.jmeno;
    karta.appendChild(jmeno);
    var mrizka = document.createElement('div');
    mrizka.className = 'kpi-mrizka';
    mrizka.appendChild(kpi('Lvl ' + lvl.level, 'level'));
    mrizka.appendChild(kpi(p.xp + ' XP', 'celkové XP'));
    mrizka.appendChild(kpi(p.streak.aktualni + ' 🔥', 'streak (nejdelší ' + p.streak.nejdelsi + ')'));
    mrizka.appendChild(kpi(String(p.dokonceneTesty), 'dokončených testů'));
    karta.appendChild(mrizka);
    var bar = document.createElement('div'); bar.className = 'xp-bar';
    var vypln = document.createElement('div');
    bar.appendChild(vypln);
    karta.appendChild(bar);
    var pop = document.createElement('div');
    pop.className = 'tlumene';
    pop.textContent = 'Do dalšího levelu: ' + lvl.xpVLevelu + ' / ' + lvl.xpNaDalsiLevel + ' XP · přijato ' + datumCas(zaznam.prijato);
    karta.appendChild(pop);
    requestAnimationFrame(function () { vypln.style.width = Math.round(lvl.procento * 100) + '%'; });
    return karta;
  }
  function nactiProgres() {
    var obsah = $('progres-obsah');
    return api('/api/progres').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().then(function (data) {
        profily = data;
        naplnVyberProfilu();
        obsah.textContent = '';
        if (!data.length) {
          var s = document.createElement('span');
          s.className = 'tlumene';
          s.textContent = 'Zatím nic nedorazilo — žádný profil neposlal progres.';
          obsah.appendChild(s);
          return;
        }
        var mrizka = document.createElement('div');
        mrizka.className = 'profil-mrizka';
        for (var i = 0; i < data.length; i++) mrizka.appendChild(kartaProfilu(data[i]));
        obsah.appendChild(mrizka);
      });
    }).catch(function () {
      obsah.textContent = '';
      var s = document.createElement('span'); s.className = 'chyba'; s.textContent = 'Nepodařilo se načíst progres — zkontroluj token.';
      s.style.color = 'var(--chyba)';
      obsah.appendChild(s);
    });
  }
  function nactiTesty() {
    var telo = $('testy-telo');
    return api('/api/udalosti?limit=15').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (udalosti) {
      if (!udalosti.length) { prazdnyRadek(telo, 7, 'Zatím žádné dokončené testy.'); return; }
      telo.textContent = '';
      for (var i = 0; i < udalosti.length; i++) {
        var v = udalosti[i].vysledek;
        telo.appendChild(radekTabulky([
          datumCas(udalosti[i].cas),
          udalosti[i].profilJmeno || '—',
          v.konfigurace.rezim,
          procenta(v.uspesnost),
          '+' + v.ziskaneXp,
          '×' + v.nejdelsiCombo,
          v.truhla || '—'
        ]));
      }
    }).catch(function () { prazdnyRadek(telo, 7, 'Nepodařilo se načíst.'); });
  }

  // --- Výzvy ---------------------------------------------------------------
  function nactiVyzvy() {
    var telo = $('vyzvy-telo');
    return api('/api/vyzvy').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (vyzvy) {
      if (!vyzvy.length) { prazdnyRadek(telo, 5, 'Žádná otevřená výzva.'); return; }
      telo.textContent = '';
      for (var i = 0; i < vyzvy.length; i++) {
        telo.appendChild(radekTabulky([
          datumCas(vyzvy[i].vytvoreno),
          vyzvy[i].zprava,
          vyzvy[i].konfigurace.predmetId,
          vyzvy[i].cilovyProfilId ? jmenoProfilu(vyzvy[i].cilovyProfilId) : 'všem',
          vyzvy[i].stav
        ]));
      }
    }).catch(function () { prazdnyRadek(telo, 5, 'Nepodařilo se načíst.'); });
  }

  $('form-vyzva').addEventListener('submit', function (udalost) {
    udalost.preventDefault();
    var predmetId = $('vyzva-predmet').value;
    if (!predmetId) { nastavZpravu('vyzva-zprava-stav', 'Nejdřív nahraj banku — výzva potřebuje předmět.', false); return; }
    var telo = {
      zprava: $('vyzva-zprava').value.trim(),
      konfigurace: {
        predmetId: predmetId,
        rezim: $('vyzva-rezim').value,
        pocetOtazek: Number($('vyzva-pocet').value)
      }
    };
    var cil = $('vyzva-cil').value;
    if (cil) telo.cilovaUspesnost = Number(cil) / 100;
    var cilovyProfil = $('vyzva-profil').value;
    if (cilovyProfil) telo.cilovyProfilId = cilovyProfil;
    api('/api/vyzvy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(telo)
    }).then(function (r) { return r.json().then(function (data) { return { r: r, data: data }; }); })
      .then(function (v) {
        if (v.r.ok) {
          nastavZpravu('vyzva-zprava-stav', 'Výzva odeslána — student ji uvidí jako speciální quest.', true);
          $('vyzva-zprava').value = '';
          $('vyzva-cil').value = '';
          nactiVyzvy();
        } else {
          nastavZpravu('vyzva-zprava-stav', v.data.chyba || ('Chyba HTTP ' + v.r.status), false);
        }
      })
      .catch(function () { nastavZpravu('vyzva-zprava-stav', 'Server neodpovídá.', false); });
  });

  // --- Token a start -------------------------------------------------------
  // Výzvy až po progresu — jména profilů ve sloupci „Komu“ se berou z profilů.
  function nactiVse() { nactiBanky(); nactiVyuku(); nactiTesty(); nactiProgres().then(nactiVyzvy); }
  $('ulozToken').addEventListener('click', function () {
    try { localStorage.setItem(KLIC_TOKENU, $('token').value); } catch (e) { /* soukromý režim */ }
    nactiVse();
  });
  $('obnovit').addEventListener('click', nactiVse);
  $('token').value = token();
  nactiVse();
})();
</script>
</body>
</html>
`;
