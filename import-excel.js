/*
  import-excel.js — IMPORTAZIONE DAL FILE EXCEL.

  Usa la libreria SheetJS (la variabile globale XLSX, caricata in index.html) per leggere il file.
  Funziona in tre passi, separati apposta:
    1. LEGGERE   → trasformare ogni foglio in un elenco di righe { "targa": ..., "marca": ... }
    2. PREPARARE → convertire le righe nel formato dell'app (mezzi e autisti), senza ancora toccare i dati
    3. APPLICARE → unire con i dati esistenti, dopo aver chiesto conferma

  Separare "preparare" da "applicare" permette di mostrare un riepilogo prima di cambiare qualcosa.

  Le colonne vengono cercate per NOME dell'intestazione, non per posizione:
  se nell'Excel sposti una colonna, l'importazione continua a funzionare.
*/


/* ======================================================================
   1. LEGGERE
   ====================================================================== */

// "Scad.\nRevisione" → "scad. revisione" (toglie a capo e spazi doppi, tutto minuscolo)
function normalizzaIntestazione(testo) {
  return String(testo ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Restituisce le righe di un foglio come oggetti, oppure null se il foglio non c'è
function leggiFoglio(cartella, nomeFoglio) {
  const foglio = cartella.Sheets[nomeFoglio];
  if (!foglio) return null;

  // header: 1 → ogni riga è un array di valori; la prima riga sono le intestazioni
  const righe = XLSX.utils.sheet_to_json(foglio, { header: 1, raw: true, defval: null, blankrows: false });
  const intestazioni = (righe[0] || []).map(normalizzaIntestazione);

  return righe.slice(1).map(riga => {
    const oggetto = {};
    intestazioni.forEach((nome, i) => { if (nome) oggetto[nome] = riga[i]; });
    return oggetto;
  });
}


/* ---------- Conversione dei valori delle celle ---------- */

function testoCella(valore) {
  return valore === null || valore === undefined ? '' : String(valore).trim();
}

function numeroCella(valore) {
  if (valore === null || valore === undefined || valore === '') return null;
  const n = Number(String(valore).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function targaCella(valore) {
  return testoCella(valore).toUpperCase().replace(/\s+/g, '');
}

function nomeCella(valore) {
  return testoCella(valore).replace(/\s+/g, ' ').toUpperCase();
}

// Excel salva le date come NUMERI: giorni passati dal 1/1/1900 (45000 ≈ marzo 2023).
// Questa funzione accetta il numero, una data o un testo "gg/mm/aaaa" e restituisce "aaaa-mm-gg".
function dataCella(valore) {
  const due = n => String(n).padStart(2, '0');

  if (typeof valore === 'number') {
    const d = XLSX.SSF.parse_date_code(valore);              // { y: 2027, m: 9, d: 30, ... }
    return d ? `${d.y}-${due(d.m)}-${due(d.d)}` : '';
  }
  if (valore instanceof Date) {
    return `${valore.getFullYear()}-${due(valore.getMonth() + 1)}-${due(valore.getDate())}`;
  }
  const testo = testoCella(valore);
  let m = testo.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);      // 30/09/2027
  if (m) return `${m[3]}-${due(m[2])}-${due(m[1])}`;
  m = testo.match(/^(\d{4})-(\d{2})-(\d{2})/);                         // 2027-09-30
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

function statoMezzoCella(valore) {
  const stati = ['Attivo', 'In manutenzione', 'Fermo', 'Venduto'];
  return stati.find(s => s.toLowerCase() === testoCella(valore).toLowerCase()) || 'Attivo';
}

function statoAutistaCella(valore) {
  return testoCella(valore).toLowerCase() === 'non attivo' ? 'Non attivo' : 'Attivo';
}


/* ======================================================================
   2. PREPARARE
   ====================================================================== */

function preparaImportazione(cartella) {
  const trattori = leggiFoglio(cartella, 'TRATTORI');
  const rimorchi = leggiFoglio(cartella, 'RIMORCHI');
  const autisti = leggiFoglio(cartella, 'AUTISTI');
  const scadenzeExtra = leggiFoglio(cartella, 'SCADENZE');

  if (!trattori && !rimorchi && !autisti) {
    throw new Error('Nel file non ci sono i fogli TRATTORI, RIMORCHI o AUTISTI.');
  }

  const risultato = { mezzi: [], autisti: [], avvisi: [] };

  for (const r of trattori || []) {
    const targa = targaCella(r['targa']);
    if (!targa) continue;                                   // riga vuota
    risultato.mezzi.push({
      // Nel foglio TRATTORI la colonna "Tipo mezzo" distingue i trattori dalle auto aziendali
      tipo: testoCella(r['tipo mezzo']).toLowerCase() === 'auto' ? 'auto' : 'trattore',
      targa,
      marca: testoCella(r['marca']),
      modello: testoCella(r['modello']),
      anno: numeroCella(r['anno']),
      telaio: testoCella(r['telaio']),
      stato: statoMezzoCella(r['stato']),
      autista: nomeCella(r['assegnato a (autista)']),
      note: testoCella(r['note']),
      scadenze: {
        revisione: dataCella(r['scad. revisione']),
        bollo: dataCella(r['scad. bollo']),
        assicurazione: dataCella(r['scad. assicuraz.']),
      },
    });
  }

  for (const r of rimorchi || []) {
    const targa = targaCella(r['targa']);
    if (!targa) continue;
    risultato.mezzi.push({
      tipo: 'rimorchio',
      targa,
      tipoRimorchio: testoCella(r['tipo rimorchio']),
      marca: testoCella(r['marca']),
      modello: testoCella(r['modello']),
      anno: numeroCella(r['anno']),
      telaio: testoCella(r['telaio']),
      stato: statoMezzoCella(r['stato']),
      note: testoCella(r['note']),
      scadenze: {
        revisione: dataCella(r['scad. revisione']),
        assicurazione: dataCella(r['scad. assicuraz.']),
      },
    });
  }

  for (const r of autisti || []) {
    const nome = nomeCella(r['nome e cognome']);
    if (!nome) continue;
    risultato.autisti.push({
      nome,
      telefono: testoCella(r['telefono']),
      numeroPatente: testoCella(r['n° patente']),
      numeroCarta: testoCella(r['n° carta tachigrafica']),
      stato: statoAutistaCella(r['stato']),
      note: testoCella(r['note']),
      scadenze: {
        patente: dataCella(r['scad. patente']),
        cqc: dataCella(r['scad. cqc']),
        cartaTachigrafica: dataCella(r['scad. tachigrafo']),
      },
    });
  }

  // Dal foglio SCADENZE prendiamo solo le tarature del cronotachigrafo dei trattori.
  // La riga di esempio (ID "es.") viene saltata.
  for (const r of scadenzeExtra || []) {
    if (testoCella(r['id']).toLowerCase().startsWith('es')) continue;
    if (testoCella(r['tipo']).toLowerCase() !== 'trattore') continue;
    if (!testoCella(r['categoria']).toLowerCase().startsWith('cronotachigrafo')) continue;

    const targa = targaCella(r['riferimento']);
    const data = dataCella(r['data scadenza']);
    const trattore = risultato.mezzi.find(m => m.targa === targa);
    if (trattore && data) {
      // se ci sono più righe per lo stesso trattore teniamo la data più lontana (l'ultima taratura)
      if (!trattore.scadenze.cronotachigrafo || data > trattore.scadenze.cronotachigrafo) {
        trattore.scadenze.cronotachigrafo = data;
      }
    }
  }

  // Controllo: ogni autista assegnato a un trattore deve esistere nel foglio AUTISTI
  const nomiAutisti = new Set([...risultato.autisti.map(a => a.nome), ...dati.autisti.map(a => a.nome)]);
  for (const m of risultato.mezzi) {
    if (m.autista && !nomiAutisti.has(m.autista)) {
      risultato.avvisi.push(`Il trattore ${m.targa} è assegnato a "${m.autista}", che non è nel foglio AUTISTI.`);
    }
  }

  return risultato;
}


/* ======================================================================
   3. APPLICARE
   ====================================================================== */

// Unisce un elemento letto dall'Excel con quello già presente nell'app.
// Regola: i valori PIENI dell'Excel sovrascrivono; le celle VUOTE non cancellano niente.
// Così peso, dimensioni e date inserite solo nell'app restano al loro posto.
function unisci(esistente, dalFile) {
  for (const [campo, valore] of Object.entries(dalFile)) {
    if (campo === 'scadenze') continue;
    if (valore !== '' && valore !== null) esistente[campo] = valore;
  }
  for (const [chiave, data] of Object.entries(dalFile.scadenze)) {
    if (data) esistente.scadenze[chiave] = data;
  }
}

function applicaImportazione(preparati) {
  const conteggio = { mezziNuovi: 0, mezziAggiornati: 0, autistiNuovi: 0, autistiAggiornati: 0 };

  for (const m of preparati.mezzi) {
    const esistente = dati.mezzi.find(x => x.targa === m.targa);
    if (esistente) {
      unisci(esistente, m);
      conteggio.mezziAggiornati++;
    } else {
      dati.mezzi.push({ id: nuovoId(), massa: null, altezza: null, larghezza: null, lunghezza: null,
                        tipoRimorchio: '', autista: '', ...m });
      conteggio.mezziNuovi++;
    }
  }

  for (const a of preparati.autisti) {
    const esistente = dati.autisti.find(x => x.nome === a.nome);
    if (esistente) {
      unisci(esistente, a);
      conteggio.autistiAggiornati++;
    } else {
      dati.autisti.push({ id: nuovoId(), ...a });
      conteggio.autistiNuovi++;
    }
  }

  salvaDati();
  aggiornaTutto();
  return conteggio;
}


/* ======================================================================
   COLLEGAMENTO AL PULSANTE
   ====================================================================== */

async function importaExcel(evento) {
  const file = evento.target.files[0];
  const esito = document.getElementById('esito-import');
  evento.target.value = '';                                 // permette di riscegliere lo stesso file
  if (!file) return;

  esito.className = 'esito';
  esito.textContent = '';

  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('La libreria per leggere Excel non è stata caricata. Controlla la connessione a internet e ricarica la pagina.');
    }

    const cartella = XLSX.read(await file.arrayBuffer());   // apre il file .xlsx
    const preparati = preparaImportazione(cartella);

    const quanti = tipo => preparati.mezzi.filter(m => m.tipo === tipo).length;
    const messaggio = `Nel file ho trovato ${quanti('trattore')} trattori, ${quanti('rimorchio')} semirimorchi, ` +
      `${quanti('auto')} auto aziendali e ${preparati.autisti.length} autisti.\n\n` +
      'Quelli già presenti nell\'app verranno aggiornati, gli altri aggiunti. Procedere?';
    if (!confirm(messaggio)) return;

    const c = applicaImportazione(preparati);

    // Il nome dell'azienda sta in alto nel foglio DASHBOARD (cella C1): se non l'hai ancora impostato, lo prendiamo da lì
    const nomeNelFile = testoCella(cartella.Sheets.DASHBOARD?.C1?.v);
    if (nomeNelFile && !impostazioni.nomeAzienda) {
      impostazioni.nomeAzienda = nomeNelFile;
      localStorage.setItem(CHIAVE_IMPOSTAZIONI, JSON.stringify(impostazioni));
      mostraImpostazioni();
      mostraNomeAzienda();
    }

    esito.innerHTML = `
      <strong>Importazione completata.</strong><br>
      Mezzi: ${c.mezziNuovi} aggiunti, ${c.mezziAggiornati} aggiornati.<br>
      Autisti: ${c.autistiNuovi} aggiunti, ${c.autistiAggiornati} aggiornati.
      ${preparati.avvisi.length ? '<br><br><strong>Da controllare:</strong><br>' + preparati.avvisi.map(esc).join('<br>') : ''}
    `;
  } catch (errore) {
    console.error(errore);
    esito.className = 'esito errore';
    esito.textContent = 'Importazione non riuscita: ' + errore.message;
  }
}

document.getElementById('input-excel').addEventListener('change', importaExcel);
