/*
  tratte.js — LE TRATTE SALVATE (il tuo foglio TRATTE, dentro l'app).

  Una tratta nasce dalla scheda Percorso con "Salva tratta". Salviamo:
    - i numeri del percorso (km, ore, litri, pedaggio stimato da HERE)
    - le TARIFFE di quel giorno (prezzo gasolio, €/ora autista, €/km manutenzione, IVA):
      così se tra un mese il gasolio cambia prezzo, le tratte vecchie non cambiano.
  Costi, ricavo e margine invece si CALCOLANO ogni volta da questi dati (non si salvano):
  è la stessa idea del "dato inserito una volta sola" del tuo Excel.
*/


/* ======================================================================
   CALCOLI
   ====================================================================== */

function costiTratta(t) {
  const fattoreIva = 1 + t.tariffe.iva / 100;
  const pedaggio = t.pedaggioReale ?? t.pedaggioStimato;   // se conosci quello vero, usiamo quello
  const costoGasolio = t.litri * t.tariffe.prezzoGasolio;

  // Come nel foglio TRATTE: gasolio e pedaggio senza IVA + manutenzione + autista
  const costoNetto =
    costoGasolio / fattoreIva +
    pedaggio / fattoreIva +
    t.km * t.tariffe.manutenzioneKm +
    t.ore * t.tariffe.costoAutistaOra;

  const ricavo = t.prezzoTonnellata != null ? t.prezzoTonnellata * t.carico : null;
  const margine = ricavo != null ? ricavo - costoNetto : null;
  return { pedaggio, costoGasolio, costoNetto, ricavo, margine };
}


/* ======================================================================
   FINESTRA "SALVA / MODIFICA TRATTA"
   ====================================================================== */

const dialogTratta = document.getElementById('dialog-tratta');
const formTratta = document.getElementById('form-tratta');
let trattaInLavorazione = null;     // la tratta che stai salvando o modificando
let trattaEsistente = false;        // true = modifica di una tratta già salvata

// Chiamata da percorso.js quando premi "Salva tratta" su uno dei percorsi
function apriSalvaTratta(calcolo, indicePercorso) {
  const p = calcolo.percorsi[indicePercorso];
  trattaEsistente = false;
  trattaInLavorazione = {
    id: nuovoId(),
    data: new Date().toISOString().slice(0, 10),
    cliente: '',
    partenza: calcolo.partenza,
    arrivo: calcolo.arrivo,
    tappe: calcolo.tappe || [],
    trattore: calcolo.trattore,
    rimorchio: calcolo.rimorchio,
    carico: calcolo.carico,
    km: Math.round(p.km * 10) / 10,
    ore: Math.round(p.secondi / 360) / 10,                   // ore con un decimale
    litri: Math.round(p.litri * 10) / 10,
    pedaggioStimato: Math.round(p.pedaggio * 100) / 100,
    pedaggioReale: null,
    prezzoTonnellata: null,
    note: '',
    tariffe: {
      prezzoGasolio: impostazioni.prezzoGasolio,
      costoAutistaOra: impostazioni.costoAutistaOra,
      manutenzioneKm: impostazioni.manutenzioneKm,
      iva: impostazioni.iva,
    },
  };
  apriFinestraTratta('Salva tratta');
}

function apriModificaTratta(tratta) {
  trattaEsistente = true;
  trattaInLavorazione = tratta;
  apriFinestraTratta('Modifica tratta');
}

function apriFinestraTratta(titolo) {
  const t = trattaInLavorazione;
  const campi = formTratta.elements;
  document.getElementById('titolo-form-tratta').textContent = titolo;
  document.getElementById('riassunto-tratta').textContent =
    `${[t.partenza, ...(t.tappe || []), t.arrivo].join(' → ')} · ${formatoNumero(t.km, 1)} km · ${formatoNumero(t.carico, 1)} t · ` +
    `pedaggio stimato ${formatoEuro.format(t.pedaggioStimato)}`;

  campi.data.value = t.data;
  campi.cliente.value = t.cliente;
  campi.prezzoTonnellata.value = t.prezzoTonnellata ?? '';
  campi.pedaggioReale.value = t.pedaggioReale ?? '';
  campi.note.value = t.note;
  dialogTratta.showModal();
}

formTratta.addEventListener('submit', evento => {
  evento.preventDefault();
  const campi = formTratta.elements;
  const numeroOpzionale = valore => (valore.trim() === '' ? null : Number(valore));

  Object.assign(trattaInLavorazione, {
    data: campi.data.value,
    cliente: campi.cliente.value.trim(),
    prezzoTonnellata: numeroOpzionale(campi.prezzoTonnellata.value),
    pedaggioReale: numeroOpzionale(campi.pedaggioReale.value),
    note: campi.note.value.trim(),
  });

  if (!trattaEsistente) dati.tratte.push(trattaInLavorazione);
  salvaDati();
  aggiornaTutto();
  dialogTratta.close();

  if (!trattaEsistente) {
    esitoPercorso.className = 'esito';
    esitoPercorso.textContent = 'Tratta salvata: la trovi nella scheda "Tratte".';
  }
});


/* ======================================================================
   TABELLA DELLE TRATTE
   ====================================================================== */

// "Marghera, Venezia (VE)" → "Marghera (VE)": in tabella basta il paese
function nomeBreve(etichetta) {
  const provincia = etichetta.match(/\(([A-Z]{2})\)$/)?.[1];
  const primo = etichetta.split(',')[0].replace(/\s*\([A-Z]{2}\)$/, '');
  return provincia ? `${primo} (${provincia})` : primo;
}

function classeMargine(valore) {
  if (valore == null) return '';
  return valore >= 0 ? 'margine-positivo' : 'margine-negativo';
}

function euroOVuoto(valore) {
  return valore == null ? '—' : formatoEuro.format(valore);
}

function disegnaTratte() {
  const corpo = document.getElementById('tabella-tratte');
  const ordinate = [...dati.tratte].sort((a, b) => b.data.localeCompare(a.data));

  // Totali per i riquadri in alto
  const totali = { km: 0, ricavo: 0, margine: 0, conPrezzo: 0 };
  for (const t of ordinate) {
    const c = costiTratta(t);
    totali.km += t.km;
    if (c.ricavo != null) { totali.ricavo += c.ricavo; totali.margine += c.margine; totali.conPrezzo++; }
  }
  document.getElementById('riepilogo-tratte').innerHTML = `
    <div class="card ok"><strong>${ordinate.length}</strong>Tratte salvate</div>
    <div class="card da-inserire"><strong>${formatoNumero(totali.km)}</strong>Km totali</div>
    <div class="card in-scadenza"><strong>${formatoEuro.format(totali.ricavo)}</strong>Ricavo (${totali.conPrezzo} con prezzo)</div>
    <div class="card ${totali.margine >= 0 ? 'ok' : 'scaduta'}"><strong>${formatoEuro.format(totali.margine)}</strong>Margine</div>
  `;

  if (ordinate.length === 0) {
    corpo.innerHTML = `<tr><td colspan="12" class="vuoto">
      Nessuna tratta salvata. Calcola un percorso nella scheda "Percorso" e premi "Salva tratta".</td></tr>`;
    return;
  }

  corpo.innerHTML = ordinate.map(t => {
    const c = costiTratta(t);
    // Se hai inserito il pedaggio vero, mostriamo accanto la stima di HERE per confrontarle
    const pedaggio = t.pedaggioReale != null
      ? `${formatoEuro.format(t.pedaggioReale)} <span class="tenue">(HERE ${formatoEuro.format(t.pedaggioStimato)})</span>`
      : `${formatoEuro.format(t.pedaggioStimato)} <span class="tenue">stima</span>`;
    return `
      <tr>
        <td>${formattaData(t.data)}</td>
        <td>${esc(t.cliente) || '—'}</td>
        <td title="${esc([t.partenza, ...(t.tappe || []), t.arrivo].join(' → '))}">
          ${esc(nomeBreve(t.partenza))} → ${esc(nomeBreve(t.arrivo))}
          ${t.tappe?.length ? `<br><span class="tenue">via ${esc(t.tappe.map(nomeBreve).join(', '))}</span>` : ''}
        </td>
        <td>${[t.trattore, t.rimorchio].filter(Boolean).map(tg => targaHtml(tg, idDaTarga(tg))).join(' ') || '—'}</td>
        <td data-ordina="${t.km}">${formatoNumero(t.km)}</td>
        <td data-ordina="${t.carico}">${formatoNumero(t.carico, 1)}</td>
        <td data-ordina="${c.pedaggio}">${pedaggio}</td>
        <td data-ordina="${c.costoGasolio}">${formatoNumero(t.litri)} l, ${formatoEuro.format(c.costoGasolio)}</td>
        <td data-ordina="${c.costoNetto}">${formatoEuro.format(c.costoNetto)}</td>
        <td data-ordina="${c.ricavo ?? ''}">${euroOVuoto(c.ricavo)}</td>
        <td data-ordina="${c.margine ?? ''}" class="${classeMargine(c.margine)}">${euroOVuoto(c.margine)}</td>
        <td class="azioni">
          <button class="secondario piccolo" data-azione="modifica" data-id="${t.id}">Modifica</button>
          <button class="secondario piccolo pericolo" data-azione="elimina" data-id="${t.id}">Elimina</button>
        </td>
      </tr>`;
  }).join('');
}

document.getElementById('tabella-tratte').addEventListener('click', evento => {
  const pulsante = evento.target.closest('button[data-azione]');
  if (!pulsante) return;
  const tratta = dati.tratte.find(t => t.id === pulsante.dataset.id);

  if (pulsante.dataset.azione === 'modifica') apriModificaTratta(tratta);
  if (pulsante.dataset.azione === 'elimina' &&
      confirm(`Eliminare la tratta ${nomeBreve(tratta.partenza)} → ${nomeBreve(tratta.arrivo)} del ${formattaData(tratta.data)}?`)) {
    dati.tratte = dati.tratte.filter(t => t !== tratta);
    salvaDati();
    aggiornaTutto();
  }
});

disegnaTratte();
