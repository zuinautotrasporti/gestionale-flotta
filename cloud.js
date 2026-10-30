/*
  cloud.js — IL COLLEGAMENTO AL DATABASE (Supabase).

  Idea di fondo: l'app continua a lavorare sui dati in memoria ("dati") e sulla copia nel browser,
  come prima. Questo file si occupa di tenere il database allineato:

    1. ACCESSO        → schermata di login, uscita, password dimenticata
    2. SINCRONIZZARE  → ogni volta che salvi, manda al database SOLO le cose cambiate
    3. SCARICARE      → all'avvio e quando riapri l'app, prende le novità dagli altri dispositivi
    4. FILE           → foto e documenti nell'archivio privato "file"

  Senza rete l'app funziona lo stesso: le modifiche restano nel browser e partono appena torna la connessione.

  Ogni cosa salvata è una riga della tabella "record": (collezione, id) → dati.
  Per sapere cosa è cambiato teniamo "allineato": per ogni riga, com'era l'ultima volta
  che il database e questo dispositivo erano d'accordo.
*/

// Queste due informazioni sono pubbliche per natura: la protezione la fanno le regole del database
const SUPABASE_URL = 'https://akuacielimwfrpinhkvl.supabase.co';
const SUPABASE_CHIAVE = 'sb_publishable_cplad-BKlIMCW12cI2FSJw_1gHwWgIP';

const CHIAVE_ALLINEATO = 'gestionale-flotta-allineato';
const COLLEZIONI = ['mezzi', 'autisti', 'tratte', 'carte', 'allegati'];

let db = null;              // il "client" Supabase
let utente = null;          // l'utente collegato (null = nessuno)


/* ======================================================================
   0. STATO VISIBILE (in alto nel menu)
   ====================================================================== */

// Un errore di rete (niente segnale) non è un vero errore: le modifiche aspettano e ripartono
function eProblemaDiRete(errore) {
  return !navigator.onLine || /failed to fetch|network|load failed|fetch failed|timeout/i.test(errore?.message || '');
}

const MESSAGGI_STATO = {
  ok: 'Dati salvati sul database',
  attesa: 'Modifiche da salvare…',
  salvataggio: 'Salvataggio…',
  offline: 'Senza connessione: salvo appena torna la rete',
  errore: 'Errore di salvataggio',
  locale: 'Non collegato al database',
};

function mostraStatoSync(stato, dettaglio) {
  document.querySelectorAll('.stato-sync').forEach(el => {
    el.dataset.stato = stato;
    el.textContent = MESSAGGI_STATO[stato];
    el.title = dettaglio || '';
  });
}


/* ======================================================================
   1. DALL'APP ALLE RIGHE DEL DATABASE (e ritorno)
   ====================================================================== */

// Le impostazioni viaggiano tutte, tranne la chiave HERE che resta solo su ogni dispositivo
function impostazioniDaCondividere() {
  const { apiKey, ...resto } = impostazioni;
  return resto;
}

// Tutto ciò che va sul database, come elenco di righe: Map "collezione|id" → { collezione, id, oggetto }
function righeLocali() {
  const righe = new Map();
  for (const collezione of COLLEZIONI) {
    for (const oggetto of dati[collezione] || []) righe.set(`${collezione}|${oggetto.id}`, { collezione, id: oggetto.id, oggetto });
  }
  righe.set('contatti|azienda', { collezione: 'contatti', id: 'azienda', oggetto: dati.contatti || {} });
  righe.set('impostazioni|generali', { collezione: 'impostazioni', id: 'generali', oggetto: impostazioniDaCondividere() });
  return righe;
}

// Rimette insieme "dati" a partire da un elenco di righe
function datiDaRighe(righe) {
  const nuovi = { mezzi: [], autisti: [], tratte: [], carte: [], allegati: [], contatti: {} };
  let impostazioniCondivise = null;
  for (const { collezione, oggetto } of righe.values()) {
    if (COLLEZIONI.includes(collezione)) nuovi[collezione].push(oggetto);
    else if (collezione === 'contatti') nuovi.contatti = oggetto;
    else if (collezione === 'impostazioni') impostazioniCondivise = oggetto;
  }
  return { dati: normalizzaDati(nuovi), impostazioniCondivise };
}

// "Impronta" di un oggetto: lo stesso testo se e solo se il contenuto è uguale.
// Ordiniamo le chiavi perché il database potrebbe restituirle in un altro ordine.
function impronta(valore) {
  if (Array.isArray(valore)) return '[' + valore.map(impronta).join(',') + ']';
  if (valore && typeof valore === 'object') {
    return '{' + Object.keys(valore).sort().map(k => JSON.stringify(k) + ':' + impronta(valore[k])).join(',') + '}';
  }
  return JSON.stringify(valore ?? null);
}

function leggiAllineato() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_ALLINEATO) || 'null'); } catch { return null; }
}
function scriviAllineato(mappa) {
  localStorage.setItem(CHIAVE_ALLINEATO, JSON.stringify(mappa));
}


/* ======================================================================
   2. SINCRONIZZARE: mandare le modifiche
   ====================================================================== */

let attesaSync = null, sincronizzazioneInCorso = false, daRifare = false, avvisatoNonAutorizzato = false;

// Chiamata da salvaDati() (app.js) e dal salvataggio delle impostazioni: aspettiamo 1 secondo
// che tu abbia finito di scrivere, poi mandiamo tutto in un colpo solo
function segnaleCambiamento() {
  if (!utente) return;
  mostraStatoSync('attesa');
  clearTimeout(attesaSync);
  attesaSync = setTimeout(sincronizza, 1000);
}

async function sincronizza() {
  if (!utente) return;
  if (sincronizzazioneInCorso) { daRifare = true; return; }
  sincronizzazioneInCorso = true;
  mostraStatoSync('salvataggio');

  try {
    const allineato = leggiAllineato() || {};
    const locali = righeLocali();

    // Cosa è cambiato rispetto all'ultimo allineamento?
    const daSalvare = [];
    for (const [chiave, riga] of locali) {
      const im = impronta(riga.oggetto);
      if (allineato[chiave] !== im) daSalvare.push({ chiave, im, riga });
    }
    const daEliminare = Object.keys(allineato).filter(chiave => !locali.has(chiave));

    if (daSalvare.length) {
      const adesso = new Date().toISOString();
      const { error } = await db.from('record').upsert(daSalvare.map(({ riga }) => ({
        collezione: riga.collezione, id: riga.id, dati: riga.oggetto, aggiornato: adesso,
      })));
      if (error) throw error;
      daSalvare.forEach(({ chiave, im }) => { allineato[chiave] = im; });
    }

    for (const chiave of daEliminare) {
      const [collezione, id] = chiave.split('|');
      const { error } = await db.from('record').delete().eq('collezione', collezione).eq('id', id);
      if (error) throw error;
      delete allineato[chiave];
    }

    scriviAllineato(allineato);
    await caricaFileInSospeso();
    mostraStatoSync(fileInSospeso().length ? 'attesa' : 'ok');
  } catch (errore) {
    console.error('Sincronizzazione non riuscita:', errore);
    if (/row-level security|permission denied/i.test(errore.message || '')) {
      // Login fatto, ma l'email non è nella lista "autorizzati" del database
      mostraStatoSync('errore', 'Email non autorizzata: va aggiunta alla tabella "autorizzati" in Supabase.');
      if (!avvisatoNonAutorizzato) {
        avvisatoNonAutorizzato = true;
        alert(`L'email ${utente.email} non è tra gli utenti autorizzati del database.\n` +
              'In Supabase apri SQL Editor ed esegui:\n\n' +
              `insert into public.autorizzati (email) values ('${utente.email}');`);
      }
      sincronizzazioneInCorso = false;
      return;
    }
    mostraStatoSync(eProblemaDiRete(errore) ? 'offline' : 'errore', errore.message);
    clearTimeout(attesaSync);
    attesaSync = setTimeout(sincronizza, 15000);           // riproviamo tra 15 secondi
  } finally {
    sincronizzazioneInCorso = false;
    if (daRifare) { daRifare = false; sincronizza(); }
  }
}


/* ======================================================================
   3. SCARICARE: prendere le novità dal database
   ====================================================================== */

async function righeDalDatabase() {
  const righe = new Map();
  const PAGINA = 1000;                                       // il database ne restituisce al massimo 1000 per volta
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db.from('record').select('collezione,id,dati').range(da, da + PAGINA - 1);
    if (error) throw error;
    for (const r of data) righe.set(`${r.collezione}|${r.id}`, { collezione: r.collezione, id: r.id, oggetto: r.dati });
    if (data.length < PAGINA) break;
  }
  return righe;
}

// Unisce database e dispositivo, riga per riga:
//   - se su QUESTO dispositivo la riga è cambiata dall'ultimo allineamento (modifica fatta offline) → vince il dispositivo
//   - altrimenti vince il database (es. una modifica fatta dal telefono)
function unisci(remote, locali, allineato) {
  const risultato = new Map();
  const tutte = new Set([...remote.keys(), ...locali.keys()]);
  for (const chiave of tutte) {
    const locale = locali.get(chiave);
    const modificataQui = allineato[chiave] !== (locale ? impronta(locale.oggetto) : undefined);
    const scelta = modificataQui ? locale : remote.get(chiave);
    if (scelta) risultato.set(chiave, scelta);
  }
  return risultato;
}

function applicaDati(nuovi, impostazioniCondivise) {
  dati = nuovi;
  localStorage.setItem(CHIAVE_SALVATAGGIO, JSON.stringify(dati));   // copia nel browser, per lavorare anche offline
  if (impostazioniCondivise) {
    impostazioni = { ...IMPOSTAZIONI_PREDEFINITE, ...impostazioniCondivise, apiKey: impostazioni.apiKey };
    localStorage.setItem(CHIAVE_IMPOSTAZIONI, JSON.stringify(impostazioni));
    mostraImpostazioni();
    mostraNomeAzienda();
    aggiornaContatore();
  }
  aggiornaTutto();
}

function quantiDatiLocali() {
  return dati.mezzi.length + dati.autisti.length + dati.tratte.length + dati.carte.length + dati.allegati.length;
}

let ultimoScaricamento = 0;

async function scaricaEUnisci() {
  if (!utente) return;
  ultimoScaricamento = Date.now();
  try {
    const remote = await righeDalDatabase();
    const allineato = leggiAllineato();
    const locali = righeLocali();
    const remotoVuoto = ![...remote.keys()].some(k => !k.startsWith('contatti|') && !k.startsWith('impostazioni|'));

    if (allineato === null) {
      // Primo collegamento di questo dispositivo
      if (remotoVuoto && quantiDatiLocali() > 0) {
        if (confirm(`Il database è vuoto. Carico i dati di questo dispositivo?\n\n` +
            `${dati.mezzi.length} mezzi, ${dati.autisti.length} autisti, ${dati.tratte.length} tratte, ` +
            `${dati.carte.length} carte e ${dati.allegati.length} documenti (più le foto).`)) {
          scriviAllineato({});                                // niente è allineato: tutto verrà caricato
          aggiungiTuttiIFileInSospeso();
          return sincronizza();
        }
      } else if (!remotoVuoto && quantiDatiLocali() > 0) {
        alert('Su questo dispositivo uso i dati del database. Quelli che c\'erano qui vengono sostituiti ' +
              '(se ti servono, li trovi ancora nel tuo ultimo backup).');
      }
      const { dati: nuovi, impostazioniCondivise } = datiDaRighe(remote);
      applicaDati(nuovi, impostazioniCondivise);
      scriviAllineato(Object.fromEntries([...remote].map(([k, r]) => [k, impronta(r.oggetto)])));
      // Le righe "di servizio" (contatti, impostazioni) se mancano vanno create
      return sincronizza();
    }

    // Dispositivo già collegato: uniamo
    const unite = unisci(remote, locali, allineato);
    const { dati: nuovi, impostazioniCondivise } = datiDaRighe(unite);
    applicaDati(nuovi, impostazioniCondivise);
    // Ora "allineato" = com'è il database; le modifiche fatte qui risulteranno diverse e partiranno
    scriviAllineato(Object.fromEntries([...remote].map(([k, r]) => [k, impronta(r.oggetto)])));
    return sincronizza();
  } catch (errore) {
    console.error('Scaricamento non riuscito:', errore);
    mostraStatoSync(eProblemaDiRete(errore) ? 'offline' : 'errore', errore.message);
  }
}

// Quando torni sull'app (dal telefono o da un'altra scheda) prendiamo le novità, al massimo ogni 30 secondi
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - ultimoScaricamento > 30000) scaricaEUnisci();
});
window.addEventListener('online', () => scaricaEUnisci());
window.addEventListener('offline', () => utente && mostraStatoSync('offline'));


/* ======================================================================
   4. FILE: foto e documenti nell'archivio "file"
   ====================================================================== */

// Percorsi nell'archivio: "foto/<id mezzo>" e "allegati/<id allegato>"
const CHIAVE_FILE_IN_SOSPESO = 'gestionale-flotta-file-in-sospeso';

function fileInSospeso() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_FILE_IN_SOSPESO) || '[]'); } catch { return []; }
}
function segnaFileInSospeso(percorso, aggiungi) {
  const elenco = new Set(fileInSospeso());
  aggiungi ? elenco.add(percorso) : elenco.delete(percorso);
  localStorage.setItem(CHIAVE_FILE_IN_SOSPESO, JSON.stringify([...elenco]));
}

// Chiamata da foto.js e allegati.js dopo aver salvato un file nel browser
async function cloudCaricaFile(percorso, blob) {
  if (!utente) return;
  segnaFileInSospeso(percorso, true);
  try {
    const { error } = await db.storage.from('file').upload(percorso, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    segnaFileInSospeso(percorso, false);
  } catch (errore) {
    console.error('Caricamento file non riuscito, riprovo più tardi:', percorso, errore);
    segnaleCambiamento();
  }
}

async function cloudScaricaFile(percorso) {
  if (!utente) return null;
  try {
    const { data, error } = await db.storage.from('file').download(percorso);
    return error ? null : data;
  } catch {
    return null;
  }
}

// Un indirizzo web temporaneo (10 minuti) per aprire un file con il lettore del telefono
async function cloudIndirizzoFirmato(percorso) {
  if (!utente) return null;
  try {
    const { data, error } = await db.storage.from('file').createSignedUrl(percorso, 600);
    return error ? null : data.signedUrl;
  } catch {
    return null;
  }
}

async function cloudEliminaFile(percorso) {
  if (!utente) return;
  segnaFileInSospeso(percorso, false);
  try { await db.storage.from('file').remove([percorso]); } catch (errore) { console.error(errore); }
}

// File caricati quando non c'era rete: li mandiamo adesso (li leggiamo dalla copia nel browser)
async function caricaFileInSospeso() {
  for (const percorso of fileInSospeso()) {
    const [cartella, id] = percorso.split('/');
    const blob = cartella === 'foto' ? await leggiFotoLocale(id) : await leggiFileAllegatoLocale(id);
    if (!blob) { segnaFileInSospeso(percorso, false); continue; }
    const { error } = await db.storage.from('file').upload(percorso, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    segnaFileInSospeso(percorso, false);
  }
}

// Al primo caricamento: tutte le foto e tutti i documenti di questo dispositivo vanno sul database
function aggiungiTuttiIFileInSospeso() {
  dati.mezzi.forEach(m => segnaFileInSospeso(`foto/${m.id}`, true));
  dati.allegati.forEach(a => segnaFileInSospeso(`allegati/${a.id}`, true));
}


/* ======================================================================
   5. ACCESSO: login, uscita, password dimenticata
   ====================================================================== */

const schermataAccesso = document.getElementById('accesso');
const formAccesso = document.getElementById('form-accesso');
const esitoAccesso = document.getElementById('esito-accesso');

function mostraAccesso(modo) {
  // modo: 'login' | 'nuova-password'
  schermataAccesso.hidden = false;
  schermataAccesso.dataset.modo = modo;
  esitoAccesso.textContent = '';
  formAccesso.reset();
  // I campi nascosti non devono essere "obbligatori", altrimenti il browser blocca l'invio senza dire perché
  formAccesso.elements.email.required = formAccesso.elements.password.required = modo === 'login';
  formAccesso.elements.nuovaPassword.required = modo === 'nuova-password';
  (modo === 'login' ? formAccesso.elements.email : formAccesso.elements.nuovaPassword).focus();
}

function nascondiAccesso() {
  schermataAccesso.hidden = true;
}

// Traduzione dei messaggi di errore più comuni di Supabase
function messaggioErrore(errore) {
  const testo = errore?.message || String(errore);
  if (/invalid login credentials/i.test(testo)) return 'Email o password non corrette.';
  if (/email not confirmed/i.test(testo)) return 'Devi prima confermare l\'email: controlla la posta.';
  if (/failed to fetch|network/i.test(testo)) return 'Nessuna connessione: controlla internet e riprova.';
  if (/password should be at least/i.test(testo)) return 'La password deve avere almeno 6 caratteri.';
  return testo;
}

formAccesso.addEventListener('submit', async evento => {
  evento.preventDefault();
  const campi = formAccesso.elements;
  const pulsante = formAccesso.querySelector('button[type=submit]:not([hidden])');
  esitoAccesso.textContent = '';
  pulsante.disabled = true;
  try {
    if (schermataAccesso.dataset.modo === 'nuova-password') {
      const { error } = await db.auth.updateUser({ password: campi.nuovaPassword.value });
      if (error) throw error;
      history.replaceState(null, '', location.pathname);   // togliamo il codice di recupero dall'indirizzo
      await dopoAccesso();
    } else {
      const { data, error } = await db.auth.signInWithPassword({
        email: campi.email.value.trim(), password: campi.password.value,
      });
      if (error) throw error;
      utente = data.user;
      await dopoAccesso();
    }
  } catch (errore) {
    esitoAccesso.textContent = messaggioErrore(errore);
  }
  pulsante.disabled = false;
});

document.getElementById('btn-password-dimenticata').addEventListener('click', async () => {
  const email = formAccesso.elements.email.value.trim();
  if (!email) { esitoAccesso.textContent = 'Scrivi prima la tua email qui sopra.'; return; }
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  esitoAccesso.textContent = error ? messaggioErrore(error)
    : 'Ti ho mandato un\'email con il link per scegliere una nuova password.';
});

async function dopoAccesso() {
  const { data } = await db.auth.getUser();
  utente = data?.user || utente;

  // L'account esiste, ma è nella lista degli autorizzati? Lo chiediamo al database.
  // (Se non c'è rete la risposta non arriva: andiamo avanti con la copia nel browser.)
  const { data: autorizzato, error } = await db.rpc('e_autorizzato');
  if (!error && autorizzato === false) {
    mostraAccesso('login');
    esitoAccesso.textContent = `L'email ${utente.email} non è tra gli utenti autorizzati. ` +
      'Va aggiunta alla tabella "autorizzati" in Supabase.';
    await db.auth.signOut();
    utente = null;
    return;
  }

  nascondiAccesso();
  document.getElementById('utente-collegato').textContent = utente?.email || '';
  document.getElementById('pannello-account').hidden = false;
  await scaricaEUnisci();
}

// Quante modifiche non sono ancora arrivate al database?
function modificheInSospeso() {
  const allineato = leggiAllineato() || {};
  const locali = righeLocali();
  let quante = Object.keys(allineato).filter(k => !locali.has(k)).length;
  for (const [chiave, riga] of locali) if (allineato[chiave] !== impronta(riga.oggetto)) quante++;
  return quante + fileInSospeso().length;
}

document.getElementById('btn-esci').addEventListener('click', async () => {
  const inSospeso = modificheInSospeso();
  if (inSospeso && !confirm(`${inSospeso} modifiche non sono ancora sul database (manca la connessione?) e andrebbero perse. Uscire lo stesso?`)) return;
  if (!inSospeso && !confirm('Uscire? Su questo dispositivo i dati vengono tolti; li ritrovi rientrando.')) return;
  await db.auth.signOut();
  // Per riservatezza togliamo dal browser i dati e la copia dei file
  [CHIAVE_SALVATAGGIO, CHIAVE_ALLINEATO, CHIAVE_FILE_IN_SOSPESO].forEach(k => localStorage.removeItem(k));
  indexedDB.deleteDatabase('gestionale-flotta-foto');
  indexedDB.deleteDatabase('gestionale-flotta-allegati');
  location.reload();
});


/* ======================================================================
   6. AVVIO
   ====================================================================== */

async function avviaCloud() {
  if (!window.supabase?.createClient) {
    // La libreria non si è caricata (niente internet al primo avvio): si lavora sulla copia del browser
    console.warn('Libreria Supabase non disponibile: lavoro solo nel browser.');
    nascondiAccesso();
    mostraStatoSync('locale');
    return;
  }

  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHIAVE, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // Arrivati dal link "password dimenticata"
  db.auth.onAuthStateChange(evento => {
    if (evento === 'PASSWORD_RECOVERY') mostraAccesso('nuova-password');
  });

  const { data } = await db.auth.getSession();
  if (data?.session && !/type=recovery/.test(location.hash)) {
    utente = data.session.user;
    await dopoAccesso();
  } else if (!/type=recovery/.test(location.hash)) {
    mostraAccesso('login');
  }
}

avviaCloud();
