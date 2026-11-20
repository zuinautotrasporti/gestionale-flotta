/*
  viaggi.js — I VIAGGI (lezione 9).

  Un viaggio è un trasporto: data, cliente, da dove a dove, con quale trattore e semirimorchio,
  chi guida, quanto peso, il numero della bolla (DDT) e la FOTO della bolla attaccata.
  Da qui, più avanti, nasceranno:
    - fase 2: la lettura automatica della foto della bolla (riempie i campi da sola);
    - fase 3: il riepilogo "da fatturare" per cliente e per mese.

  Com'è fatto un viaggio nei dati (dati.viaggi):
    { id, data, stato, cliente, ddt, partenza, destinazione,
      trattore, rimorchio,            ← le TARGHE (come nelle tratte)
      autista,                        ← il NOME (come nella tabella dei mezzi)
      peso, prezzoTonnellata, importoCorpo, fatturato, trattaId, note }

  La foto della bolla NON sta qui dentro: è un allegato (allegati.js) con proprietario
  { tipo: 'viaggio', id }. Così usa lo stesso sistema dei libretti: salvato sul database,
  visibile da tutti i dispositivi, apribile e stampabile.
*/

const STATI_VIAGGIO = ['Programmato', 'In viaggio', 'Consegnato', 'Problema'];
const CLASSE_STATO_VIAGGIO = { Programmato: 'da-inserire', 'In viaggio': 'in-corso', Consegnato: 'ok', Problema: 'scaduta' };

let filtroViaggi = 'tutti';


/* ======================================================================
   1. CALCOLI
   ====================================================================== */

// Quanto vale il viaggio (senza IVA): l'importo a corpo se c'è, altrimenti peso × prezzo
function importoViaggio(v) {
  if (v.importoCorpo != null) return v.importoCorpo;
  if (v.peso != null && v.prezzoTonnellata != null) return v.peso * v.prezzoTonnellata;
  return null;
}

// "Da fatturare" = consegnato ma non ancora fatturato
function daFatturare(v) {
  return v.stato === 'Consegnato' && !v.fatturato;
}

function haBolla(v) {
  return typeof allegatiDi === 'function' && allegatiDi('viaggio', v.id).length > 0;
}

function passaIlFiltro(v) {
  if (filtroViaggi === 'tutti') return true;
  if (filtroViaggi === 'da-fatturare') return daFatturare(v);
  return v.stato === filtroViaggi;
}


/* ======================================================================
   2. TABELLA E RIQUADRI
   ====================================================================== */

function disegnaViaggi() {
  const corpo = document.getElementById('tabella-viaggi');
  const tutti = [...dati.viaggi].sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  // Riquadri in alto: contano sempre TUTTI i viaggi, non solo quelli filtrati
  const meseAdesso = new Date().toISOString().slice(0, 7);          // es. "2026-11"
  const delMese = tutti.filter(v => (v.data || '').startsWith(meseAdesso));
  const conta = stato => tutti.filter(v => v.stato === stato).length;
  const sospesi = tutti.filter(daFatturare);
  const totaleSospeso = sospesi.reduce((somma, v) => somma + (importoViaggio(v) || 0), 0);
  const tonnellateMese = delMese.reduce((somma, v) => somma + (v.peso || 0), 0);

  document.getElementById('riepilogo-viaggi').innerHTML = `
    <div class="card in-corso"><strong>${conta('In viaggio')}</strong>In viaggio</div>
    <div class="card da-inserire"><strong>${conta('Programmato')}</strong>Programmati</div>
    <div class="card ok"><strong>${delMese.filter(v => v.stato === 'Consegnato').length}</strong>Consegnati questo mese</div>
    <div class="card in-scadenza"><strong>${formatoEuro.format(totaleSospeso)}</strong>Da fatturare (${sospesi.length})</div>
    <div class="card da-inserire"><strong>${formatoNumero(tonnellateMese, 1)}</strong>Tonnellate questo mese</div>
  `;

  const elenco = tutti.filter(passaIlFiltro);

  if (elenco.length === 0) {
    corpo.innerHTML = `<tr><td colspan="9" class="vuoto">${tutti.length === 0
      ? 'Nessun viaggio ancora. Premi "Nuovo viaggio" e, se ce l\'hai, fotografa la bolla.'
      : 'Nessun viaggio con questo filtro.'}</td></tr>`;
    return;
  }

  corpo.innerHTML = elenco.map(v => {
    const importo = importoViaggio(v);
    const idAutista = dati.autisti.find(a => a.nome === v.autista)?.id;
    // Accanto allo stato, se è consegnato, diciamo a che punto è la fattura
    const fattura = v.fatturato ? ' <span class="badge ok">Fatturato</span>'
      : daFatturare(v) ? ' <span class="badge in-scadenza">Da fatturare</span>' : '';
    return `
      <tr class="riga-apribile" data-id="${v.id}">
        <td><button type="button" class="link" data-azione="modifica" data-id="${v.id}" title="Apri il viaggio">${formattaData(v.data)}</button></td>
        <td>${esc(v.cliente) || '—'}</td>
        <td class="a-capo">${esc(v.partenza) || '?'} → ${esc(v.destinazione) || '?'}</td>
        <td class="a-capo">${[v.trattore, v.rimorchio].filter(Boolean).map(tg => targaHtml(tg, idDaTarga(tg))).join(' ') || '—'}</td>
        <td>${v.autista ? autistaHtml(v.autista, idAutista) : '—'}</td>
        <td data-ordina="${v.peso ?? ''}">${v.peso != null ? formatoNumero(v.peso, 2) : '—'}</td>
        <td>${esc(v.ddt) || '—'}${haBolla(v) ? ' <span class="badge ok" title="Bolla allegata">bolla</span>' : ''}</td>
        <td data-ordina="${importo ?? ''}">${euroOVuoto(importo)}</td>
        <td data-ordina="${STATI_VIAGGIO.indexOf(v.stato)}"><span class="badge ${CLASSE_STATO_VIAGGIO[v.stato] || 'inattivo'}">${esc(v.stato)}</span>${fattura}</td>
      </tr>`;
  }).join('');
}

// Toccando una riga si apre il viaggio (ma targa e autista aprono le loro schede, come altrove)
document.getElementById('tabella-viaggi').addEventListener('click', evento => {
  if (evento.target.closest('button.targa, [data-scheda-autista]')) return;
  const riga = evento.target.closest('tr[data-id]');
  if (riga) apriModuloViaggio(dati.viaggi.find(v => v.id === riga.dataset.id));
});

// I pulsanti filtro sopra la tabella (Tutti, Programmati, ..., Da fatturare)
document.getElementById('filtri-viaggi').addEventListener('click', evento => {
  const pulsante = evento.target.closest('button[data-filtro]');
  if (!pulsante) return;
  filtroViaggi = pulsante.dataset.filtro;
  document.querySelectorAll('#filtri-viaggi button').forEach(b =>
    b.setAttribute('aria-pressed', String(b === pulsante)));
  disegnaViaggi();
  dopoDisegno();     // etichette per il telefono, ordinamento e ricerca sulle righe nuove
});


/* ======================================================================
   3. FINESTRA "NUOVO / MODIFICA VIAGGIO"
   ====================================================================== */

const dialogViaggio = document.getElementById('dialog-viaggio');
const formViaggio = document.getElementById('form-viaggio');
let viaggioInModifica = null;    // il viaggio aperto
let viaggioNuovo = false;        // true = non è ancora stato salvato
let viaggioSalvato = false;      // per capire, alla chiusura, se è stato premuto "Salva"

// Riempie un <select> con le opzioni; "attuale" resta nell'elenco anche se il mezzo è fermo o venduto
function opzioni(select, valori, attuale, vuoto = '—') {
  const elenco = [...valori];
  if (attuale && !elenco.includes(attuale)) elenco.unshift(attuale);
  select.innerHTML = `<option value="">${vuoto}</option>` +
    elenco.map(v => `<option${v === attuale ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function targheDi(tipo) {
  return dati.mezzi
    .filter(m => m.tipo === tipo && !STATI_ESCLUSI.includes(m.stato))
    .map(m => m.targa)
    .sort();
}

function apriModuloViaggio(viaggio) {
  viaggioNuovo = !viaggio;
  viaggioSalvato = false;
  viaggioInModifica = viaggio || {
    id: nuovoId(),
    data: new Date().toISOString().slice(0, 10),
    stato: 'Programmato',
    fatturato: false,
  };
  const v = viaggioInModifica;
  const campi = formViaggio.elements;

  document.getElementById('titolo-form-viaggio').textContent = viaggioNuovo ? 'Nuovo viaggio' : 'Viaggio';
  document.getElementById('btn-elimina-viaggio').hidden = viaggioNuovo;

  campi.data.value = v.data || '';
  campi.stato.value = v.stato || 'Programmato';
  campi.cliente.value = v.cliente || '';
  campi.ddt.value = v.ddt || '';
  campi.partenza.value = v.partenza || '';
  campi.destinazione.value = v.destinazione || '';
  campi.peso.value = v.peso ?? '';
  campi.prezzoTonnellata.value = v.prezzoTonnellata ?? '';
  campi.importoCorpo.value = v.importoCorpo ?? '';
  campi.fatturato.checked = Boolean(v.fatturato);
  campi.note.value = v.note || '';

  opzioni(campi.trattore, targheDi('trattore'), v.trattore);
  opzioni(campi.rimorchio, targheDi('rimorchio'), v.rimorchio);
  opzioni(campi.autista,
    dati.autisti.filter(a => !STATI_ESCLUSI.includes(a.stato)).map(a => a.nome).sort(), v.autista);

  // Le tratte salvate, dalla più recente: scegliendone una si riempiono i campi
  const tratte = [...dati.tratte].sort((a, b) => b.data.localeCompare(a.data));
  campi.tratta.innerHTML = '<option value="">—</option>' + tratte.map(t =>
    `<option value="${t.id}"${t.id === v.trattaId ? ' selected' : ''}>
      ${formattaData(t.data)} · ${esc(t.cliente || 'senza cliente')} · ${esc(nomeBreve(t.partenza))} → ${esc(nomeBreve(t.arrivo))}</option>`).join('');

  // Suggerimenti per il cliente: quelli già usati in viaggi e tratte
  const clienti = new Set([...dati.viaggi, ...dati.tratte].map(x => x.cliente).filter(Boolean));
  document.getElementById('elenco-clienti-viaggi').innerHTML =
    [...clienti].sort().map(c => `<option value="${esc(c)}">`).join('');

  mostraImporto();
  sezioneAllegati(document.getElementById('allegati-viaggio'), 'viaggio', v.id);
  dialogViaggio.showModal();
}

// Sotto peso e prezzo, il conto fatto: così vedi subito se torna
function mostraImporto() {
  const campi = formViaggio.elements;
  const prova = {
    peso: numeroOpzionaleViaggio(campi.peso.value),
    prezzoTonnellata: numeroOpzionaleViaggio(campi.prezzoTonnellata.value),
    importoCorpo: numeroOpzionaleViaggio(campi.importoCorpo.value),
  };
  const importo = importoViaggio(prova);
  document.getElementById('importo-viaggio').textContent = importo == null
    ? 'Importo: inserisci peso e prezzo €/t, oppure un importo a corpo.'
    : `Importo: ${formatoEuro.format(importo)}` +
      (prova.importoCorpo == null ? ` (${formatoNumero(prova.peso, 2)} t × ${formatoEuro.format(prova.prezzoTonnellata)})` : ' (a corpo)');
}
['peso', 'prezzoTonnellata', 'importoCorpo'].forEach(nome =>
  formViaggio.elements[nome].addEventListener('input', mostraImporto));

function numeroOpzionaleViaggio(valore) {
  const pulito = String(valore).trim().replace(',', '.');
  return pulito === '' || isNaN(Number(pulito)) ? null : Number(pulito);
}

// Scegliendo una tratta salvata: copiamo cliente, località, mezzi e prezzo (il peso no: lo dice la bolla)
formViaggio.elements.tratta.addEventListener('change', () => {
  const t = dati.tratte.find(x => x.id === formViaggio.elements.tratta.value);
  if (!t) return;
  const campi = formViaggio.elements;
  if (t.cliente) campi.cliente.value = t.cliente;
  campi.partenza.value = nomeBreve(t.partenza);
  campi.destinazione.value = nomeBreve(t.arrivo);
  if (t.trattore) opzioni(campi.trattore, targheDi('trattore'), t.trattore);
  if (t.rimorchio) opzioni(campi.rimorchio, targheDi('rimorchio'), t.rimorchio);
  if (t.prezzoTonnellata != null) campi.prezzoTonnellata.value = t.prezzoTonnellata;
  completaAutista();
  mostraImporto();
});

// Scelto il trattore, se l'autista è vuoto mettiamo quello assegnato al trattore (e viceversa)
function completaAutista() {
  const campi = formViaggio.elements;
  const trattore = dati.mezzi.find(m => m.targa === campi.trattore.value);
  if (!campi.autista.value && trattore?.autista) {
    opzioni(campi.autista, [...campi.autista.options].map(o => o.value).filter(Boolean), trattore.autista);
  }
}
formViaggio.elements.trattore.addEventListener('change', completaAutista);
formViaggio.elements.autista.addEventListener('change', () => {
  const campi = formViaggio.elements;
  if (campi.trattore.value) return;
  const trattore = dati.mezzi.find(m => m.tipo === 'trattore' && m.autista === campi.autista.value);
  if (trattore) opzioni(campi.trattore, targheDi('trattore'), trattore.targa);
});

formViaggio.addEventListener('submit', evento => {
  evento.preventDefault();
  const campi = formViaggio.elements;
  Object.assign(viaggioInModifica, {
    data: campi.data.value,
    stato: campi.stato.value,
    cliente: campi.cliente.value.trim(),
    ddt: campi.ddt.value.trim(),
    partenza: campi.partenza.value.trim(),
    destinazione: campi.destinazione.value.trim(),
    trattore: campi.trattore.value,
    rimorchio: campi.rimorchio.value,
    autista: campi.autista.value,
    peso: numeroOpzionaleViaggio(campi.peso.value),
    prezzoTonnellata: numeroOpzionaleViaggio(campi.prezzoTonnellata.value),
    importoCorpo: numeroOpzionaleViaggio(campi.importoCorpo.value),
    fatturato: campi.fatturato.checked,
    trattaId: campi.tratta.value || null,
    note: campi.note.value.trim(),
  });
  if (viaggioNuovo) dati.viaggi.push(viaggioInModifica);
  viaggioSalvato = true;
  salvaDati();
  aggiornaTutto();
  dialogViaggio.close();
});

// Se chiudi un viaggio NUOVO senza salvarlo, le foto già caricate non devono restare "orfane"
dialogViaggio.addEventListener('close', () => {
  if (viaggioNuovo && !viaggioSalvato) eliminaAllegatiDi('viaggio', viaggioInModifica.id);
});

document.getElementById('btn-elimina-viaggio').addEventListener('click', () => {
  const v = viaggioInModifica;
  const descrizione = `${formattaData(v.data)} ${v.cliente || ''} ${v.partenza || ''} → ${v.destinazione || ''}`.trim();
  if (!confirm(`Eliminare il viaggio del ${descrizione}? Spariscono anche la bolla e i documenti caricati.`)) return;
  dati.viaggi = dati.viaggi.filter(x => x !== v);
  eliminaAllegatiDi('viaggio', v.id);
  salvaDati();
  dialogViaggio.close();
  aggiornaTutto();
});

// "Fotografa la bolla": sul telefono apre direttamente la fotocamera posteriore
document.getElementById('input-foto-bolla').addEventListener('change', async evento => {
  const file = evento.target.files[0];
  evento.target.value = '';             // così la stessa foto si può ricaricare
  if (!file) return;
  const riquadro = document.getElementById('allegati-viaggio');
  riquadro.classList.add('in-caricamento');
  try {
    await aggiungiAllegato({ tipo: 'viaggio', id: viaggioInModifica.id }, 'Bolla (DDT)', file);
  } catch (errore) {
    alert(errore.message);
  }
  riquadro.classList.remove('in-caricamento');
  document.dispatchEvent(new CustomEvent('allegati-cambiati'));
});

document.getElementById('btn-nuovo-viaggio').addEventListener('click', () => apriModuloViaggio(null));

disegnaViaggi();
