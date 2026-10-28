/*
  ui.js — L'INTERFACCIA: tutto ciò che rende l'app comoda da usare, su PC e telefono.

    1. NAVIGAZIONE   → menu "Altro" sul telefono, pulsanti che portano a un'altra pagina
    2. PANORAMICA    → la pagina iniziale con la frase riassuntiva
    3. SCHEDA MEZZO  → la finestra che si apre toccando una targa
    4. TABELLE       → etichette per il telefono, ordinamento per colonna, ricerca
    5. AVVIO

  Questo file non salva dati: legge "dati" (app.js) e li mostra.
  Viene richiamato da aggiornaTutto() attraverso la funzione dopoDisegno().
*/


/* ======================================================================
   1. NAVIGAZIONE
   ====================================================================== */

const voci = document.querySelector('.voci');
const pulsanteAltro = document.getElementById('btn-altro');

function chiudiAltro() {
  voci.classList.remove('altro-aperto');
  pulsanteAltro.setAttribute('aria-expanded', 'false');
}

pulsanteAltro.addEventListener('click', evento => {
  evento.stopPropagation();
  const aperto = voci.classList.toggle('altro-aperto');
  pulsanteAltro.setAttribute('aria-expanded', String(aperto));
});

// Sul telefono le voci secondarie si impilano sopra la barra: a ognuna diciamo a che "piano" sta
// (style.css usa --piano per calcolare l'altezza). Così aggiungere una voce non richiede di toccare il CSS.
const secondarie = [...voci.querySelectorAll('.secondaria')];
secondarie.forEach((voce, i) => {
  voce.style.setProperty('--piano', secondarie.length - 1 - i);
  voce.classList.toggle('prima', i === 0);
  voce.classList.toggle('ultima', i === secondarie.length - 1);
});
document.addEventListener('click', evento => {
  if (!evento.target.closest('.voci')) chiudiAltro();
});

// Ogni cambio di pagina: chiude il menu "Altro" e torna in cima
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  chiudiAltro();
  window.scrollTo(0, 0);
}));

// Porta a una pagina come se avessi toccato la voce del menu
function vaiA(vista) {
  document.querySelector(`.tab[data-vista="${vista}"]`)?.click();
}
document.querySelectorAll('[data-vai]').forEach(b => b.addEventListener('click', () => vaiA(b.dataset.vai)));

const NOME_AZIENDA_PREDEFINITO = 'ZUIN AUTOTRASPORTI SRL';

function mostraNomeAzienda() {
  const nome = impostazioni.nomeAzienda || NOME_AZIENDA_PREDEFINITO;
  document.getElementById('nome-azienda').textContent = nome;
  document.getElementById('nome-azienda-telefono').textContent = nome;
  document.title = `${nome} – Gestionale flotta`;
}


/* ======================================================================
   2. PANORAMICA
   ====================================================================== */

// "1 documento scaduto" / "3 documenti scaduti": l'italiano vuole il plurale giusto
function plurale(n, singolare, plurale) {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

function quandoScade(s) {
  if (s.stato === 'da-inserire') return '<strong>manca la data</strong>';
  if (s.giorni < 0) return `<strong>scaduta da ${plurale(-s.giorni, 'giorno', 'giorni')}</strong>${formattaData(s.data)}`;
  if (s.giorni === 0) return `<strong>scade oggi</strong>${formattaData(s.data)}`;
  return `<strong>tra ${plurale(s.giorni, 'giorno', 'giorni')}</strong>${formattaData(s.data)}`;
}

function disegnaPanoramica() {
  const oggi = new Date();
  const dataOggi = oggi.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('data-oggi').textContent = dataOggi.charAt(0).toUpperCase() + dataOggi.slice(1);

  // --- La frase riassuntiva ---
  const scadenze = elencoScadenze();
  const conta = stato => scadenze.filter(s => s.stato === stato).length;
  const scadute = conta('scaduta'), inScadenza = conta('in-scadenza'), daInserire = conta('da-inserire');

  const parti = [];
  if (scadute) parti.push(plurale(scadute, 'documento scaduto', 'documenti scaduti'));
  if (inScadenza) parti.push(`${inScadenza} in scadenza`);
  if (daInserire) parti.push(`${daInserire} da completare`);

  let frase;
  if (!dati.mezzi.length && !dati.autisti.length) frase = 'Inizia importando il tuo file Excel.';
  else if (!parti.length) frase = 'Tutti i documenti sono in regola.';
  else frase = parti.length === 1 ? parti[0] + '.' : parti.slice(0, -1).join(', ') + ' e ' + parti.at(-1) + '.';
  // la prima lettera maiuscola ("3 documenti..." resta com'è)
  document.getElementById('frase-situazione').textContent = frase.charAt(0).toUpperCase() + frase.slice(1);

  // --- Elenco "Da sistemare" ---
  const urgenti = scadenze.filter(s => s.stato !== 'ok');
  const elenco = document.getElementById('elenco-urgenti');
  const MASSIMO = 8;

  if (!dati.mezzi.length && !dati.autisti.length) {
    elenco.innerHTML = `<li class="vuoto-panoramica">Vai in <button class="link" data-vai="dati">Dati e impostazioni</button>
      e scegli il file Excel: mezzi, autisti e scadenze compaiono qui.</li>`;
  } else if (!urgenti.length) {
    elenco.innerHTML = '<li class="tutto-ok">Niente da sistemare.</li>';
  } else {
    elenco.innerHTML = urgenti.slice(0, MASSIMO).map(s => `
      <li class="${s.stato}">
        <span>${riferimentoHtml(s)}</span>
        <span><span class="documento">${s.documento}</span><br><span class="tenue">${esc(s.descrizione)}</span></span>
        <span class="quando">${quandoScade(s)}</span>
      </li>`).join('') +
      (urgenti.length > MASSIMO
        ? `<li class="altri"><button class="link" data-vai="dashboard">Altre ${urgenti.length - MASSIMO} da vedere</button></li>`
        : '');
  }
  elenco.querySelectorAll('[data-vai]').forEach(b => b.addEventListener('click', () => vaiA(b.dataset.vai)));

  // --- Questo mese (tratte) ---
  const meseISO = oggi.toISOString().slice(0, 7);
  const nomeMese = oggi.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  document.getElementById('titolo-mese').textContent = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1);

  const delMese = dati.tratte.filter(t => t.data.startsWith(meseISO));
  let km = 0, ricavo = 0, margine = 0;
  for (const t of delMese) {
    const c = costiTratta(t);
    km += t.km;
    if (c.ricavo != null) { ricavo += c.ricavo; margine += c.margine; }
  }
  document.getElementById('cifre-mese').innerHTML = `
    <div><dt>Tratte</dt><dd>${delMese.length}</dd></div>
    <div><dt>Km</dt><dd>${formatoNumero(km)}</dd></div>
    <div><dt>Ricavo</dt><dd>${formatoEuro.format(ricavo)}</dd></div>
    <div><dt>Margine</dt><dd class="${margine < 0 ? 'negativo' : ''}">${formatoEuro.format(margine)}</dd></div>`;

  const ultime = [...dati.tratte].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 3);
  document.getElementById('ultime-tratte').innerHTML = ultime.length
    ? ultime.map(t => `<li><span>${esc(nomeBreve(t.partenza))} → ${esc(nomeBreve(t.arrivo))}</span>
        <span>${formattaData(t.data)}</span></li>`).join('')
    : `<li><span class="tenue">Le tratte salvate dalla pagina Percorso compaiono qui.</span></li>`;

  // --- Flotta ---
  const inServizio = tipo => dati.mezzi.filter(m => m.tipo === tipo && !STATI_ESCLUSI.includes(m.stato)).length;
  const totale = tipo => dati.mezzi.filter(m => m.tipo === tipo && m.stato !== 'Venduto').length;
  document.getElementById('cifre-flotta').innerHTML = `
    <div><dt>Trattori in servizio</dt><dd>${inServizio('trattore')} su ${totale('trattore')}</dd></div>
    <div><dt>Semirimorchi in servizio</dt><dd>${inServizio('rimorchio')} su ${totale('rimorchio')}</dd></div>
    <div><dt>Autisti attivi</dt><dd>${dati.autisti.filter(a => a.stato === 'Attivo').length}</dd></div>
    ${totale('auto') ? `<div><dt>Auto aziendali</dt><dd>${totale('auto')}</dd></div>` : ''}`;

  const fermi = dati.mezzi.filter(m => m.stato === 'Fermo' || m.stato === 'In manutenzione');
  document.getElementById('mezzi-fermi').innerHTML = fermi
    .map(m => `<li><span>${targaHtml(m.targa, m.id)}</span><span>${esc(m.stato)}</span></li>`).join('');

  // Numero delle scadute accanto alla voce "Scadenze" del menu
  document.getElementById('menu-scadenze').textContent = scadute || '';
}


/* ======================================================================
   3. SCHEDA MEZZO
   ====================================================================== */

const dialogScheda = document.getElementById('dialog-scheda');

function apriScheda(id, sezione) {
  const m = dati.mezzi.find(x => x.id === id);
  if (!m) return;

  const tipo = { trattore: 'Trattore', auto: 'Auto aziendale' }[m.tipo] || `Semirimorchio ${m.tipoRimorchio || ''}`.trim();
  const descrizione = [tipo, [m.marca, m.modello].filter(Boolean).join(' '), m.anno].filter(Boolean).join(', ');

  // Documenti con il loro stato, calcolato con le stesse regole della pagina Scadenze
  const documenti = DOCUMENTI[m.tipo].map(doc => {
    const data = m.scadenze[doc.chiave];
    let badge;
    if (!data) badge = doc.facoltativo ? '<span class="tenue">non inserita</span>' : '<span class="badge da-inserire">Da inserire</span>';
    else {
      const stato = statoScadenza(giorniMancanti(data), doc.preavviso);
      badge = `<span class="badge ${stato}">${ETICHETTE_STATO[stato]}</span>`;
    }
    return `<li><span>${doc.nome}</span><span class="data">${data ? formattaData(data) : ''}</span>${badge}</li>`;
  }).join('');

  const misure = m.altezza || m.larghezza || m.lunghezza
    ? `${numero(m.altezza)} × ${numero(m.larghezza)} × ${numero(m.lunghezza)} m` : '—';
  const dettagli = [
    ['Marca', m.marca], ['Modello', m.modello], ['Anno', m.anno], ['Telaio', m.telaio],
    m.tipo === 'trattore' && ['Autista', m.autista],
    m.tipo === 'rimorchio' && ['Tipo', m.tipoRimorchio],
    m.tipo !== 'auto' && ['Massa complessiva', m.massa ? `${numero(m.massa)} t` : ''],
    m.tipo !== 'auto' && ['Altezza × larghezza × lunghezza', misure],
    ['Note', m.note],
  ].filter(Boolean).map(([nome, valore]) => `<div><dt>${nome}</dt><dd>${esc(valore || '—')}</dd></div>`).join('');

  // Le tratte salvate in cui compare questa targa
  const tratte = dati.tratte
    .filter(t => t.trattore === m.targa || t.rimorchio === m.targa)
    .sort((a, b) => b.data.localeCompare(a.data));
  const kmTotali = tratte.reduce((somma, t) => somma + t.km, 0);
  const elencoTratte = tratte.length
    ? `<p class="tenue">${plurale(tratte.length, 'tratta salvata', 'tratte salvate')}, ${formatoNumero(kmTotali)} km in tutto.</p>
       <ul class="elenco-tratte">${tratte.slice(0, 5).map(t => `<li><span>${esc(nomeBreve(t.partenza))} → ${esc(nomeBreve(t.arrivo))}</span>
         <span>${formattaData(t.data)}, ${formatoNumero(t.km)} km</span></li>`).join('')}</ul>`
    : '<p class="tenue">Nessuna tratta salvata con questo mezzo.</p>';

  document.getElementById('contenuto-scheda').innerHTML = `
    <div class="scheda-testa">
      <span class="targa grande"><span class="targa-ue" aria-hidden="true">I</span><span class="targa-testo">${esc(m.targa)}</span></span>
      <div>
        <div>${badgeStato(m.stato)}</div>
        <div class="sotto">${esc(descrizione)}</div>
      </div>
      <div class="barra chiudi">
        <button type="button" class="secondario" id="scheda-modifica">Modifica</button>
        <button type="button" class="secondario" id="scheda-chiudi" aria-label="Chiudi">✕</button>
      </div>
    </div>
    <div class="scheda-corpo">
      <!-- La foto viene caricata da foto.js (arriva un attimo dopo, perché IndexedDB è asincrono) -->
      <div class="foto-mezzo" id="foto-mezzo"></div>
      <section><h3>Scadenze</h3><ul class="documenti-mezzo">${documenti}</ul></section>
      <section><h3>Libretto e documenti</h3><div id="allegati-scheda"></div></section>
      <section><h3>Dati del mezzo</h3><dl class="dati-mezzo">${dettagli}</dl></section>
      <section><h3>Tratte</h3>${elencoTratte}</section>
    </div>`;

  document.getElementById('scheda-chiudi').addEventListener('click', () => dialogScheda.close());
  document.getElementById('scheda-modifica').addEventListener('click', () => {
    dialogScheda.close();
    apriModuloMezzo(m);
  });
  dialogScheda.showModal();
  mostraFotoScheda(m);
  sezioneAllegati(document.getElementById('allegati-scheda'), 'mezzo', m.id);
  if (sezione === 'documenti') vaiAiDocumenti();
}

// Aperta dal pulsante "Documenti": scorre la scheda fino all'elenco dei file
function vaiAiDocumenti() {
  document.getElementById('allegati-scheda').closest('section').scrollIntoView({ block: 'start' });
}

// Lo stato di un documento con scadenza, come etichetta colorata (usato dalle schede mezzo e autista)
function badgeDocumento(data, doc) {
  if (!data) return doc.facoltativo ? '<span class="tenue">non inserita</span>' : '<span class="badge da-inserire">Da inserire</span>';
  const stato = statoScadenza(giorniMancanti(data), doc.preavviso);
  return `<span class="badge ${stato}">${ETICHETTE_STATO[stato]}</span>`;
}


/* ---------- Scheda dell'autista ---------- */

function apriSchedaAutista(id, sezione) {
  const a = dati.autisti.find(x => x.id === id);
  if (!a) return;

  const scadenze = DOCUMENTI.autista.map(doc => {
    const data = a.scadenze[doc.chiave];
    return `<li><span>${doc.nome}</span><span class="data">${data ? formattaData(data) : ''}</span>${badgeDocumento(data, doc)}</li>`;
  }).join('');

  const mezzi = dati.mezzi.filter(m => m.autista === a.nome).map(m => targaHtml(m.targa, m.id)).join(' ');
  const carte = (dati.carte || []).filter(c => c.assegnata === `autista:${a.id}`).map(c => esc(c.fornitore)).join(', ');
  const telefono = a.telefono
    ? `<a href="tel:${esc(a.telefono.replace(/\s/g, ''))}">${esc(a.telefono)}</a>` : '—';
  const dettagli = [
    ['Telefono', telefono], ['N° patente', esc(a.numeroPatente || '—')], ['N° carta tachigrafica', esc(a.numeroCarta || '—')],
    ['Mezzo', mezzi || '—'], ['Carte carburante', carte || '—'], ['Note', esc(a.note || '—')],
  ].map(([nome, valore]) => `<div><dt>${nome}</dt><dd>${valore}</dd></div>`).join('');

  document.getElementById('contenuto-scheda').innerHTML = `
    <div class="scheda-testa">
      <span class="nome-autista grande">${esc(a.nome)}</span>
      <div><div>${badgeStato(a.stato)}</div><div class="sotto">Autista</div></div>
      <div class="barra chiudi">
        <button type="button" class="secondario" id="scheda-modifica">Modifica</button>
        <button type="button" class="secondario" id="scheda-chiudi" aria-label="Chiudi">✕</button>
      </div>
    </div>
    <div class="scheda-corpo">
      <section><h3>Scadenze</h3><ul class="documenti-mezzo">${scadenze}</ul></section>
      <section><h3>Documenti</h3><div id="allegati-scheda"></div></section>
      <section><h3>Dati</h3><dl class="dati-mezzo">${dettagli}</dl></section>
    </div>`;

  document.getElementById('scheda-chiudi').addEventListener('click', () => dialogScheda.close());
  document.getElementById('scheda-modifica').addEventListener('click', () => {
    dialogScheda.close();
    apriModuloAutista(a);
  });
  dialogScheda.showModal();
  sezioneAllegati(document.getElementById('allegati-scheda'), 'autista', a.id);
  if (sezione === 'documenti') vaiAiDocumenti();
}

document.addEventListener('click', evento => {
  const nome = evento.target.closest('[data-scheda-autista]');
  if (nome) apriSchedaAutista(nome.dataset.schedaAutista);
});

// Un solo ascoltatore per tutte le targhe della pagina, anche quelle disegnate dopo
document.addEventListener('click', evento => {
  const targa = evento.target.closest('button.targa[data-scheda]');
  if (targa) apriScheda(targa.dataset.scheda);
});

// La scheda si chiude anche toccando fuori dalla finestra
dialogScheda.addEventListener('click', evento => { if (evento.target === dialogScheda) dialogScheda.close(); });


/* ======================================================================
   4. TABELLE
   ====================================================================== */

// Sul telefono ogni cella mostra il nome della sua colonna (style.css lo legge da data-label)
function etichettaCelle(tabella) {
  const intestazioni = [...tabella.querySelectorAll('thead th')].map(th => th.textContent.trim());
  tabella.querySelectorAll('tbody tr').forEach(riga => {
    if (riga.cells.length !== intestazioni.length) return;   // riga "vuota" con colspan
    [...riga.cells].forEach((cella, i) => {
      cella.dataset.label = intestazioni[i];
      // cella senza dato ("—" o "— × — × —"): sul telefono la nascondiamo
      cella.classList.toggle('cella-vuota', /^[—×\s]*$/.test(cella.textContent) && !cella.querySelector('button'));
    });
  });
}

// Valore con cui ordinare una cella: un numero se possibile, altrimenti il testo
function valoreCella(cella) {
  const grezzo = cella.dataset.ordina ?? cella.textContent.trim();
  if (grezzo === '' || grezzo === '—') return null;
  const data = grezzo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (data) return Number(data[3] + data[2] + data[1]);
  const pulito = grezzo.replace(/[€\s]/g, '');
  if (/^-?\d+(\.\d+)?$/.test(pulito)) return Number(pulito);                       // 12.5 (da data-ordina)
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(pulito)) {               // 1.234,50 (formato italiano)
    return Number(pulito.replace(/\./g, '').replace(',', '.'));
  }
  return grezzo.toLowerCase();
}

function ordinaTabella(tabella, indice, verso) {
  const corpo = tabella.tBodies[0];
  const righe = [...corpo.rows].filter(r => !r.querySelector('td.vuoto'));
  righe.sort((a, b) => {
    const va = valoreCella(a.cells[indice]), vb = valoreCella(b.cells[indice]);
    if (va === null) return 1;                               // le celle vuote sempre in fondo
    if (vb === null) return -1;
    const confronto = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return verso === 'su' ? confronto : -confronto;
  });
  righe.forEach(r => corpo.append(r));                       // "append" di una riga esistente la sposta in fondo
}

function preparaOrdinamento(tabella) {
  tabella.querySelectorAll('thead th').forEach((th, indice) => {
    if (!th.textContent.trim() || th.classList.contains('ordinabile')) return;
    th.classList.add('ordinabile');
    th.addEventListener('click', () => {
      const verso = th.dataset.verso === 'su' ? 'giu' : 'su';
      tabella.querySelectorAll('th').forEach(altro => delete altro.dataset.verso);
      th.dataset.verso = verso;
      ordinaTabella(tabella, indice, verso);
    });
  });
}

// Dopo che una tabella è stata ridisegnata, rimettiamo l'ordine scelto
function riapplicaOrdinamento(tabella) {
  const th = tabella.querySelector('th[data-verso]');
  if (th) ordinaTabella(tabella, [...th.parentNode.children].indexOf(th), th.dataset.verso);
}

// Ricerca: nasconde le righe che non contengono il testo cercato
function applicaRicerca(campo) {
  const testo = campo.value.trim().toLowerCase();
  document.querySelectorAll(`${campo.dataset.cerca} tbody tr`).forEach(riga => {
    if (riga.querySelector('td.vuoto')) return;
    riga.classList.toggle('nascosta-ricerca', Boolean(testo) && !riga.textContent.toLowerCase().includes(testo));
  });
}
document.querySelectorAll('input.cerca').forEach(campo => campo.addEventListener('input', () => applicaRicerca(campo)));


/* ======================================================================
   5. AVVIO
   ====================================================================== */

// Chiamata da aggiornaTutto() ogni volta che i dati cambiano
function dopoDisegno() {
  disegnaPanoramica();
  mostraContatti();                    // es. dopo aver importato un backup
  document.querySelectorAll('.contenitore-tabella table').forEach(tabella => {
    preparaOrdinamento(tabella);
    riapplicaOrdinamento(tabella);
    etichettaCelle(tabella);
  });
  document.querySelectorAll('input.cerca').forEach(applicaRicerca);
}

// Anche il filtro "Da sistemare / Tutte" ridisegna la tabella: rimettiamo etichette e ricerca
document.getElementById('filtro-stato').addEventListener('change', dopoDisegno);

mostraNomeAzienda();
dopoDisegno();
