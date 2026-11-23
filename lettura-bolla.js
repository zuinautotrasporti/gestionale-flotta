/*
  lettura-bolla.js — LEGGERE LA BOLLA DALLA FOTO (lezione 10).

  Quando fotografi la bolla in un viaggio, l'app prova a leggerla e a riempire i campi.
  Tutto succede SUL TELEFONO (o sul PC): la foto non viene mandata a nessun servizio esterno
  e non si paga niente. Il lavoro si divide in due parti:

  1. OCR ("riconoscimento ottico dei caratteri") con Tesseract, una libreria gratuita.
     Trasforma la foto in TESTO, ma non sa cosa vuol dire quel testo.
     La prima volta scarica circa 15 MB (il programma e il "vocabolario" italiano), poi resta nella cache.
  2. Le REGOLE qui sotto, scritte guardando le bolle vere (Sasil, IFA, formulario rifiuti):
     cercano nel testo il numero DDT, la data, le targhe, il peso, partenza, destinazione e cliente.

  I campi riempiti si colorano di giallo: vuol dire "letto dalla foto, controllalo".
  Le regole non sono perfette: quando una bolla nuova viene letta male, si aggiunge una regola qui.
*/

const TESSERACT_JS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';


/* ======================================================================
   1. LE REGOLE: dal testo letto ai dati del viaggio
   ====================================================================== */

// Le lettere che l'OCR scambia con i numeri, e viceversa (es. "FN94DFV" → "FN940FV")
const COME_NUMERO = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };
const COME_LETTERA = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 8: 'B', 6: 'G' };

function aNumeri(testo) { return [...testo].map(c => COME_NUMERO[c] || c).join(''); }
function aLettere(testo) { return [...testo].map(c => COME_LETTERA[c] || c).join(''); }

// "BRUSNENGO" → "Brusnengo", "SANT'AGOSTINO" → "Sant'Agostino"
function iniziali(testo) {
  return testo.toLowerCase().replace(/(^|[\s'’-])([a-zà-ù])/g, (_, prima, lettera) => prima + lettera.toUpperCase()).trim();
}

// Quante lettere diverse tra due parole (distanza di Levenshtein): serve a riconoscere
// una targa letta con un errore, confrontandola con le targhe dei tuoi mezzi
function differenze(a, b) {
  const riga = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonale = riga[0];
    riga[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const sopra = riga[j];
      riga[j] = Math.min(riga[j] + 1, riga[j - 1] + 1, diagonale + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonale = sopra;
    }
  }
  return riga[b.length];
}

// "13/11/26" o "16/11/2026" → "2026-11-13" (il formato dei campi data). Null se non è una data vera.
function dataIso(giorno, mese, anno) {
  const a = anno.length === 2 ? '20' + anno : anno;
  const d = new Date(`${a}-${mese.padStart(2, '0')}-${giorno.padStart(2, '0')}T12:00:00`);
  if (isNaN(d) || d.getDate() !== Number(giorno)) return null;
  return d.toISOString().slice(0, 10);
}

// "29590,00" → 29590 · "30.740" → 30740 · "30580" → 30580
function kgDaTesto(testo) {
  const pulito = testo.replace(/\s/g, '').replace(/,\d{1,2}$/, '').replace(/\./g, '');
  const kg = Number(pulito);
  return kg >= 1000 && kg <= 45000 ? kg : null;     // un carico vero sta tra 1 e 45 tonnellate
}

// Le sigle delle province italiane: servono a riconoscere "BRUSNENGO BI" (paese + provincia senza parentesi)
const PROVINCE = new Set(('AG AL AN AO AP AQ AR AT AV BA BG BI BL BN BO BR BS BT BZ CA CB CE CH CL CN CO CR CS CT CZ ' +
  'EN FC FE FG FI FM FR GE GO GR IM IS KR LC LE LI LO LT LU MB MC ME MI MN MO MS MT NA NO NU OR PA PC PD PE PG PI PN ' +
  'PO PR PT PU PV PZ RA RC RE RG RI RM RN RO SA SI SO SP SR SS SU SV TA TE TN TO TP TR TS TV UD VA VB VC VE VI VR VT VV').split(' '));

// Parole che stanno nelle stesse caselle ma non sono paesi
const NON_PAESI = new Set(['SFUSO', 'CISTERNA', 'RIBALTABILE', 'ITALIA', 'ITALY', 'VENDITA', 'VENDITE', 'RINFUSA', 'CONT']);

// Cerca il paese in un pezzo di testo, provando le forme che si trovano sulle bolle:
//   "45032 - Bergantino (RO)"  ·  "GERENZANO (VA)"  ·  "via Baiona, 143 - RAVENNA"  ·  "13862 BRUSNENGO"  ·  "BRUSNENGO BI"
function paeseIn(testo) {
  // Riga per riga, dall'alto: il primo paese trovato vince (le righe dopo spesso sono di altre caselle)
  for (const riga of testo.split('\n')) {
    const paese = paeseInRiga(riga);
    if (paese) return paese;
  }
  return null;
}

function paeseInRiga(testo) {
  const conProvincia = testo.match(/([A-ZÀ-Ù][A-ZÀ-Ù'’ ]{2,30}?)\s*-?\s*\(([A-Z]{2})\)/);
  if (conProvincia && PROVINCE.has(conProvincia[2])) return `${iniziali(conProvincia[1])} (${conProvincia[2]})`;
  // "- RAVENNA" a fine riga o prima di un altro CAP (quando l'OCR attacca due colonne sulla stessa riga)
  const dopoTrattino = testo.match(/-\s*([A-ZÀ-Ù][A-ZÀ-Ù'’]{3,})(?=\s+\d{5}|\s*$)/m);
  if (dopoTrattino && !NON_PAESI.has(dopoTrattino[1])) return iniziali(dopoTrattino[1]);
  const conCap = testo.match(/\b\d{5}\s*-?\s*([A-ZÀ-Ù][A-ZÀ-Ù'’]{2,}(?: [A-ZÀ-Ù'’]{3,})?)/);
  if (conCap) return iniziali(conCap[1]);
  for (const m of testo.matchAll(/\b([A-ZÀ-Ù][A-ZÀ-Ù'’]{3,})\s+([A-Z]{2})\s*$/gm)) {
    if (PROVINCE.has(m[2])) return `${iniziali(m[1])} (${m[2]})`;
  }
  return null;
}

// Le righe che seguono una parola chiave (il resto della sua riga, più le N righe dopo)
function dopo(testo, regola, quanteRighe = 3) {
  const trovato = testo.match(regola);
  if (!trovato) return null;
  const [stessaRiga, ...altre] = testo.slice(trovato.index + trovato[0].length).split('\n');
  return [stessaRiga, ...altre.filter(riga => riga.trim()).slice(0, quanteRighe)].join('\n');   // le righe vuote non contano
}

/*
  estraiDatiBolla(testo, contesto)
    testo    = quello che ha letto l'OCR
    contesto = { targhe: [{ targa, tipo }], clienti: ['TRANSVIT', ...] } per riconoscere i nomi tuoi
  Restituisce solo i campi trovati: { ddt, data, trattore, rimorchio, peso, partenza, destinazione, cliente }
*/
function estraiDatiBolla(testo, contesto = { targhe: [], clienti: [] }) {
  const t = testo.replace(/\r/g, '');
  const maiuscolo = t.toUpperCase();
  const dati = {};

  // --- N° DDT ---
  const ddt =
    maiuscolo.match(/\b(DDT[A-Z]{2,4}\d{2}\s?-\s?\d{3,6})\b/) ||                        // Sasil: DDTBRU26-07238
    maiuscolo.match(/\b([A-Z]{5}\s?\d{6}\s?[A-Z]{2})\b/) ||                             // formulario rifiuti: RFPMH 005232 TX
    maiuscolo.match(/(?:\bDDT|D\.D\.T\.?|DOCUMENTO DI TRASPORTO)\s*(?:N[°.ROº]*\s*)?[:.]?\s*(\d[\d/-]{1,10})\b/) ||
    maiuscolo.match(/\b([A-Z0-9]{2,7}\d{2}-\d{5})\b(?=.*DATA)/);                        // Sasil con l'inizio coperto
  if (ddt) dati.ddt = ddt[1].replace(/\s*-\s*/, '-').replace(/\s+/g, ' ');
  // Bolle Sasil: se il biglietto della pesa copre l'inizio del numero ("1U26-07244"), lo completiamo
  if (dati.ddt && /SASIL/.test(maiuscolo) && /BRUSNENGO/.test(maiuscolo) && !dati.ddt.startsWith('DDT')) {
    const coda = dati.ddt.match(/(\d{2}-\d{5})$/);
    if (coda) dati.ddt = 'DDTBRU' + coda[1];
  }

  // --- DATA: prima quella vicina a "data documento / emissione", altrimenti la prima che c'è ---
  const regolaData = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/;
  const vicinaEtichetta = dopo(t, /data\s+(?:documento|emissione|del documento|ddt)/i, 1)?.match(regolaData);
  const tutteLeDate = [...t.matchAll(new RegExp(regolaData, 'g'))];
  for (const d of [vicinaEtichetta, ...tutteLeDate].filter(Boolean)) {
    const iso = dataIso(d[1], d[2], d[3]);
    if (iso && iso >= '2020-01-01') { dati.data = iso; break; }
  }

  // --- TARGHE: "HC458CF", "XA 494 LP", "AD38853" (rimorchi vecchi) ---
  const lette = [];
  for (const m of maiuscolo.matchAll(/\b([A-Z0-9]{2})\s?([A-Z0-9]{3})\s?([A-Z0-9]{2})\b/g)) {
    const targa = aLettere(m[1]) + aNumeri(m[2]) + aLettere(m[3]);
    if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(targa) && /\d/.test(m[2])) lette.push(targa);
  }
  for (const m of maiuscolo.matchAll(/\b([A-Z]{2})\s?(\d{5})\b/g)) lette.push(m[1] + m[2]);
  const trovate = [];
  for (const letta of lette) {
    // Se somiglia a una targa dei tuoi mezzi (al massimo 1 carattere diverso), è quella
    const mia = contesto.targhe
      .map(m => ({ ...m, diff: differenze(letta, m.targa.replace(/\s/g, '').toUpperCase()) }))
      .filter(m => m.diff <= 1)
      .sort((a, b) => a.diff - b.diff)[0];
    if (mia) trovate.push({ targa: mia.targa, tipo: mia.tipo, mia: true });
    else if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(letta) || /^[A-Z]{2}\d{5}$/.test(letta)) {
      // Non è tua: i semirimorchi hanno targhe che iniziano con X (o il formato vecchio 2 lettere + 5 numeri)
      trovate.push({ targa: letta, tipo: /^X/.test(letta) || /^[A-Z]{2}\d{5}$/.test(letta) ? 'rimorchio' : 'trattore', mia: false });
    }
  }
  // Prima le targhe dei tuoi mezzi, poi le altre (solo quelle vicine a "targa")
  const zonaTarga = (dopo(maiuscolo, /TARGA/, 2) || '');
  const valida = x => x.mia || zonaTarga.replace(/\s/g, '').includes(x.targa);
  const trattore = trovate.find(x => x.tipo === 'trattore' && valida(x));
  const rimorchio = trovate.find(x => x.tipo === 'rimorchio' && valida(x));
  if (trattore) dati.trattore = trattore.targa;
  if (rimorchio) dati.rimorchio = rimorchio.targa;

  // --- PESO (in tonnellate): prima il "netto", poi qualunque peso in kg ---
  const pesi = [];
  const zonaNetto = dopo(t, /peso\s+netto|netto\s+pesato|quantit[àa]\s+accettata/i, 2);
  for (const zona of [zonaNetto, t].filter(Boolean)) {
    for (const m of zona.matchAll(/\b(\d{1,2}[.\s]?\d{3}),\d{2}\b/g)) pesi.push(kgDaTesto(m[1]));               // 29590,00
    for (const m of zona.matchAll(/\bKG\.?\s*(\d{1,2}\.?\d{3})\b/gi)) pesi.push(kgDaTesto(m[1]));                 // KG. 30580
    for (const m of zona.matchAll(/\b(\d{1,2}\.\d{3})\s*kg\b/gi)) pesi.push(kgDaTesto(m[1]));                     // 30.740 kg
    if (pesi.some(Boolean)) break;
  }
  const kg = pesi.find(Boolean);
  if (kg) dati.peso = kg / 1000;

  // --- PARTENZA ---
  const zonaPartenza = dopo(maiuscolo, /LUOGO DI PARTENZA[^\n]*|UNIT[ÀA] LOCALE/, 4);
  const partenza = zonaPartenza && paeseIn(zonaPartenza);
  if (partenza) dati.partenza = partenza;

  // --- DESTINAZIONE ---
  const zonaDestinazione =
    dopo(maiuscolo, /DESTINAZIONE MER\w*/, 5) ||
    dopo(maiuscolo, /DEST\.?\s*NE[^\n]*|(?<!FIRMA )(?<!FIRMA DEL )DESTINATARIO[^\n]*/, 4) ||
    dopo(maiuscolo, /\bSPETT\.?\s*LE/, 4);
  const destinazione = zonaDestinazione && paeseIn(zonaDestinazione);
  if (destinazione) dati.destinazione = destinazione;

  // --- CLIENTE: chi ti dà il lavoro. Prima i clienti che conosci già, poi le parole tipiche ---
  const conosciuto = contesto.clienti.find(c => c && maiuscolo.includes(c.toUpperCase()));
  if (conosciuto) dati.cliente = conosciuto;
  else {
    // "Società di logistica" (Sasil), "per c/to" (formulario rifiuti), "Vettore" (IFA): ma il vettore Zuin sei tu
    const societa = "([A-Z][A-Z .&']+?(?:S\\.?R\\.?L\\.?|S\\.?P\\.?A\\.?))";
    const committente = [
      new RegExp('SOCIET[ÀA] DI LOGISTICA[^\\n]*\\n\\s*' + societa),
      new RegExp('PER C\\s*.?\\s*TO\\s+' + societa),
      new RegExp('VETTORE[^\\n]*\\n(?:[^\\n]*\\n)?\\s*' + societa),
    ].map(r => maiuscolo.match(r)).find(m => m && !/ZUIN/.test(m[1]));
    if (committente) dati.cliente = iniziali(committente[1].replace(/\s+/g, ' ')).replace(/S\.?r\.?l\.?$/i, 'srl');
  }

  return dati;
}


/* ======================================================================
   2. L'OCR: dalla foto al testo (solo nel browser)
   ====================================================================== */

let promessaTesseract = null;

// Tesseract si scarica solo la prima volta che serve (così l'app non diventa più lenta ad aprirsi)
function caricaTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  promessaTesseract ||= new Promise((risolvi, rifiuta) => {
    const script = document.createElement('script');
    script.src = TESSERACT_JS;
    script.onload = () => risolvi(window.Tesseract);
    script.onerror = () => { promessaTesseract = null; rifiuta(new Error('Non riesco a scaricare il lettore: serve internet la prima volta.')); };
    document.head.append(script);
  });
  return promessaTesseract;
}

// Disegna la foto (girata di "gradi") su una tela, al massimo 2000 px: abbastanza per leggere, non troppo lenta
async function telaRuotata(file, gradi) {
  const immagine = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scala = Math.min(1, 2000 / Math.max(immagine.width, immagine.height));
  const w = Math.round(immagine.width * scala), h = Math.round(immagine.height * scala);
  const tela = document.createElement('canvas');
  const dritta = gradi % 180 === 0;
  tela.width = dritta ? w : h;
  tela.height = dritta ? h : w;
  const ctx = tela.getContext('2d');
  ctx.translate(tela.width / 2, tela.height / 2);
  ctx.rotate(gradi * Math.PI / 180);
  ctx.drawImage(immagine, -w / 2, -h / 2, w, h);
  return tela;
}

// Quanti campi utili ha trovato: serve a capire se la foto era girata giusta
function punteggio(dati) {
  return Object.keys(dati).length + (dati.ddt ? 1 : 0) + (dati.data ? 1 : 0);
}

/*
  leggiBolla(file, contesto, avanzamento)
  Le bolle sono verticali: se la foto è orizzontale proviamo prima girandola di 90° in un senso,
  poi nell'altro. Teniamo la lettura che trova più campi.
*/
async function leggiBolla(file, contesto, avanzamento = () => {}) {
  avanzamento('Preparo il lettore (la prima volta ci vuole un po\')…');
  const Tesseract = await caricaTesseract();
  const lavoratore = await Tesseract.createWorker('ita');
  try {
    const prova = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const orizzontale = prova.width > prova.height;
    const rotazioni = orizzontale ? [90, 270] : [0, 180];
    let migliore = { dati: {}, testo: '' };
    for (const [i, gradi] of rotazioni.entries()) {
      avanzamento(`Leggo la bolla${i ? ' (la giro e riprovo)' : ''}…`);
      const { data } = await lavoratore.recognize(await telaRuotata(file, gradi));
      const dati = estraiDatiBolla(data.text, contesto);
      if (punteggio(dati) > punteggio(migliore.dati)) migliore = { dati, testo: data.text };
      if (punteggio(migliore.dati) >= 6) break;     // già trovato quasi tutto: non serve girarla
    }
    return migliore;
  } finally {
    await lavoratore.terminate();
  }
}

// Per provare le regole senza browser (node)
if (typeof module !== 'undefined') module.exports = { estraiDatiBolla };
