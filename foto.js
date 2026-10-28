/*
  foto.js — LE FOTO DEI MEZZI.

  Le foto sono troppo grandi per localStorage (circa 5 MB in tutto), quindi le teniamo in IndexedDB:
  un archivio del browser pensato per i file, che regge centinaia di MB.
  Ogni foto è salvata con l'id del mezzo come chiave.

  IndexedDB è "asincrono": ogni operazione restituisce una Promise, e noi la aspettiamo con await.
  La funzione richiesta() trasforma il vecchio stile a eventi di IndexedDB in una Promise.
*/

const NOME_ARCHIVIO_FOTO = 'gestionale-flotta-foto';
const LATO_MASSIMO = 1600;          // pixel: abbastanza per riconoscere il mezzo, poco peso
const QUALITA_JPEG = 0.82;

let archivioFoto = null;

function richiesta(req) {
  return new Promise((risolvi, rifiuta) => {
    req.onsuccess = () => risolvi(req.result);
    req.onerror = () => rifiuta(req.error);
  });
}

// Apre l'archivio (la prima volta lo crea)
async function apriArchivioFoto() {
  if (archivioFoto) return archivioFoto;
  const req = indexedDB.open(NOME_ARCHIVIO_FOTO, 1);
  req.onupgradeneeded = () => req.result.createObjectStore('foto');
  archivioFoto = await richiesta(req);
  return archivioFoto;
}

async function contenitoreFoto(modo) {
  const db = await apriArchivioFoto();
  return db.transaction('foto', modo).objectStore('foto');
}

// La copia nel browser (IndexedDB) fa da "magazzino veloce"; il database (cloud.js) è l'archivio vero.
async function leggiFotoLocale(idMezzo) {
  return richiesta((await contenitoreFoto('readonly')).get(idMezzo));     // un Blob, oppure undefined
}

async function leggiFoto(idMezzo) {
  const locale = await leggiFotoLocale(idMezzo);
  if (locale) return locale;
  // Non è in questo browser (es. caricata dal telefono): la prendiamo dal database e la teniamo
  const remota = typeof cloudScaricaFile === 'function' ? await cloudScaricaFile(`foto/${idMezzo}`) : null;
  if (remota) await richiesta((await contenitoreFoto('readwrite')).put(remota, idMezzo));
  return remota || undefined;
}

async function salvaFoto(idMezzo, blob) {
  await richiesta((await contenitoreFoto('readwrite')).put(blob, idMezzo));
  if (typeof cloudCaricaFile === 'function') cloudCaricaFile(`foto/${idMezzo}`, blob);   // senza aspettare
}

async function eliminaFoto(idMezzo) {
  await richiesta((await contenitoreFoto('readwrite')).delete(idMezzo));
  if (typeof cloudEliminaFile === 'function') cloudEliminaFile(`foto/${idMezzo}`);
}


/* ---------- Ridimensionare la foto prima di salvarla ---------- */

async function rimpicciolisciFoto(file) {
  const immagine = await createImageBitmap(file, { imageOrientation: 'from-image' });   // rispetta la rotazione del telefono
  const scala = Math.min(1, LATO_MASSIMO / Math.max(immagine.width, immagine.height));
  const tela = document.createElement('canvas');
  tela.width = Math.round(immagine.width * scala);
  tela.height = Math.round(immagine.height * scala);
  tela.getContext('2d').drawImage(immagine, 0, 0, tela.width, tela.height);
  return new Promise(risolvi => tela.toBlob(risolvi, 'image/jpeg', QUALITA_JPEG));
}


/* ---------- Backup: le foto viaggiano nel file come testo (base64) ---------- */

function blobInTesto(blob) {
  return new Promise(risolvi => {
    const lettore = new FileReader();
    lettore.onload = () => risolvi(lettore.result);       // "data:image/jpeg;base64,...."
    lettore.readAsDataURL(blob);
  });
}

// Restituisce { idMezzo: "data:image/jpeg;base64,..." } per tutti i mezzi che hanno una foto
async function tutteLeFoto() {
  const risultato = {};
  for (const m of dati.mezzi) {
    const blob = await leggiFoto(m.id);
    if (blob) risultato[m.id] = await blobInTesto(blob);
  }
  return risultato;
}

async function ripristinaFoto(foto) {
  for (const [idMezzo, testo] of Object.entries(foto || {})) {
    const blob = await (await fetch(testo)).blob();        // fetch sa leggere anche i "data:" URL
    await salvaFoto(idMezzo, blob);
  }
}


/* ---------- La foto nella scheda del mezzo ---------- */

let indirizzoFotoMostrata = null;   // l'indirizzo temporaneo dell'immagine, da liberare quando cambia

async function mostraFotoScheda(mezzo) {
  const riquadro = document.getElementById('foto-mezzo');
  if (!riquadro) return;

  if (indirizzoFotoMostrata) URL.revokeObjectURL(indirizzoFotoMostrata);
  indirizzoFotoMostrata = null;

  let blob = null;
  try { blob = await leggiFoto(mezzo.id); } catch (errore) { console.error(errore); }

  if (blob) {
    indirizzoFotoMostrata = URL.createObjectURL(blob);
    riquadro.innerHTML = `
      <img src="${indirizzoFotoMostrata}" alt="Foto del mezzo ${esc(mezzo.targa)}" title="Apri la foto a grandezza piena">
      <div class="azioni-foto">
        <label class="bottone secondario piccolo">Cambia foto<input type="file" accept="image/*" hidden></label>
        <button type="button" class="secondario piccolo pericolo" data-togli-foto>Togli foto</button>
      </div>`;
  } else {
    riquadro.innerHTML = `
      <label class="foto-vuota">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>
        <span>Aggiungi una foto del mezzo</span>
        <span class="tenue">Dal telefono puoi scattarla al momento</span>
        <input type="file" accept="image/*" hidden>
      </label>`;
  }

  // Toccando la foto si apre a grandezza piena in una nuova scheda
  riquadro.querySelector('img')?.addEventListener('click', () => window.open(indirizzoFotoMostrata, '_blank'));

  riquadro.querySelector('input[type=file]').addEventListener('change', async evento => {
    const file = evento.target.files[0];
    if (!file) return;
    riquadro.classList.add('in-caricamento');
    try {
      await salvaFoto(mezzo.id, await rimpicciolisciFoto(file));
    } catch (errore) {
      console.error(errore);
      alert('Non sono riuscito a salvare la foto: ' + errore.message);
    }
    riquadro.classList.remove('in-caricamento');
    mostraFotoScheda(mezzo);
  });

  riquadro.querySelector('[data-togli-foto]')?.addEventListener('click', async () => {
    if (!confirm(`Togliere la foto di ${mezzo.targa}?`)) return;
    await eliminaFoto(mezzo.id);
    mostraFotoScheda(mezzo);
  });
}
