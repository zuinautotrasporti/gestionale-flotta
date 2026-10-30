/*
  allegati.js — I FILE CARICATI (PDF e immagini): libretti, patenti, buoni di carico...

  Un unico sistema usato in quattro posti: scheda mezzo, scheda autista, carte carburante e modulistica.
  Ogni allegato ha due parti, salvate in due posti diversi:
    - la DESCRIZIONE (chi è il proprietario, categoria, nome del file, data) → in dati.allegati,
      insieme a tutti gli altri dati: è piccola
    - il FILE vero e proprio → in IndexedDB, come le foto: è grande
  Le due parti sono collegate dallo stesso id.

  "proprietario" dice a chi appartiene il file: { tipo: 'mezzo', id: '...' }, { tipo: 'autista', id: '...' }
  oppure { tipo: 'modulistica' } per i documenti di uso quotidiano.
*/

const CATEGORIE_ALLEGATI = {
  mezzo: ['Libretto di circolazione', 'Polizza assicurativa', 'Altro'],
  autista: ['Patente', 'Carta tachigrafica', "Carta d'identità", 'CQC', 'Altro'],
  modulistica: ['Certificato di lavaggio', 'Buono di carico', 'Documento di trasporto', 'Altro'],
};

const DIMENSIONE_MASSIMA_MB = 20;
const LATO_MASSIMO_DOCUMENTO = 2400;   // pixel: più delle foto, perché un documento deve restare leggibile

dati.allegati = dati.allegati || [];


/* ======================================================================
   1. ARCHIVIO (IndexedDB) — stessa tecnica di foto.js
   ====================================================================== */

let archivioAllegati = null;

async function apriArchivioAllegati() {
  if (archivioAllegati) return archivioAllegati;
  const req = indexedDB.open('gestionale-flotta-allegati', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('file');
  archivioAllegati = await richiesta(req);
  // Chiediamo al browser di non cancellare mai questi dati per fare spazio (dove lo permette)
  navigator.storage?.persist?.().catch(() => {});
  return archivioAllegati;
}

async function contenitoreAllegati(modo) {
  return (await apriArchivioAllegati()).transaction('file', modo).objectStore('file');
}
// Come per le foto: prima la copia nel browser, poi il database (cloud.js)
async function leggiFileAllegatoLocale(id) { return richiesta((await contenitoreAllegati('readonly')).get(id)); }

async function leggiFileAllegato(id) {
  const locale = await leggiFileAllegatoLocale(id);
  if (locale) return locale;
  const remoto = typeof cloudScaricaFile === 'function' ? await cloudScaricaFile(`allegati/${id}`) : null;
  if (remoto) await richiesta((await contenitoreAllegati('readwrite')).put(remoto, id));
  return remoto || undefined;
}

async function salvaFileAllegato(id, blob) {
  await richiesta((await contenitoreAllegati('readwrite')).put(blob, id));
  if (typeof cloudCaricaFile === 'function') cloudCaricaFile(`allegati/${id}`, blob);
}

async function cancellaFileAllegato(id) {
  await richiesta((await contenitoreAllegati('readwrite')).delete(id));
  if (typeof cloudEliminaFile === 'function') cloudEliminaFile(`allegati/${id}`);
}


/* ======================================================================
   2. AGGIUNGERE, TROVARE, ELIMINARE
   ====================================================================== */

// Le immagini vengono rimpicciolite (come le foto, ma più grandi); i PDF restano com'erano
async function preparaFile(file) {
  const ePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const eImmagine = file.type.startsWith('image/');
  if (!ePdf && !eImmagine) throw new Error('Si possono caricare solo PDF o immagini (JPG, PNG).');
  if (file.size > DIMENSIONE_MASSIMA_MB * 1024 * 1024) {
    throw new Error(`Il file pesa ${(file.size / 1048576).toFixed(1)} MB: il massimo è ${DIMENSIONE_MASSIMA_MB} MB.`);
  }
  if (ePdf) return { blob: file, tipo: 'application/pdf', nome: file.name };

  const immagine = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scala = Math.min(1, LATO_MASSIMO_DOCUMENTO / Math.max(immagine.width, immagine.height));
  const tela = document.createElement('canvas');
  tela.width = Math.round(immagine.width * scala);
  tela.height = Math.round(immagine.height * scala);
  tela.getContext('2d').drawImage(immagine, 0, 0, tela.width, tela.height);
  const blob = await new Promise(risolvi => tela.toBlob(risolvi, 'image/jpeg', 0.85));
  return { blob, tipo: 'image/jpeg', nome: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}

// extra: campi in più (per la modulistica: titolo e cliente)
async function aggiungiAllegato(proprietario, categoria, file, extra = {}) {
  const { blob, tipo, nome } = await preparaFile(file);
  const allegato = {
    id: nuovoId(),
    proprietario,
    categoria,
    nomeFile: nome,
    tipoFile: tipo,
    dimensione: blob.size,
    caricato: new Date().toISOString().slice(0, 10),
    ...extra,
  };
  await salvaFileAllegato(allegato.id, blob);   // prima il file: se fallisce, non resta una descrizione "orfana"
  dati.allegati.push(allegato);
  salvaDati();
  return allegato;
}

function allegatiDi(tipo, id) {
  return dati.allegati.filter(a => a.proprietario.tipo === tipo && (id === undefined || a.proprietario.id === id));
}

async function eliminaAllegato(allegato) {
  dati.allegati = dati.allegati.filter(a => a !== allegato);
  salvaDati();
  await cancellaFileAllegato(allegato.id).catch(() => {});
}

// Quando si elimina un mezzo o un autista, spariscono anche i suoi file
function eliminaAllegatiDi(tipo, id) {
  for (const a of allegatiDi(tipo, id)) eliminaAllegato(a);
}


/* ======================================================================
   3. APRIRE, STAMPARE, SCARICARE
   ====================================================================== */

async function indirizzoAllegato(allegato) {
  const blob = await leggiFileAllegato(allegato.id);
  if (!blob) throw new Error('Il file non si trova più in questo browser. Ripristinalo da un backup.');
  return URL.createObjectURL(blob);
}

// Sul telefono (schermo touch) la stampa diretta non funziona: "Stampa" apre il visore,
// e da lì si stampa con il menu Condividi/Stampa del telefono
const SU_TELEFONO = matchMedia('(pointer: coarse)').matches;

/* ---------- Il visore: i documenti si guardano DENTRO l'app ----------
   Prima aprivamo una nuova finestra, ma i telefoni la bloccano se non nasce subito dal tocco
   (noi prima dobbiamo recuperare il file) e l'app installata non sa mostrare file "in memoria".
   Ora: le immagini compaiono nel visore; per i PDF il visore prepara un pulsante "Apri il PDF".
   Toccandolo, il telefono lo apre con il suo lettore di PDF: è un tocco "fresco", quindi non viene bloccato. */

const dialogVisore = document.getElementById('dialog-visore');
let indirizziVisore = [];

function chiudiVisore() {
  dialogVisore.close();
}
dialogVisore.addEventListener('close', () => {
  indirizziVisore.forEach(u => URL.revokeObjectURL(u));
  indirizziVisore = [];
  dialogVisore.querySelector('.corpo-visore').innerHTML = '';
});
dialogVisore.querySelector('[data-chiudi-visore]').addEventListener('click', chiudiVisore);
dialogVisore.addEventListener('click', e => { if (e.target === dialogVisore) chiudiVisore(); });

// titolo: cosa mostrare in alto; percorso: dove sta il file sul database; leggi(): restituisce il file
async function apriVisore({ titolo, nomeFile, tipo, percorso, leggi }) {
  const corpo = dialogVisore.querySelector('.corpo-visore');
  dialogVisore.querySelector('.titolo-visore').textContent = titolo;
  corpo.innerHTML = '<p class="tenue">Caricamento…</p>';
  if (!dialogVisore.open) dialogVisore.showModal();

  try {
    const blob = await leggi();
    if (!blob) throw new Error('Il file non si trova: controlla la connessione e riprova.');
    const locale = URL.createObjectURL(blob);
    indirizziVisore.push(locale);
    const scarica = `<a class="bottone secondario" href="${locale}" download="${esc(nomeFile)}">Scarica</a>`;

    if ((tipo || blob.type).startsWith('image/')) {
      corpo.innerHTML = `
        <img class="immagine-visore" src="${locale}" alt="${esc(titolo)}">
        <div class="azioni-visore">${scarica}</div>`;
    } else {
      // Per il PDF usiamo, se c'è, un indirizzo web temporaneo del database (valido 10 minuti):
      // è un vero link https, che tutti i telefoni sanno aprire. Altrimenti la copia nel browser.
      const remoto = percorso && typeof cloudIndirizzoFirmato === 'function' ? await cloudIndirizzoFirmato(percorso) : null;
      corpo.innerHTML = `
        <div class="pdf-visore">
          ${ICONA_PDF}
          <p><strong>${esc(nomeFile)}</strong><br><span class="tenue">${formattaDimensione(blob.size)}</span></p>
        </div>
        <div class="azioni-visore">
          <a class="bottone" href="${remoto || locale}" target="_blank" rel="noopener">Apri il PDF</a>
          ${scarica}
        </div>`;
    }
  } catch (errore) {
    corpo.innerHTML = `<p class="errore-testo">${esc(errore.message)}</p>`;
  }
}

function apriAllegato(allegato) {
  apriVisore({
    titolo: allegato.titolo || allegato.categoria,
    nomeFile: allegato.nomeFile,
    tipo: allegato.tipoFile,
    percorso: `allegati/${allegato.id}`,
    leggi: () => leggiFileAllegato(allegato.id),
  });
}

async function scaricaAllegato(allegato) {
  try {
    const link = document.createElement('a');
    link.href = await indirizzoAllegato(allegato);
    link.download = allegato.nomeFile;
    link.click();
  } catch (errore) { alert(errore.message); }
}

// Stampa: carichiamo il file in una cornice invisibile (iframe) e lanciamo la stampa da lì.
// Aprendo l'app come file dal PC alcuni browser non lo permettono: in quel caso apriamo il file
// in una nuova scheda e basta premere Ctrl+P. Online (dopo GitHub) funzionerà direttamente.
async function stampaAllegato(allegato) {
  if (SU_TELEFONO) return apriAllegato(allegato);
  let indirizzo;
  try { indirizzo = await indirizzoAllegato(allegato); } catch (errore) { return alert(errore.message); }

  const cornice = document.createElement('iframe');
  cornice.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  cornice.src = allegato.tipoFile === 'application/pdf'
    ? indirizzo
    : URL.createObjectURL(new Blob([`<!doctype html><title>${esc(allegato.nomeFile)}</title>
        <style>@page{margin:10mm}html,body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:auto}</style>
        <img src="${indirizzo}">`], { type: 'text/html' }));
  document.body.append(cornice);

  cornice.onload = () => {
    setTimeout(() => {
      try {
        cornice.contentWindow.focus();
        cornice.contentWindow.print();
      } catch {
        apriAllegato(allegato);
        avvisoStampa();
      }
      setTimeout(() => cornice.remove(), 60000);
    }, 300);
  };
}

function avvisoStampa() {
  alert('Il file si è aperto in una nuova scheda: premi Ctrl+P (sul Mac Cmd+P) per stamparlo.');
}

function formattaDimensione(byte) {
  return byte > 1048576 ? `${(byte / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(byte / 1024))} KB`;
}


/* ======================================================================
   4. IL RIQUADRO "DOCUMENTI CARICATI" (schede mezzo e autista)
   ====================================================================== */

const ICONA_PDF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>';
const ICONA_IMMAGINE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg>';

// Una riga dell'elenco file, con i suoi pulsanti. Usata anche dalla modulistica.
function rigaAllegato(a, titolo) {
  return `
    <li class="allegato" data-id-allegato="${a.id}">
      <span class="icona-file">${a.tipoFile === 'application/pdf' ? ICONA_PDF : ICONA_IMMAGINE}</span>
      <span class="info-file">
        <strong>${esc(titolo || a.categoria)}</strong>
        <span class="tenue">${esc(a.nomeFile)}, ${formattaDimensione(a.dimensione)}, caricato il ${formattaData(a.caricato)}</span>
      </span>
      <span class="azioni-file">
        <button type="button" class="secondario piccolo" data-azione-file="apri">Apri</button>
        <button type="button" class="secondario piccolo" data-azione-file="stampa">Stampa</button>
        <button type="button" class="secondario piccolo" data-azione-file="scarica">Scarica</button>
        <button type="button" class="secondario piccolo pericolo" data-azione-file="elimina" aria-label="Elimina ${esc(a.nomeFile)}">✕</button>
      </span>
    </li>`;
}

// Un solo ascoltatore per i pulsanti di tutti gli elenchi di file della pagina
document.addEventListener('click', async evento => {
  const pulsante = evento.target.closest('[data-azione-file]');
  if (!pulsante) return;
  const allegato = dati.allegati.find(a => a.id === pulsante.closest('[data-id-allegato]').dataset.idAllegato);
  if (!allegato) return;

  const azione = pulsante.dataset.azioneFile;
  if (azione === 'apri') apriAllegato(allegato);
  if (azione === 'stampa') stampaAllegato(allegato);
  if (azione === 'scarica') scaricaAllegato(allegato);
  if (azione === 'elimina' && confirm(`Eliminare "${allegato.nomeFile}"?`)) {
    await eliminaAllegato(allegato);
    document.dispatchEvent(new CustomEvent('allegati-cambiati'));
  }
});

// Disegna dentro "contenitore" l'elenco dei file di un mezzo o autista, con il modulo per caricarne altri
function sezioneAllegati(contenitore, tipo, id) {
  function disegna() {
    const elenco = allegatiDi(tipo, id)
      .sort((a, b) => CATEGORIE_ALLEGATI[tipo].indexOf(a.categoria) - CATEGORIE_ALLEGATI[tipo].indexOf(b.categoria));

    contenitore.innerHTML = `
      ${elenco.length ? `<ul class="elenco-allegati">${elenco.map(a => rigaAllegato(a)).join('')}</ul>`
                      : '<p class="tenue">Nessun documento caricato.</p>'}
      <div class="carica-allegato">
        <select aria-label="Tipo di documento">
          ${CATEGORIE_ALLEGATI[tipo].map(c => `<option>${esc(c)}</option>`).join('')}
        </select>
        <label class="bottone secondario">Carica PDF o foto
          <input type="file" accept="application/pdf,image/*" hidden>
        </label>
      </div>`;

    contenitore.querySelector('input[type=file]').addEventListener('change', async evento => {
      const file = evento.target.files[0];
      if (!file) return;
      contenitore.classList.add('in-caricamento');
      try {
        await aggiungiAllegato({ tipo, id }, contenitore.querySelector('select').value, file);
      } catch (errore) {
        alert(errore.message);
      }
      contenitore.classList.remove('in-caricamento');
      // avvisa il resto dell'app (es. il numero sul pulsante "Documenti" nelle tabelle); ridisegna anche questo elenco
      document.dispatchEvent(new CustomEvent('allegati-cambiati'));
    });
  }

  // Quando i file cambiano, ridisegniamo l'elenco. Ma lo stesso contenitore (es. nel modulo Modifica)
  // viene riusato per mezzi diversi: segniamo di chi è adesso, e il vecchio ascoltatore si ritira da solo.
  const chiave = `${tipo}:${id}:${nuovoId()}`;
  contenitore.dataset.mostra = chiave;
  const aggiorna = () => {
    if (contenitore.isConnected && contenitore.dataset.mostra === chiave) disegna();
    else document.removeEventListener('allegati-cambiati', aggiorna);
  };
  document.addEventListener('allegati-cambiati', aggiorna);
  disegna();
}


/* ======================================================================
   5. BACKUP — i file viaggiano nel backup come testo (base64), come le foto
   ====================================================================== */

async function tuttiGliAllegati() {
  const risultato = {};
  for (const a of dati.allegati) {
    const blob = await leggiFileAllegato(a.id);
    if (blob) risultato[a.id] = await blobInTesto(blob);
  }
  return risultato;
}

async function ripristinaAllegati(file) {
  for (const [id, testo] of Object.entries(file || {})) {
    await salvaFileAllegato(id, await (await fetch(testo)).blob());
  }
}
