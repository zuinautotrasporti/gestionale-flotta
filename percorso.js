/*
  percorso.js — CALCOLO DELLA TRATTA con HERE.

  Qui l'app parla per la prima volta con un servizio esterno attraverso internet (una "API"):
  le mandiamo una domanda sotto forma di indirizzo web (URL) e lei risponde con dati in formato JSON.

  Le parti del file:
    1. IMPOSTAZIONI → chiave HERE, prezzo gasolio, consumi (salvate nel browser)
    2. CONTATORE    → quanti calcoli hai fatto questo mese, con il blocco oltre la soglia
    3. HERE         → le tre chiamate: suggerimenti indirizzo, ricerca indirizzo, percorso
    4. POLYLINE     → decodificare la forma del percorso che HERE manda "compressa"
    5. CONSUMO      → litri in base al carico
    6. MODULO       → menu dei mezzi, suggerimenti mentre scrivi, pulsante Calcola
    7. RISULTATI    → schede dei percorsi e mappa
*/


/* ======================================================================
   1. IMPOSTAZIONI
   ====================================================================== */

const CHIAVE_IMPOSTAZIONI = 'gestionale-flotta-impostazioni';

const IMPOSTAZIONI_PREDEFINITE = {
  nomeAzienda: 'ZUIN AUTOTRASPORTI SRL',
  apiKey: '',
  sogliaMensile: 1500,        // ben sotto i 2.500 calcoli pedaggio gratuiti al mese
  prezzoGasolio: 2.20,        // come nel tuo foglio TRATTE
  kmLitroVuoto: 4.0,
  kmLitroPieno: 3.0,          // come nel tuo foglio TRATTE (3 km/l)
  caricoPieno: 30,
  taraPredefinita: 14,        // trattore + rimorchio, da regolare sui tuoi mezzi
  costoAutistaOra: 22,        // come nel tuo foglio TRATTE
  manutenzioneKm: 0.10,       // da sostituire con la media €/km del tuo foglio COSTI
  iva: 22,
};

function caricaImpostazioni() {
  try {
    return { ...IMPOSTAZIONI_PREDEFINITE, ...JSON.parse(localStorage.getItem(CHIAVE_IMPOSTAZIONI) || '{}') };
  } catch {
    return { ...IMPOSTAZIONI_PREDEFINITE };
  }
}

let impostazioni = caricaImpostazioni();

const formImpostazioni = document.getElementById('form-impostazioni');

function mostraImpostazioni() {
  for (const [nome, valore] of Object.entries(impostazioni)) {
    if (formImpostazioni.elements[nome]) formImpostazioni.elements[nome].value = valore;
  }
}

formImpostazioni.addEventListener('submit', evento => {
  evento.preventDefault();
  const campi = formImpostazioni.elements;
  impostazioni = {
    nomeAzienda: campi.nomeAzienda.value.trim(),
    apiKey: campi.apiKey.value.trim(),
    sogliaMensile: Number(campi.sogliaMensile.value),
    prezzoGasolio: Number(campi.prezzoGasolio.value),
    kmLitroVuoto: Number(campi.kmLitroVuoto.value),
    kmLitroPieno: Number(campi.kmLitroPieno.value),
    caricoPieno: Number(campi.caricoPieno.value),
    taraPredefinita: Number(campi.taraPredefinita.value),
    costoAutistaOra: Number(campi.costoAutistaOra.value),
    manutenzioneKm: Number(campi.manutenzioneKm.value),
    iva: Number(campi.iva.value),
  };
  localStorage.setItem(CHIAVE_IMPOSTAZIONI, JSON.stringify(impostazioni));
  if (typeof segnaleCambiamento === 'function') segnaleCambiamento();   // anche sul database (tranne la chiave HERE)
  document.getElementById('esito-impostazioni').textContent = 'Impostazioni salvate.';
  aggiornaContatore();
  impostaSfondo();                                          // la chiave potrebbe essere cambiata
  if (typeof mostraNomeAzienda === 'function') mostraNomeAzienda();
});


/* ======================================================================
   2. CONTATORE
   ====================================================================== */

// Conta i calcoli di percorso del mese. Ogni calcolo = 1 percorso + 1 pedaggio per HERE.
const CHIAVE_CONTATORE = 'gestionale-flotta-contatore-here';

function meseCorrente() {
  return new Date().toISOString().slice(0, 7);             // "2026-10"
}

function leggiContatore() {
  try {
    const c = JSON.parse(localStorage.getItem(CHIAVE_CONTATORE) || '{}');
    const vuoto = { mese: meseCorrente(), percorsi: 0, ricerche: 0, suggerimenti: 0 };
    // Se è cambiato il mese, si riparte da zero
    return c.mese === meseCorrente() ? { ...vuoto, ...c } : vuoto;
  } catch {
    return { mese: meseCorrente(), percorsi: 0, ricerche: 0, suggerimenti: 0 };
  }
}

function incrementaContatore(campo) {
  const c = leggiContatore();
  c[campo]++;
  localStorage.setItem(CHIAVE_CONTATORE, JSON.stringify(c));
  aggiornaContatore();
}

function aggiornaContatore() {
  const c = leggiContatore();
  document.getElementById('contatore').textContent =
    `Questo mese: ${c.percorsi} calcoli su ${impostazioni.sogliaMensile} consentiti, ` +
    `${c.suggerimenti} suggerimenti su ${LIMITE_SUGGERIMENTI}`;
}

// I suggerimenti mentre scrivi sono gratuiti fino a 5.000 al mese: ci fermiamo prima.
// Oltre il limite si continua a calcolare, solo senza il menu dei suggerimenti.
const LIMITE_SUGGERIMENTI = 4000;


/* ======================================================================
   3. HERE
   ====================================================================== */

// Errore "parlante": contiene il messaggio da mostrare all'utente
class ErroreHere extends Error {}

// Costruisce l'URL, fa la richiesta e controlla la risposta.
// "async" vuol dire che la funzione aspetta la risposta da internet senza bloccare la pagina.
// "voceContatore" dice quale contatore aumentare ('percorsi' o 'ricerche').
async function chiamaHere(indirizzoBase, parametri, voceContatore) {
  if (!impostazioni.apiKey) {
    throw new ErroreHere('Manca la chiave HERE: inseriscila nella scheda "Dati" → Impostazioni percorsi.');
  }
  incrementaContatore(voceContatore);                       // contiamo solo le richieste che partono davvero

  const url = new URL(indirizzoBase);
  for (const [nome, valore] of Object.entries(parametri)) {
    if (valore === undefined) continue;
    // Un parametro può ripetersi (es. più tappe "via"): in quel caso passiamo un array
    if (Array.isArray(valore)) valore.forEach(v => url.searchParams.append(nome, v));
    else url.searchParams.set(nome, valore);
  }
  url.searchParams.set('apiKey', impostazioni.apiKey);

  let risposta;
  try {
    risposta = await fetch(url);
  } catch {
    throw new ErroreHere('Impossibile contattare HERE. Controlla la connessione a internet.');
  }

  const corpo = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    // HERE spiega l'errore nei campi title / cause / action
    const dettagli = [corpo.title, corpo.cause, corpo.action].filter(Boolean).join(' — ');
    if (risposta.status === 401 || risposta.status === 403) {
      throw new ErroreHere(`HERE ha rifiutato la chiave (errore ${risposta.status}). Controlla di averla copiata tutta. ${dettagli}`);
    }
    throw new ErroreHere(`HERE ha risposto con un errore ${risposta.status}: ${dettagli || 'nessun dettaglio'}`);
  }
  return corpo;
}

// Coordinate di partenza per orientare i suggerimenti (zona di Novara)
const ZONA_DI_LAVORO = '45.6,8.4';

// Etichetta leggibile con la sigla della provincia, per distinguere i paesi con lo stesso nome:
// "Boffalora, Calco, Lombardia, Italia" → "Boffalora, Calco (LC)"
function etichettaIndirizzo(risultato) {
  const a = risultato.address || {};
  const parti = [a.street && `${a.street}${a.houseNumber ? ' ' + a.houseNumber : ''}`, a.district, a.city]
    .filter(Boolean)
    .filter((parte, i, tutte) => tutte.indexOf(parte) === i);   // niente doppioni
  if (!parti.length) return a.label || risultato.title;
  return parti.join(', ') + (a.countyCode ? ` (${a.countyCode})` : a.countryName ? ` – ${a.countryName}` : '');
}

// Suggerimenti mentre scrivi: restituisce [{ etichetta, lat, lng }]
async function suggerimentiIndirizzo(testo) {
  if (leggiContatore().suggerimenti >= LIMITE_SUGGERIMENTI) return [];
  const corpo = await chiamaHere('https://autosuggest.search.hereapi.com/v1/autosuggest', {
    q: testo, at: ZONA_DI_LAVORO, lang: 'it', limit: 6,
  }, 'suggerimenti');
  return (corpo.items || [])
    .filter(i => i.position)                                // solo risultati con coordinate
    .map(i => ({ etichetta: etichettaIndirizzo(i), lat: i.position.lat, lng: i.position.lng }));
}

// Ricerca di un indirizzo scritto a mano (se non hai scelto un suggerimento)
async function cercaIndirizzo(testo) {
  const corpo = await chiamaHere('https://geocode.search.hereapi.com/v1/geocode', {
    q: testo, at: ZONA_DI_LAVORO, lang: 'it', limit: 1,
  }, 'ricerche');
  const primo = corpo.items?.[0];
  if (!primo) throw new ErroreHere(`Non trovo l'indirizzo "${testo}". Prova a scriverlo in modo più completo.`);
  return { etichetta: etichettaIndirizzo(primo), lat: primo.position.lat, lng: primo.position.lng };
}

// Il calcolo vero: percorso per camion con pedaggi. Restituisce fino a 3 alternative.
async function calcolaPercorsi(partenza, arrivo, veicolo, tappe = []) {
  const soglia = impostazioni.sogliaMensile;
  if (leggiContatore().percorsi >= soglia) {
    throw new ErroreHere(`Hai raggiunto il limite di ${soglia} calcoli per questo mese. ` +
      'Puoi alzarlo nelle impostazioni, ma ricorda che oltre 2.500 al mese HERE inizia a far pagare i pedaggi.');
  }

  const corpo = await chiamaHere('https://router.hereapi.com/v8/routes', {
    transportMode: 'truck',
    origin: `${partenza.lat},${partenza.lng}`,
    destination: `${arrivo.lat},${arrivo.lng}`,
    // Tappe: "!passThrough=true" dice a HERE che il camion ci passa senza fermarsi
    via: tappe.map(t => `${t.lat},${t.lng}!passThrough=true`),
    return: 'summary,polyline,tolls',
    // Con le tappe chiediamo un solo percorso: la strada l'hai già decisa tu
    alternatives: tappe.length ? undefined : 2,             // altrimenti il migliore + 2 alternative
    currency: 'EUR',
    'tolls[summaries]': 'total',                            // vogliamo il totale dei pedaggi
    lang: 'it-IT',
    // HERE vuole il peso in kg e le misure in centimetri, numeri interi
    'vehicle[grossWeight]': Math.round(veicolo.pesoTotale * 1000),
    'vehicle[axleCount]': veicolo.assi,
    'vehicle[trailerCount]': 1,
    'vehicle[height]': Math.round(veicolo.altezza * 100),
    'vehicle[width]': Math.round(veicolo.larghezza * 100),
    'vehicle[length]': Math.round(veicolo.lunghezza * 100),
  }, 'percorsi');

  if (!corpo.routes?.length) {
    const motivo = corpo.notices?.map(n => n.title).join('; ');
    throw new ErroreHere('HERE non ha trovato un percorso adatto a questo camion. ' + (motivo || ''));
  }

  return corpo.routes.map(leggiPercorso);
}

// HERE scrive gli avvisi in inglese: traduciamo i più comuni (gli altri restano come arrivano)
const AVVISI_HERE = {
  violatedVehicleRestriction:
    'Il percorso usa una strada vietata a questo camion (peso, altezza, larghezza o divieto di transito). ' +
    'Succede quasi sempre nell\'ultimo tratto vicino a partenza o arrivo: controlla che l\'indirizzo sia quello giusto ' +
    'e, se lo è, che il punto sia raggiungibile (es. ingresso dello stabilimento).',
  violatedBlockedRoad: 'Il percorso passa su una strada chiusa.',
  violatedZoneRestriction: 'Il percorso attraversa una zona a traffico limitato.',
  violatedTimeDependentRestriction: 'Il percorso usa una strada con divieti in certi orari: verifica l\'orario di passaggio.',
  violatedAvoidTollRoad: 'Il percorso usa strade a pedaggio.',
  violatedCarpool: 'Il percorso usa corsie riservate.',
};

// Trasforma un percorso di HERE in un oggetto semplice per l'app
function leggiPercorso(route) {
  let metri = 0, secondi = 0, pedaggio = 0, pedaggioNoto = true, violaDivieti = false;
  const punti = [];
  const avvisi = [];
  const perGestore = {};                                    // { "Autostrade per l'Italia": 23.4, ... }

  // Un percorso è diviso in "sezioni": sommiamo i valori di tutte
  for (const sezione of route.sections) {
    metri += sezione.summary.length;
    secondi += sezione.summary.duration;

    const totale = sezione.summary.tolls?.total;
    if (totale) {
      pedaggio += totale.value;
    } else if (sezione.tolls?.length) {
      // Se manca il totale, sommiamo una tariffa per ogni casello
      for (const casello of sezione.tolls) pedaggio += casello.fares?.[0]?.price?.value ?? 0;
    }
    if (sezione.tolls?.some(t => !t.fares?.length)) pedaggioNoto = false;

    // Dettaglio per gestore autostradale: serve a capire da dove viene il totale.
    // Il nome del gestore sta in sezione.tollSystems; ogni casello lo richiama con un numero (indice).
    for (const casello of sezione.tolls || []) {
      const indici = casello.tollSystems ?? (casello.tollSystemRef !== undefined ? [casello.tollSystemRef] : []);
      const nome = indici.map(i => sezione.tollSystems?.[i]?.name).filter(Boolean).join(' / ')
        || casello.tollSystem || 'Altro';
      perGestore[nome] = (perGestore[nome] || 0) + (casello.fares?.[0]?.price?.value ?? 0);
    }

    // Avvisi importanti, es. "il percorso viola un divieto per questo veicolo"
    for (const n of sezione.notices || []) {
      avvisi.push(AVVISI_HERE[n.code] || n.title || n.code);
      // "critical" o un codice "violated…" = il camion su quel percorso non dovrebbe passare
      if (n.severity === 'critical' || /violated/i.test(n.code || '')) violaDivieti = true;
    }

    punti.push(...decodificaPolyline(sezione.polyline));
  }

  const dettaglioPedaggi = Object.entries(perGestore).map(([gestore, euro]) => ({ gestore, euro }));
  return { km: metri / 1000, secondi, pedaggio, pedaggioNoto, violaDivieti, punti, avvisi, dettaglioPedaggi };
}


/* ======================================================================
   4. POLYLINE
   ====================================================================== */

// HERE manda la forma del percorso come una stringa compressa ("flexible polyline"),
// per esempio "BFoz5xJ67i1B1B7PzIhaxL7Y". Ogni carattere vale 6 bit: 5 di dato e 1 che dice
// "il numero continua nel carattere dopo". I numeri sono le DIFFERENZE rispetto al punto precedente.
function decodificaPolyline(testo) {
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let posizione = 0;

  // Legge un numero intero positivo a lunghezza variabile
  function leggiNumero() {
    let risultato = 0, moltiplicatore = 1, valore;
    do {
      valore = ALFABETO.indexOf(testo[posizione++]);
      if (valore < 0) throw new Error('Polyline non valida');
      risultato += (valore & 0x1f) * moltiplicatore;         // i 5 bit di dato
      moltiplicatore *= 32;
    } while (valore & 0x20);                                 // il sesto bit: "continua"
    return risultato;
  }
  // I numeri con segno sono codificati a zig-zag: 0,-1,1,-2,2 → 0,1,2,3,4
  function leggiConSegno() {
    const n = leggiNumero();
    return n % 2 ? -(n + 1) / 2 : n / 2;
  }

  leggiNumero();                                             // versione del formato
  const intestazione = leggiNumero();
  const precisione = 10 ** (intestazione & 15);
  const terzaDimensione = (intestazione >> 4) & 7;           // es. altitudine: la saltiamo

  const punti = [];
  let lat = 0, lng = 0;
  while (posizione < testo.length) {
    lat += leggiConSegno();
    lng += leggiConSegno();
    if (terzaDimensione) leggiConSegno();
    punti.push([lat / precisione, lng / precisione]);
  }
  return punti;
}


/* ======================================================================
   5. CONSUMO
   ====================================================================== */

// Il consumo cresce con il carico. Interpoliamo in litri/100 km (è lì che il peso pesa
// in modo circa lineare) tra "a vuoto" e "a pieno carico". Oltre il pieno carico si prosegue con la stessa pendenza.
function litriConsumati(km, caricoTonnellate) {
  const l100Vuoto = 100 / impostazioni.kmLitroVuoto;
  const l100Pieno = 100 / impostazioni.kmLitroPieno;
  const frazione = caricoTonnellate / impostazioni.caricoPieno;
  const l100 = l100Vuoto + (l100Pieno - l100Vuoto) * frazione;
  return km * l100 / 100;
}


/* ======================================================================
   6. MODULO
   ====================================================================== */

const formPercorso = document.getElementById('form-percorso');

// Riempie i menu di trattori e rimorchi con i mezzi non venduti né fermi
function riempiMenuMezzi() {
  const campi = formPercorso.elements;
  const utilizzabili = dati.mezzi.filter(m => !STATI_ESCLUSI.includes(m.stato));
  const opzioni = tipo => '<option value="">— nessuno —</option>' + utilizzabili
    .filter(m => m.tipo === tipo)
    .sort((a, b) => a.targa.localeCompare(b.targa))
    .map(m => `<option value="${m.id}">${esc(m.targa)} · ${esc(m.tipo === 'trattore' ? m.marca : m.tipoRimorchio)}</option>`)
    .join('');

  const prima = { trattore: campi.trattore.value, rimorchio: campi.rimorchio.value };
  campi.trattore.innerHTML = opzioni('trattore');
  campi.rimorchio.innerHTML = opzioni('rimorchio');
  campi.trattore.value = prima.trattore;
  campi.rimorchio.value = prima.rimorchio;
}

// Quando scegli i mezzi, le misure si compilano dalle loro schede (se le hai inserite)
function compilaMisure() {
  const campi = formPercorso.elements;
  const trattore = dati.mezzi.find(m => m.id === campi.trattore.value);
  const rimorchio = dati.mezzi.find(m => m.id === campi.rimorchio.value);

  campi.altezza.value = rimorchio?.altezza || trattore?.altezza || 4.00;
  campi.larghezza.value = rimorchio?.larghezza || trattore?.larghezza || 2.55;
  campi.lunghezza.value = 16.50;                            // lunghezza tipica di un autoarticolato
  if (!campi.tara.value) campi.tara.value = impostazioni.taraPredefinita;
}

formPercorso.elements.trattore.addEventListener('change', compilaMisure);
formPercorso.elements.rimorchio.addEventListener('change', compilaMisure);


/* ---------- Suggerimenti mentre scrivi ---------- */

// Per ogni campo indirizzo ricordiamo il punto scelto: { etichetta, lat, lng }.
// La chiave è il nome del campo: 'partenza', 'arrivo', 'tappa-1', 'tappa-2'...
const puntiScelti = { partenza: null, arrivo: null };

function attivaSuggerimenti(input) {
  const nomeCampo = input.name;
  const elenco = document.createElement('ul');
  elenco.className = 'suggerimenti';
  input.after(elenco);

  let attesa = null;

  input.addEventListener('input', () => {
    puntiScelti[nomeCampo] = null;                          // il testo è cambiato: il punto scelto non vale più
    clearTimeout(attesa);
    const testo = input.value.trim();
    if (testo.length < 4) { elenco.innerHTML = ''; return; }

    // "Debounce": aspettiamo che tu smetta di scrivere per mezzo secondo prima di chiedere a HERE,
    // così non facciamo una richiesta per ogni lettera
    attesa = setTimeout(async () => {
      try {
        const risultati = await suggerimentiIndirizzo(testo);
        if (input.value.trim() !== testo) return;           // nel frattempo hai scritto altro
        elenco.innerHTML = '';
        for (const r of risultati) {
          const voce = document.createElement('li');
          voce.textContent = r.etichetta;
          voce.addEventListener('mousedown', evento => {   // mousedown arriva prima che il campo perda il focus
            evento.preventDefault();
            input.value = r.etichetta;
            puntiScelti[nomeCampo] = r;
            elenco.innerHTML = '';
          });
          elenco.append(voce);
        }
      } catch (errore) {
        mostraErrore(errore);
      }
    }, 500);
  });

  input.addEventListener('blur', () => { elenco.innerHTML = ''; });
}

attivaSuggerimenti(formPercorso.elements.partenza);
attivaSuggerimenti(formPercorso.elements.arrivo);


/* ---------- Tappe "Passa da" ---------- */

// Le tappe obbligano HERE a passare da certi punti (es. un casello o un paese sulla strada
// che fanno davvero i tuoi autisti). Il camion non si ferma: ci passa soltanto.
let numeroTappe = 0;

function aggiungiTappa() {
  numeroTappe++;
  const riga = document.createElement('div');
  riga.className = 'riga-tappa';
  riga.innerHTML = `
    <label class="campo-indirizzo">Passa da
      <input name="tappa-${numeroTappe}" placeholder="es. casello Brebemi, Treviglio">
    </label>
    <button type="button" class="secondario" title="Togli tappa">✕</button>`;

  const input = riga.querySelector('input');
  riga.querySelector('button').addEventListener('click', () => {
    delete puntiScelti[input.name];
    riga.remove();
  });

  document.getElementById('tappe').append(riga);
  attivaSuggerimenti(input);
  input.focus();
}

document.getElementById('btn-aggiungi-tappa').addEventListener('click', aggiungiTappa);

// Restituisce le tappe compilate, nell'ordine in cui appaiono
async function leggiTappe() {
  const tappe = [];
  for (const input of document.querySelectorAll('#tappe input')) {
    if (!input.value.trim()) continue;                       // tappa lasciata vuota: la ignoriamo
    const punto = puntiScelti[input.name] || await cercaIndirizzo(input.value);
    input.value = punto.etichetta;
    puntiScelti[input.name] = punto;
    tappe.push(punto);
  }
  return tappe;
}


/* ---------- Pulsante Calcola ---------- */

const esitoPercorso = document.getElementById('esito-percorso');
let ultimoCalcolo = null;

function mostraErrore(errore) {
  console.error(errore);
  esitoPercorso.className = 'esito errore';
  esitoPercorso.textContent = errore instanceof ErroreHere ? errore.message : 'Errore imprevisto: ' + errore.message;
}

formPercorso.addEventListener('submit', async evento => {
  evento.preventDefault();
  const campi = formPercorso.elements;
  const pulsante = document.getElementById('btn-calcola');

  esitoPercorso.className = 'esito';
  esitoPercorso.textContent = '';
  pulsante.disabled = true;
  pulsante.textContent = 'Calcolo in corso…';

  try {
    // Se non hai scelto un suggerimento, cerchiamo l'indirizzo scritto
    const partenza = puntiScelti.partenza || await cercaIndirizzo(campi.partenza.value);
    const arrivo = puntiScelti.arrivo || await cercaIndirizzo(campi.arrivo.value);
    campi.partenza.value = partenza.etichetta;
    campi.arrivo.value = arrivo.etichetta;
    puntiScelti.partenza = partenza;
    puntiScelti.arrivo = arrivo;
    const tappe = await leggiTappe();

    const carico = Number(campi.carico.value);
    const veicolo = {
      pesoTotale: Number(campi.tara.value) + carico,
      assi: Number(campi.assi.value),
      altezza: Number(campi.altezza.value),
      larghezza: Number(campi.larghezza.value),
      lunghezza: Number(campi.lunghezza.value),
    };

    const percorsi = await calcolaPercorsi(partenza, arrivo, veicolo, tappe);

    // Aggiungiamo i costi a ogni percorso
    for (const p of percorsi) {
      p.litri = litriConsumati(p.km, carico);
      p.costoGasolio = p.litri * impostazioni.prezzoGasolio;
      p.costoTotale = p.costoGasolio + p.pedaggio;
    }

    esitoPercorso.textContent =
      `Camion da ${veicolo.pesoTotale.toLocaleString('it-IT')} t, ${veicolo.assi} assi, ` +
      `alto ${veicolo.altezza.toLocaleString('it-IT')} m. Pedaggi IVA inclusa.`;
    // Ci ricordiamo tutto il calcolo: serve se poi premi "Salva tratta"
    const targa = id => dati.mezzi.find(m => m.id === id)?.targa || '';
    ultimoCalcolo = {
      partenza: partenza.etichetta,
      arrivo: arrivo.etichetta,
      tappe: tappe.map(t => t.etichetta),
      trattore: targa(campi.trattore.value),
      rimorchio: targa(campi.rimorchio.value),
      carico,
      percorsi,
    };

    mostraRisultati(percorsi, partenza, arrivo, tappe);
  } catch (errore) {
    mostraErrore(errore);
  } finally {
    // "finally" viene eseguito sempre, sia se è andato bene sia se c'è stato un errore
    pulsante.disabled = false;
    pulsante.textContent = 'Calcola percorso';
  }
});


/* ======================================================================
   7. RISULTATI E MAPPA
   ====================================================================== */

let mappa = null;
let sfondo = null;
let lineeSullaMappa = [];

function creaMappa() {
  if (mappa || typeof L === 'undefined') return;
  mappa = L.map('mappa').setView([45.6, 8.4], 8);
  impostaSfondo();
}

// Lo "sfondo" della mappa è fatto di tante immagini quadrate (tile) di 256×256 pixel.
// Usiamo quelle di HERE: le mappe di OpenStreetMap non si possono usare da un file aperto dal PC.
// HERE ne regala 30.000 al mese; una mappa ne carica qualche decina, quindi non si paga nulla.
function impostaSfondo() {
  if (!mappa) return;
  if (sfondo) mappa.removeLayer(sfondo);
  if (!impostazioni.apiKey) { sfondo = null; return; }      // senza chiave niente sfondo
  sfondo = L.tileLayer(
    'https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=explore.day&size=256&lang=it&apiKey='
      + encodeURIComponent(impostazioni.apiKey),
    { maxZoom: 19, attribution: '© HERE' },
  ).addTo(mappa);
}

const formatoEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const formatoNumero = (n, decimali = 0) => n.toLocaleString('it-IT', { maximumFractionDigits: decimali, minimumFractionDigits: decimali });

function formattaDurata(secondi) {
  const ore = Math.floor(secondi / 3600);
  const minuti = Math.round((secondi % 3600) / 60);
  return `${ore} h ${String(minuti).padStart(2, '0')} min`;
}

function mostraRisultati(percorsi, partenza, arrivo, tappe = []) {
  // Il più economico si sceglie solo tra i percorsi che non violano divieti
  const validi = percorsi.filter(p => !p.violaDivieti);
  const piuEconomico = validi.length
    ? validi.reduce((min, p) => p.costoTotale < min.costoTotale ? p : min)
    : null;

  const contenitore = document.getElementById('risultati-percorso');
  contenitore.innerHTML = percorsi.map((p, i) => `
    <div class="risultato ${i === 0 ? 'scelto' : ''}" data-indice="${i}">
      <h3>
        ${i === 0 ? 'Percorso consigliato' : `Alternativa ${i}`}
        ${p === piuEconomico && validi.length > 1 ? '<span class="badge ok">più economico</span>' : ''}
        ${p.violaDivieti ? '<span class="badge scaduta">viola divieti</span>' : ''}
      </h3>
      <dl>
        <dt>Distanza</dt><dd>${formatoNumero(p.km, 1)} km</dd>
        <dt>Durata</dt><dd>${formattaDurata(p.secondi)}</dd>
        <dt>Pedaggio</dt><dd>${formatoEuro.format(p.pedaggio)}${p.pedaggioNoto ? '' : ' *'}</dd>
        <dt>Gasolio</dt><dd>${formatoNumero(p.litri)} l · ${formatoEuro.format(p.costoGasolio)}</dd>
        <dt class="totale">Totale</dt><dd class="totale">${formatoEuro.format(p.costoTotale)}</dd>
      </dl>
      ${p.pedaggioNoto ? '' : '<p class="tenue">* per alcuni caselli HERE non conosce la tariffa</p>'}
      ${p.dettaglioPedaggi.length ? `
        <details class="dettaglio-pedaggi">
          <summary>Dettaglio pedaggio</summary>
          <dl>${p.dettaglioPedaggi.map(d => `<dt>${esc(d.gestore)}</dt><dd>${formatoEuro.format(d.euro)}</dd>`).join('')}</dl>
        </details>` : ''}
      ${p.avvisi.length ? `<ul class="avvisi">${p.avvisi.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="secondario piccolo btn-salva-tratta" data-indice="${i}">Salva tratta</button>
    </div>
  `).join('');

  // "Salva tratta" apre la finestra di tratte.js. stopPropagation: il clic non deve anche selezionare la scheda
  contenitore.querySelectorAll('.btn-salva-tratta').forEach(b => b.addEventListener('click', evento => {
    evento.stopPropagation();
    apriSalvaTratta(ultimoCalcolo, Number(b.dataset.indice));
  }));

  // Disegno sulla mappa
  creaMappa();
  if (!mappa) return;
  lineeSullaMappa.forEach(l => mappa.removeLayer(l));
  lineeSullaMappa = percorsi.map(p => L.polyline(p.punti, { color: '#94a3b8', weight: 5, opacity: 0.8 }).addTo(mappa));
  lineeSullaMappa.push(L.marker([partenza.lat, partenza.lng]).addTo(mappa).bindTooltip('Partenza'));
  lineeSullaMappa.push(L.marker([arrivo.lat, arrivo.lng]).addTo(mappa).bindTooltip('Arrivo'));
  tappe.forEach((t, i) => lineeSullaMappa.push(
    L.circleMarker([t.lat, t.lng], { radius: 7, color: '#d97706', fillOpacity: 0.9 })
      .addTo(mappa).bindTooltip(`Tappa ${i + 1}: ${t.etichetta}`)));
  evidenziaPercorso(0);
  mappa.fitBounds(L.featureGroup(lineeSullaMappa).getBounds(), { padding: [30, 30] });

  // Clic su una scheda → evidenzia quel percorso
  contenitore.querySelectorAll('.risultato').forEach(scheda =>
    scheda.addEventListener('click', () => evidenziaPercorso(Number(scheda.dataset.indice))));
}

function evidenziaPercorso(indice) {
  document.querySelectorAll('.risultato').forEach((s, i) => s.classList.toggle('scelto', i === indice));
  lineeSullaMappa.forEach((linea, i) => {
    if (!(linea instanceof L.Polyline)) return;
    linea.setStyle(i === indice ? { color: '#1d4ed8', weight: 7 } : { color: '#94a3b8', weight: 5 });
    if (i === indice) linea.bringToFront();
  });
}


/* ======================================================================
   AVVIO
   ====================================================================== */

mostraImpostazioni();
aggiornaContatore();
riempiMenuMezzi();
compilaMisure();

// Quando apri la scheda Percorso: aggiorna i menu (potresti aver aggiunto mezzi) e prepara la mappa
document.querySelector('.tab[data-vista="percorso"]').addEventListener('click', () => {
  riempiMenuMezzi();
  creaMappa();
  // la mappa era nascosta: le diciamo di ricalcolare le sue dimensioni
  setTimeout(() => mappa?.invalidateSize(), 0);
});
