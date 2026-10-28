/*
  app.js — IL COMPORTAMENTO della pagina.

  Lezione 2: oltre ai mezzi ora ci sono gli autisti, e le regole sono le stesse del file Excel:
    - ogni documento ha i suoi giorni di preavviso (come il foglio LISTE)
    - un documento senza data risulta "Da inserire"
    - i mezzi Fermi o Venduti e gli autisti Non attivi non compaiono tra le scadenze

  Le parti del file:
    1. REGOLE       → quali documenti esistono e con che preavviso
    2. DATI         → dove sono tenuti e come si salvano
    3. LOGICA       → giorni mancanti, stato, elenco delle scadenze
    4. DISEGNO      → trasformare i dati in tabelle
    5. MODULI       → aggiungere / modificare / eliminare mezzi e autisti
    6. BACKUP       → esporta e importa un file .json
    7. AVVIO        → collegare i pulsanti

  L'importazione da Excel sta in un file a parte, import-excel.js.
*/


/* ======================================================================
   1. REGOLE
   ====================================================================== */

// Per ogni tipo (trattore, rimorchio, autista) l'elenco dei documenti con scadenza.
//   chiave     → nome "tecnico" usato nei dati
//   nome       → nome mostrato a schermo
//   preavviso  → quanti giorni prima diventa arancione (gli stessi del tuo foglio LISTE)
//   facoltativo→ se manca la data non viene segnalato come "Da inserire"
const DOCUMENTI = {
  trattore: [
    { chiave: 'revisione',       nome: 'Revisione',                  preavviso: 60 },
    { chiave: 'bollo',           nome: 'Bollo',                      preavviso: 30 },
    { chiave: 'assicurazione',   nome: 'Assicurazione',              preavviso: 45 },
    { chiave: 'cronotachigrafo', nome: 'Cronotachigrafo (taratura)', preavviso: 30, facoltativo: true },
  ],
  // Auto aziendali: stessi documenti del trattore, senza cronotachigrafo
  auto: [
    { chiave: 'revisione',       nome: 'Revisione',                  preavviso: 60 },
    { chiave: 'bollo',           nome: 'Bollo',                      preavviso: 30 },
    { chiave: 'assicurazione',   nome: 'Assicurazione',              preavviso: 45 },
  ],
  rimorchio: [
    { chiave: 'revisione',       nome: 'Revisione',                  preavviso: 60 },
    { chiave: 'assicurazione',   nome: 'Assicurazione',              preavviso: 45 },
  ],
  autista: [
    { chiave: 'patente',         nome: 'Patente',                    preavviso: 60 },
    { chiave: 'cqc',             nome: 'CQC',                        preavviso: 60 },
    { chiave: 'cartaTachigrafica', nome: 'Carta tachigrafica',       preavviso: 60 },
  ],
};

// Stati per cui le scadenze NON vengono controllate (come il tuo foglio CALC)
// (Bloccata e Dismessa valgono per le carte carburante)
const STATI_ESCLUSI = ['Fermo', 'Venduto', 'Non attivo', 'Bloccata', 'Dismessa'];

// Carte carburante (vedi carte.js): l'unica scadenza è quella della carta
DOCUMENTI.carta = [
  { chiave: 'scadenza', nome: 'Scadenza carta', preavviso: 30, facoltativo: true },
];


/* ======================================================================
   2. DATI
   ====================================================================== */

const CHIAVE_SALVATAGGIO = 'gestionale-flotta-v1';

// Tutti i dati dell'app in un unico oggetto:
//   dati.mezzi   → [{ id, tipo, targa, tipoRimorchio, marca, modello, anno, telaio, stato, autista,
//                     massa, altezza, larghezza, lunghezza, note, scadenze: {...} }]
//   dati.autisti → [{ id, nome, telefono, numeroPatente, numeroCarta, stato, note, scadenze: {...} }]
//   dati.tratte  → le tratte salvate dalla scheda Percorso (vedi tratte.js)
let dati = caricaDati();

function caricaDati() {
  try {
    const testo = localStorage.getItem(CHIAVE_SALVATAGGIO);
    return normalizzaDati(testo ? JSON.parse(testo) : {});
  } catch (errore) {
    console.error('Impossibile leggere i dati salvati:', errore);
    return normalizzaDati({});
  }
}

// Nella lezione 1 i dati erano solo un elenco di mezzi con "attivo: true/false".
// Questa funzione converte il vecchio formato nel nuovo, così non perdi quello che avevi inserito.
// (Nei programmi veri si chiama "migrazione dei dati".)
function normalizzaDati(grezzi) {
  if (Array.isArray(grezzi)) {
    const mezzi = grezzi.map(m => {
      const { attivo, ...resto } = m;                       // toglie il vecchio campo "attivo"
      const scadenze = { ...m.scadenze, cronotachigrafo: m.scadenze?.tachigrafo || '' };
      delete scadenze.tachigrafo;
      return { ...resto, stato: attivo === false ? 'Fermo' : 'Attivo', scadenze };
    });
    return normalizzaDati({ mezzi });
  }
  return {
    mezzi: grezzi.mezzi || [],
    autisti: grezzi.autisti || [],
    tratte: grezzi.tratte || [],
    contatti: grezzi.contatti || {},       // i dati del biglietto da visita (vedi contatti.js)
    carte: grezzi.carte || [],             // le carte carburante (vedi carte.js)
    allegati: grezzi.allegati || [],       // la descrizione dei file caricati (vedi allegati.js)
  };
}

function salvaDati() {
  localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(dati));
  // Se l'app è collegata al database, cloud.js manda le modifiche
  if (typeof segnaleCambiamento === 'function') segnaleCambiamento();
}

function nuovoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}


/* ======================================================================
   3. LOGICA
   ====================================================================== */

function giorniMancanti(dataISO) {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const scadenza = new Date(dataISO + 'T00:00:00');
  return Math.round((scadenza - oggi) / (24 * 60 * 60 * 1000));
}

function statoScadenza(giorni, preavviso) {
  if (giorni < 0) return 'scaduta';
  if (giorni <= preavviso) return 'in-scadenza';
  return 'ok';
}

// "Trattore SCANIA", "Semirimorchio Cisterna", "Auto FIAT"
const NOMI_TIPO = { trattore: 'Trattore', rimorchio: 'Semirimorchio', auto: 'Auto' };
function descrizioneMezzo(m) {
  return `${NOMI_TIPO[m.tipo]} ${(m.tipo === 'rimorchio' ? m.tipoRimorchio : m.marca) || ''}`.trim();
}

// Ordine di urgenza per la tabella: prima le scadute, poi in scadenza, poi da inserire, poi le altre
const URGENZA = { scaduta: 0, 'in-scadenza': 1, 'da-inserire': 2, ok: 3 };

// Raccoglie le scadenze di mezzi e autisti in un unico elenco (è il tuo foglio CALC)
function elencoScadenze() {
  // Mettiamo mezzi e autisti nella stessa forma: { tipo, riferimento, descrizione, stato, scadenze }
  const soggetti = [
    ...dati.mezzi.map(m => ({
      id: m.id,
      tipo: m.tipo,
      riferimento: m.targa,
      descrizione: descrizioneMezzo(m),
      stato: m.stato,
      scadenze: m.scadenze,
    })),
    ...(dati.carte || []).map(c => ({
      id: c.id,
      tipo: 'carta',
      riferimento: `${c.fornitore} ${c.numero ? '…' + c.numero.replace(/\s/g, '').slice(-4) : ''}`.trim(),
      descrizione: 'Carta carburante',
      stato: c.stato,
      scadenze: { scadenza: c.scadenza },
    })),
    ...dati.autisti.map(a => ({
      id: a.id,
      tipo: 'autista',
      riferimento: a.nome,
      descrizione: 'Autista',
      stato: a.stato,
      scadenze: a.scadenze,
    })),
  ];

  const elenco = [];
  for (const s of soggetti) {
    if (STATI_ESCLUSI.includes(s.stato)) continue;

    for (const doc of DOCUMENTI[s.tipo]) {
      const data = s.scadenze[doc.chiave];

      if (!data) {
        if (!doc.facoltativo) elenco.push({ ...s, documento: doc.nome, data: '', giorni: null, stato: 'da-inserire' });
        continue;
      }

      const giorni = giorniMancanti(data);
      elenco.push({ ...s, documento: doc.nome, data, giorni, stato: statoScadenza(giorni, doc.preavviso) });
    }
  }

  return elenco.sort((a, b) =>
    URGENZA[a.stato] - URGENZA[b.stato] || (a.giorni ?? 0) - (b.giorni ?? 0));
}


/* ======================================================================
   4. DISEGNO
   ====================================================================== */

const ETICHETTE_STATO = {
  scaduta: 'Scaduta', 'in-scadenza': 'In scadenza', 'da-inserire': 'Da inserire', ok: 'In regola',
};

function formattaData(iso) {
  if (!iso) return '—';
  const [anno, mese, giorno] = iso.split('-');
  return `${giorno}/${mese}/${anno}`;
}

function numero(valore) {
  return valore === null || valore === undefined || valore === '' ? '—' : String(valore).replace('.', ',');
}

function esc(testo) {
  const div = document.createElement('div');
  div.textContent = testo ?? '';
  return div.innerHTML;
}

// La targa disegnata come una targa vera. Se passiamo l'id del mezzo diventa un pulsante
// che apre la scheda del mezzo (la gestisce ui.js).
function targaHtml(targa, id) {
  const interno = `<span class="targa-ue" aria-hidden="true">I</span><span class="targa-testo">${esc(targa)}</span>`;
  return id
    ? `<button type="button" class="targa" data-scheda="${id}" title="Apri la scheda di ${esc(targa)}">${interno}</button>`
    : `<span class="targa">${interno}</span>`;
}

// Il nome dell'autista come pulsante che apre la sua scheda (ui.js)
function autistaHtml(nome, id) {
  return id
    ? `<button type="button" class="nome-autista link-scheda" data-scheda-autista="${id}">${esc(nome)}</button>`
    : `<span class="nome-autista">${esc(nome)}</span>`;
}

// Il "riferimento" di una scadenza: targa, autista o carta carburante
function riferimentoHtml(s) {
  if (s.tipo === 'autista') return autistaHtml(s.riferimento, s.id);
  if (s.tipo === 'carta') return `<span class="nome-carta">${esc(s.riferimento)}</span>`;
  return targaHtml(s.riferimento, s.id);
}

// Trova l'id di un mezzo partendo dalla targa (serve dove salviamo solo la targa, es. nelle tratte)
function idDaTarga(targa) {
  return dati.mezzi.find(m => m.targa === targa)?.id;
}

// Etichetta colorata per lo stato di un mezzo o autista
function badgeStato(stato) {
  const classe = { Attivo: 'ok', 'In manutenzione': 'in-scadenza' }[stato] || 'inattivo';
  return `<span class="badge ${classe}">${esc(stato)}</span>`;
}

function disegnaDashboard() {
  const elenco = elencoScadenze();

  const conteggio = { scaduta: 0, 'in-scadenza': 0, 'da-inserire': 0, ok: 0 };
  elenco.forEach(s => conteggio[s.stato]++);

  document.getElementById('riepilogo').innerHTML = `
    <div class="card scaduta"><strong>${conteggio.scaduta}</strong>Scadute</div>
    <div class="card in-scadenza"><strong>${conteggio['in-scadenza']}</strong>In scadenza</div>
    <div class="card da-inserire"><strong>${conteggio['da-inserire']}</strong>Da inserire</div>
    <div class="card ok"><strong>${conteggio.ok}</strong>In regola</div>
  `;

  const filtro = document.getElementById('filtro-stato').value;
  const visibili = filtro === 'tutte' ? elenco : elenco.filter(s => s.stato !== 'ok');

  const corpo = document.getElementById('tabella-scadenze');
  if (visibili.length === 0) {
    corpo.innerHTML = `<tr><td colspan="5" class="vuoto">${elenco.length === 0
      ? 'Nessuna scadenza. Aggiungi mezzi e autisti, oppure importa il file Excel dalla scheda "Dati".'
      : 'Nessuna scadenza urgente: è tutto in regola.'}</td></tr>`;
    return;
  }

  corpo.innerHTML = visibili.map(s => `
    <tr>
      <td><span class="badge ${s.stato}">${ETICHETTE_STATO[s.stato]}</span></td>
      <td>${formattaData(s.data)}</td>
      <td>${riferimentoHtml(s)} <span class="tenue">${esc(s.descrizione)}</span></td>
      <td>${s.documento}</td>
      <td data-ordina="${s.giorni ?? 99999}">${s.giorni === null ? '—' : s.giorni < 0 ? `scaduta da ${-s.giorni} gg` : `${s.giorni} gg`}</td>
    </tr>
  `).join('');
}

// Disegna una delle tabelle dei mezzi (trattori, semirimorchi, auto aziendali).
// "colonna" è la cella che cambia tra le tabelle: l'autista per i trattori, il tipo per i semirimorchi.
// Le auto non hanno né l'una né peso e misure (non servono per i percorsi dei camion).
function disegnaTabellaMezzi(idCorpo, idConta, tipo, colonna, nomeSingolare) {
  const corpo = document.getElementById(idCorpo);
  const elenco = dati.mezzi
    .filter(m => m.tipo === tipo)
    .sort((a, b) =>
      (a.stato === 'Venduto') - (b.stato === 'Venduto') ||   // i venduti in fondo
      a.targa.localeCompare(b.targa));

  const inServizio = elenco.filter(m => !STATI_ESCLUSI.includes(m.stato)).length;
  document.getElementById(idConta).textContent = elenco.length ? `· ${inServizio} in servizio su ${elenco.length}` : '';

  if (elenco.length === 0) {
    corpo.innerHTML = `<tr><td colspan="8" class="vuoto">
      Nessun${nomeSingolare.startsWith('auto') ? 'a' : ''} ${nomeSingolare}. Usa il pulsante qui sopra
      oppure importa il file Excel dalla scheda "Dati".</td></tr>`;
    return;
  }

  corpo.innerHTML = elenco.map(m => `
    <tr class="${STATI_ESCLUSI.includes(m.stato) ? 'inattivo' : ''}">
      <td>${targaHtml(m.targa, m.id)}</td>
      ${tipo === 'rimorchio' ? colonna(m) : ''}
      <td>${esc(m.marca)} ${esc(m.modello)}</td>
      <td>${m.anno ?? '—'}</td>
      ${tipo === 'trattore' ? colonna(m) : ''}
      ${tipo === 'auto' ? '' : `
        <td>${numero(m.massa)}</td>
        <td>${numero(m.altezza)} × ${numero(m.larghezza)} × ${numero(m.lunghezza)}</td>`}
      <td>${badgeStato(m.stato)}</td>
      <td class="azioni">
        ${pulsanteDocumenti('mezzo', m.id)}
        <button class="secondario piccolo" data-azione="modifica" data-id="${m.id}">Modifica</button>
      </td>
    </tr>
  `).join('');
}

// Il pulsante "Documenti" nelle tabelle, con il numero di file già caricati (vedi allegati.js)
function pulsanteDocumenti(tipo, id) {
  const quanti = (dati.allegati || []).filter(a => a.proprietario.tipo === tipo && a.proprietario.id === id).length;
  return `<button class="secondario piccolo" data-azione="documenti" data-id="${id}">
    Documenti${quanti ? ` <span class="conta-documenti">${quanti}</span>` : ''}</button>`;
}

// Nei moduli Modifica: l'elenco dei file del mezzo/autista. Per uno nuovo bisogna prima salvarlo
// (i file vengono collegati all'id, che nasce al salvataggio).
function documentiNelModulo(contenitore, tipo, record) {
  if (record && typeof sezioneAllegati === 'function') sezioneAllegati(contenitore, tipo, record.id);
  else contenitore.innerHTML = '<p class="tenue">Salva prima, poi potrai caricare qui libretto e documenti.</p>';
}

function disegnaMezzi() {
  disegnaTabellaMezzi('tabella-trattori', 'conta-trattori', 'trattore',
    m => `<td>${esc(m.autista) || '—'}</td>`, 'trattore');
  disegnaTabellaMezzi('tabella-semirimorchi', 'conta-semirimorchi', 'rimorchio',
    m => `<td>${esc(m.tipoRimorchio) || '—'}</td>`, 'semirimorchio');
  disegnaTabellaMezzi('tabella-auto', 'conta-auto', 'auto', null, 'auto aziendale');
}

function disegnaAutisti() {
  const corpo = document.getElementById('tabella-autisti');

  if (dati.autisti.length === 0) {
    corpo.innerHTML = `<tr><td colspan="8" class="vuoto">
      Ancora nessun autista. Premi "+ Aggiungi autista" oppure importa il file Excel dalla scheda "Dati".</td></tr>`;
    return;
  }

  const ordinati = [...dati.autisti].sort((a, b) => a.nome.localeCompare(b.nome));

  corpo.innerHTML = ordinati.map(a => {
    // Quali trattori guida? Lo ricaviamo dai mezzi: il dato sta in un posto solo
    const targhe = dati.mezzi.filter(m => m.autista === a.nome).map(m => targaHtml(m.targa, m.id)).join(' ');
    return `
      <tr class="${STATI_ESCLUSI.includes(a.stato) ? 'inattivo' : ''}">
        <td>${autistaHtml(a.nome, a.id)}</td>
        <td>${esc(a.telefono) || '—'}</td>
        <td>${formattaData(a.scadenze.patente)}</td>
        <td>${formattaData(a.scadenze.cqc)}</td>
        <td>${formattaData(a.scadenze.cartaTachigrafica)}</td>
        <td>${targhe || '—'}</td>
        <td>${badgeStato(a.stato)}</td>
        <td class="azioni">
          ${pulsanteDocumenti('autista', a.id)}
          <button class="secondario piccolo" data-azione="modifica" data-id="${a.id}">Modifica</button>
          </td>
      </tr>`;
  }).join('');
}

function aggiornaTutto() {
  disegnaDashboard();
  disegnaMezzi();
  disegnaAutisti();
  // disegnaTratte sta in tratte.js, che viene caricato dopo: la chiamiamo solo se esiste già
  if (typeof disegnaTratte === 'function') disegnaTratte();
  if (typeof disegnaCarte === 'function') disegnaCarte();
  if (typeof disegnaModulistica === 'function') disegnaModulistica();
  // Lo stesso per ui.js: panoramica, etichette per il telefono, ordinamento e ricerca nelle tabelle
  if (typeof dopoDisegno === 'function') dopoDisegno();
}


/* ======================================================================
   5. MODULI
   ====================================================================== */

// I campi data dei moduli vengono creati partendo da DOCUMENTI:
// se aggiungi un documento lassù, il campo compare da solo nel modulo.
function creaCampiScadenze(fieldset, tipo, valori) {
  fieldset.querySelectorAll('label').forEach(l => l.remove());   // toglie i campi vecchi
  for (const doc of DOCUMENTI[tipo]) {
    const label = document.createElement('label');
    label.innerHTML = `${doc.nome}<input type="date" name="scad-${doc.chiave}">`;
    label.querySelector('input').value = valori[doc.chiave] || '';
    fieldset.append(label);
  }
}

// Legge i campi data di un modulo e li restituisce come { revisione: '2027-01-31', ... }
function leggiCampiScadenze(form, tipo) {
  const scadenze = {};
  for (const doc of DOCUMENTI[tipo]) scadenze[doc.chiave] = form.elements[`scad-${doc.chiave}`].value;
  return scadenze;
}

function pulito(valore) {
  return valore.trim();
}
function numeroONull(valore) {
  return valore.trim() === '' ? null : Number(valore);
}


/* ---------- Mezzi ---------- */

const dialogMezzo = document.getElementById('dialog-mezzo');
const formMezzo = document.getElementById('form-mezzo');
let mezzoInModifica = null;                                 // null = nuovo mezzo

const CAMPI_TESTO_MEZZO = ['tipo', 'targa', 'tipoRimorchio', 'marca', 'modello', 'telaio', 'stato', 'autista', 'note'];
const CAMPI_NUMERO_MEZZO = ['anno', 'massa', 'altezza', 'larghezza', 'lunghezza'];

// tipoNuovo: con quale tipo aprire il modulo quando si crea un mezzo nuovo
function apriModuloMezzo(mezzo, tipoNuovo = 'trattore') {
  formMezzo.reset();
  mezzoInModifica = mezzo;
  formMezzo.elements.tipo.value = tipoNuovo;
  document.getElementById('titolo-form-mezzo').textContent = mezzo
    ? `Modifica ${mezzo.targa}`
    : { trattore: 'Nuovo trattore', rimorchio: 'Nuovo semirimorchio', auto: 'Nuova auto aziendale' }[tipoNuovo];

  // Elenco autisti nel menu a tendina (più quello già assegnato, se nel frattempo non è più attivo)
  const nomi = dati.autisti.filter(a => a.stato === 'Attivo').map(a => a.nome);
  if (mezzo?.autista && !nomi.includes(mezzo.autista)) nomi.push(mezzo.autista);
  formMezzo.elements.autista.innerHTML =
    '<option value="">— nessuno —</option>' + nomi.sort().map(n => `<option>${esc(n)}</option>`).join('');

  if (mezzo) {
    for (const nome of [...CAMPI_TESTO_MEZZO, ...CAMPI_NUMERO_MEZZO]) formMezzo.elements[nome].value = mezzo[nome] ?? '';
  }

  adattaModuloAlTipo(mezzo ? mezzo.scadenze : {});
  documentiNelModulo(document.getElementById('documenti-modulo-mezzo'), 'mezzo', mezzo);
  document.getElementById('btn-elimina-mezzo').hidden = !mezzo;     // si elimina solo un mezzo già salvato
  dialogMezzo.showModal();
}

// Mostra/nasconde i campi che valgono solo per trattori o solo per rimorchi
function adattaModuloAlTipo(valoriScadenze) {
  const tipo = formMezzo.elements.tipo.value;
  formMezzo.querySelectorAll('.solo-trattore').forEach(el => el.hidden = tipo !== 'trattore');
  formMezzo.querySelectorAll('.solo-rimorchio').forEach(el => el.hidden = tipo !== 'rimorchio');
  formMezzo.querySelectorAll('.non-auto').forEach(el => el.hidden = tipo === 'auto');
  creaCampiScadenze(document.getElementById('campi-scadenze-mezzo'), tipo, valoriScadenze);
}

function salvaModuloMezzo(evento) {
  evento.preventDefault();
  const campi = formMezzo.elements;
  const targa = campi.targa.value.trim().toUpperCase().replace(/\s+/g, '');

  if (dati.mezzi.some(m => m.targa === targa && m !== mezzoInModifica)) {
    alert(`La targa ${targa} è già presente.`);
    return;
  }

  const mezzo = { id: mezzoInModifica?.id ?? nuovoId() };
  for (const nome of CAMPI_TESTO_MEZZO) mezzo[nome] = pulito(campi[nome].value);
  for (const nome of CAMPI_NUMERO_MEZZO) mezzo[nome] = numeroONull(campi[nome].value);
  mezzo.targa = targa;
  mezzo.scadenze = leggiCampiScadenze(formMezzo, mezzo.tipo);

  // I campi che non valgono per questo tipo li svuotiamo
  if (mezzo.tipo !== 'trattore') mezzo.autista = '';
  if (mezzo.tipo !== 'rimorchio') mezzo.tipoRimorchio = '';

  if (mezzoInModifica) {
    dati.mezzi[dati.mezzi.indexOf(mezzoInModifica)] = mezzo;
  } else {
    dati.mezzi.push(mezzo);
  }

  salvaDati();
  aggiornaTutto();
  dialogMezzo.close();
}

function eliminaMezzo(mezzo) {
  if (!confirm(`Eliminare definitivamente il mezzo ${mezzo.targa}?\n(Se è solo venduto, conviene cambiare lo stato in "Venduto".)`)) return;
  dati.mezzi = dati.mezzi.filter(m => m !== mezzo);
  if (typeof eliminaFoto === 'function') eliminaFoto(mezzo.id).catch(() => {});   // anche la sua foto (foto.js)
  liberaDaEliminato('mezzo', mezzo.id);
  salvaDati();
  aggiornaTutto();
}


/* ---------- Autisti ---------- */

const dialogAutista = document.getElementById('dialog-autista');
const formAutista = document.getElementById('form-autista');
let autistaInModifica = null;

const CAMPI_TESTO_AUTISTA = ['nome', 'telefono', 'numeroPatente', 'numeroCarta', 'stato', 'note'];

function apriModuloAutista(autista) {
  formAutista.reset();
  autistaInModifica = autista;
  document.getElementById('titolo-form-autista').textContent = autista ? `Modifica ${autista.nome}` : 'Nuovo autista';

  if (autista) {
    for (const nome of CAMPI_TESTO_AUTISTA) formAutista.elements[nome].value = autista[nome] ?? '';
  }
  creaCampiScadenze(document.getElementById('campi-scadenze-autista'), 'autista', autista ? autista.scadenze : {});
  documentiNelModulo(document.getElementById('documenti-modulo-autista'), 'autista', autista);
  document.getElementById('btn-elimina-autista').hidden = !autista;
  dialogAutista.showModal();
}

function salvaModuloAutista(evento) {
  evento.preventDefault();
  const campi = formAutista.elements;
  const nome = campi.nome.value.trim().replace(/\s+/g, ' ').toUpperCase();

  if (dati.autisti.some(a => a.nome === nome && a !== autistaInModifica)) {
    alert(`L'autista ${nome} è già presente.`);
    return;
  }

  const autista = { id: autistaInModifica?.id ?? nuovoId() };
  for (const n of CAMPI_TESTO_AUTISTA) autista[n] = pulito(campi[n].value);
  autista.nome = nome;
  autista.scadenze = leggiCampiScadenze(formAutista, 'autista');

  if (autistaInModifica) {
    // Se il nome è cambiato, aggiorniamo anche i trattori assegnati a lui
    const vecchioNome = autistaInModifica.nome;
    if (vecchioNome !== nome) dati.mezzi.forEach(m => { if (m.autista === vecchioNome) m.autista = nome; });
    dati.autisti[dati.autisti.indexOf(autistaInModifica)] = autista;
  } else {
    dati.autisti.push(autista);
  }

  salvaDati();
  aggiornaTutto();
  dialogAutista.close();
}

function eliminaAutista(autista) {
  if (!confirm(`Eliminare definitivamente ${autista.nome}?\n(Se non lavora più con voi, conviene cambiare lo stato in "Non attivo".)`)) return;
  dati.autisti = dati.autisti.filter(a => a !== autista);
  dati.mezzi.forEach(m => { if (m.autista === autista.nome) m.autista = ''; });   // libera i trattori
  liberaDaEliminato('autista', autista.id);
  salvaDati();
  aggiornaTutto();
}


/* ======================================================================
   6. BACKUP
   ====================================================================== */

// Quando si elimina un mezzo o un autista: via i suoi file caricati, e le carte carburante restano senza assegnazione
function liberaDaEliminato(tipo, id) {
  if (typeof eliminaAllegatiDi === 'function') eliminaAllegatiDi(tipo, id);
  (dati.carte || []).forEach(c => { if (c.assegnata === `${tipo}:${id}`) c.assegnata = ''; });
}

// Il backup contiene anche le foto (foto.js) e i file caricati (allegati.js), scritti come testo: per questo è "async"
async function esportaBackup() {
  const foto = typeof tutteLeFoto === 'function' ? await tutteLeFoto() : {};
  const file = typeof tuttiGliAllegati === 'function' ? await tuttiGliAllegati() : {};
  const testo = JSON.stringify({ versione: 4, ...dati, foto, file }, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
  link.download = `backup-flotta-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importaBackup(evento) {
  const file = evento.target.files[0];
  if (!file) return;
  try {
    const grezzi = JSON.parse(await file.text());
    const letti = normalizzaDati(grezzi);
    const nFoto = Object.keys(grezzi.foto || {}).length;
    const nFile = Object.keys(grezzi.file || {}).length;
    if (confirm(`Il backup contiene ${letti.mezzi.length} mezzi, ${letti.autisti.length} autisti, ${nFoto} foto e ${nFile} documenti. Sostituire i dati attuali?`)) {
      dati = letti;
      if (nFoto && typeof ripristinaFoto === 'function') await ripristinaFoto(grezzi.foto);
      if (nFile && typeof ripristinaAllegati === 'function') await ripristinaAllegati(grezzi.file);
      salvaDati();
      aggiornaTutto();
    }
  } catch (errore) {
    alert('File non valido: ' + errore.message);
  }
  evento.target.value = '';
}


/* ======================================================================
   7. AVVIO
   ====================================================================== */

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('attiva', t === tab));
    document.querySelectorAll('.vista').forEach(v =>
      v.classList.toggle('nascosta', v.id !== `vista-${tab.dataset.vista}`));
  });
});

document.getElementById('filtro-stato').addEventListener('change', disegnaDashboard);

document.querySelectorAll('[data-nuovo-tipo]').forEach(b =>
  b.addEventListener('click', () => apriModuloMezzo(null, b.dataset.nuovoTipo)));
document.getElementById('btn-nuovo-autista').addEventListener('click', () => apriModuloAutista(null));
formMezzo.addEventListener('submit', salvaModuloMezzo);
formAutista.addEventListener('submit', salvaModuloAutista);

// Cambiando tipo nel modulo mezzo, ricreiamo i campi data tenendo quelli già scritti
formMezzo.elements.tipo.addEventListener('change', () =>
  adattaModuloAlTipo(leggiCampiPresenti(document.getElementById('campi-scadenze-mezzo'))));

function leggiCampiPresenti(fieldset) {
  const valori = {};
  fieldset.querySelectorAll('input').forEach(i => valori[i.name.replace('scad-', '')] = i.value);
  return valori;
}

// Tutti i pulsanti "Annulla" chiudono la finestra in cui si trovano
document.querySelectorAll('[data-chiudi]').forEach(b =>
  b.addEventListener('click', () => b.closest('dialog').close()));

// "Elimina" sta dentro il modulo Modifica: così non si elimina per sbaglio dalla tabella
document.getElementById('btn-elimina-mezzo').addEventListener('click', () => {
  dialogMezzo.close();
  eliminaMezzo(mezzoInModifica);
});
document.getElementById('btn-elimina-autista').addEventListener('click', () => {
  dialogAutista.close();
  eliminaAutista(autistaInModifica);
});

// Pulsanti Documenti/Modifica nelle tabelle
// Un solo ascoltatore per entrambe le tabelle dei mezzi: lo mettiamo sulla sezione che le contiene
document.getElementById('vista-mezzi').addEventListener('click', evento => {
  const pulsante = evento.target.closest('button[data-azione]');
  if (!pulsante) return;
  const mezzo = dati.mezzi.find(m => m.id === pulsante.dataset.id);
  if (pulsante.dataset.azione === 'documenti') apriScheda(mezzo.id, 'documenti');
  if (pulsante.dataset.azione === 'modifica') apriModuloMezzo(mezzo);
  if (pulsante.dataset.azione === 'elimina') eliminaMezzo(mezzo);
});

document.getElementById('tabella-autisti').addEventListener('click', evento => {
  const pulsante = evento.target.closest('button[data-azione]');
  if (!pulsante) return;
  const autista = dati.autisti.find(a => a.id === pulsante.dataset.id);
  if (pulsante.dataset.azione === 'documenti') apriSchedaAutista(autista.id, 'documenti');
  if (pulsante.dataset.azione === 'modifica') apriModuloAutista(autista);
  if (pulsante.dataset.azione === 'elimina') eliminaAutista(autista);
});

document.getElementById('btn-esporta').addEventListener('click', esportaBackup);
document.getElementById('input-backup').addEventListener('change', importaBackup);

aggiornaTutto();
