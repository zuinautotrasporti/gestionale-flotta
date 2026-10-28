/*
  carte.js — LE CARTE CARBURANTE, tutte in un posto, divise per fornitore.

  Una carta è: { id, fornitore, numero, assegnata, scadenza, stato, note }
  "assegnata" dice a chi è data la carta, con una sola stringa:
    'mezzo:<id del mezzo>'  oppure  'autista:<id dell'autista>'  oppure  ''  (non assegnata)
  Così un campo solo può puntare a due tipi diversi di cose.

  La scadenza delle carte attive compare anche nella pagina Scadenze (vedi DOCUMENTI.carta in app.js).
  Il PIN non si salva: un gestionale non è il posto giusto.
*/

// Fornitori comuni, proposti mentre scrivi (si può scrivere anche un nome diverso)
const FORNITORI_NOTI = ['DKV', 'UTA', 'Eni', 'Q8', 'IP', 'Esso', 'Tamoil', 'Shell', 'AS24', 'Telepass'];

const dialogCarta = document.getElementById('dialog-carta');
const formCarta = document.getElementById('form-carta');
let cartaInModifica = null;


/* ---------- A chi è assegnata ---------- */

function assegnatarioHtml(assegnata) {
  const [tipo, id] = (assegnata || '').split(':');
  if (tipo === 'mezzo') {
    const m = dati.mezzi.find(x => x.id === id);
    return m ? targaHtml(m.targa, m.id) : '—';
  }
  if (tipo === 'autista') {
    const a = dati.autisti.find(x => x.id === id);
    return a ? autistaHtml(a.nome, a.id) : '—';
  }
  return '<span class="tenue">Non assegnata</span>';
}

// Il menu "Assegnata a": trattori e auto, poi autisti
function opzioniAssegnazione(attuale) {
  const mezzi = dati.mezzi.filter(m => m.tipo !== 'rimorchio' && m.stato !== 'Venduto')
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.targa.localeCompare(b.targa));
  const autisti = dati.autisti.filter(a => a.stato === 'Attivo').sort((a, b) => a.nome.localeCompare(b.nome));
  return `
    <option value="">Non assegnata</option>
    <optgroup label="Mezzi">${mezzi.map(m =>
      `<option value="mezzo:${m.id}" ${attuale === 'mezzo:' + m.id ? 'selected' : ''}>${esc(m.targa)} (${NOMI_TIPO[m.tipo].toLowerCase()})</option>`).join('')}</optgroup>
    <optgroup label="Autisti">${autisti.map(a =>
      `<option value="autista:${a.id}" ${attuale === 'autista:' + a.id ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</optgroup>`;
}


/* ---------- La pagina: un gruppo per fornitore ---------- */

function statoCartaHtml(c) {
  const classe = { Attiva: 'ok', Bloccata: 'scaduta' }[c.stato] || 'inattivo';
  let scadenza = '';
  if (c.scadenza && c.stato === 'Attiva') {
    const stato = statoScadenza(giorniMancanti(c.scadenza), DOCUMENTI.carta[0].preavviso);
    if (stato !== 'ok') scadenza = ` <span class="badge ${stato}">${ETICHETTE_STATO[stato]}</span>`;
  }
  return `<span class="badge ${classe}">${esc(c.stato)}</span>${scadenza}`;
}

function disegnaCarte() {
  const contenitore = document.getElementById('elenco-carte');
  const carte = dati.carte;

  document.getElementById('conta-carte').textContent = carte.length
    ? `${carte.filter(c => c.stato === 'Attiva').length} attive su ${carte.length}` : '';

  if (!carte.length) {
    contenitore.innerHTML = `<div class="pannello vuoto-pagina">
      <h2>Nessuna carta carburante</h2>
      <p>Aggiungi le carte con il pulsante qui sopra: le trovi divise per fornitore, con a chi sono assegnate e quando scadono.</p>
    </div>`;
    return;
  }

  // Raggruppiamo per fornitore: { DKV: [carta, carta], UTA: [...] }
  const gruppi = {};
  for (const c of carte) (gruppi[c.fornitore || 'Senza fornitore'] ??= []).push(c);

  contenitore.innerHTML = Object.keys(gruppi).sort().map(fornitore => {
    const elenco = gruppi[fornitore].sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));
    return `
      <div class="titolo-sezione">
        <h2>${esc(fornitore)} <span class="tenue">${elenco.length === 1 ? '1 carta' : elenco.length + ' carte'}</span></h2>
      </div>
      <div class="contenitore-tabella">
        <table>
          <thead><tr><th>Numero</th><th>Assegnata a</th><th>Scadenza</th><th>Stato</th><th>Note</th><th></th></tr></thead>
          <tbody>${elenco.map(c => `
            <tr class="${c.stato === 'Attiva' ? '' : 'inattivo'}">
              <td><span class="numero-carta">${esc(c.numero) || '—'}</span></td>
              <td>${assegnatarioHtml(c.assegnata)}</td>
              <td>${formattaData(c.scadenza)}</td>
              <td>${statoCartaHtml(c)}</td>
              <td>${esc(c.note) || '—'}</td>
              <td class="azioni">
                <button class="secondario piccolo" data-azione-carta="modifica" data-id="${c.id}">Modifica</button>
                <button class="secondario piccolo pericolo" data-azione-carta="elimina" data-id="${c.id}">Elimina</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }).join('');
}


/* ---------- Aggiungere e modificare ---------- */

function apriModuloCarta(carta) {
  cartaInModifica = carta;
  formCarta.reset();
  document.getElementById('titolo-form-carta').textContent = carta ? 'Modifica carta' : 'Nuova carta carburante';

  // Fornitori suggeriti: quelli noti più quelli che hai già usato
  const fornitori = [...new Set([...FORNITORI_NOTI, ...dati.carte.map(c => c.fornitore).filter(Boolean)])].sort();
  document.getElementById('elenco-fornitori').innerHTML = fornitori.map(f => `<option value="${esc(f)}">`).join('');

  const campi = formCarta.elements;
  campi.assegnata.innerHTML = opzioniAssegnazione(carta?.assegnata || '');
  if (carta) {
    for (const nome of ['fornitore', 'numero', 'scadenza', 'stato', 'note']) campi[nome].value = carta[nome] || '';
  }
  dialogCarta.showModal();
}

formCarta.addEventListener('submit', evento => {
  evento.preventDefault();
  const campi = formCarta.elements;
  const carta = {
    id: cartaInModifica?.id ?? nuovoId(),
    fornitore: campi.fornitore.value.trim(),
    numero: campi.numero.value.trim(),
    assegnata: campi.assegnata.value,
    scadenza: campi.scadenza.value,
    stato: campi.stato.value,
    note: campi.note.value.trim(),
  };
  if (cartaInModifica) dati.carte[dati.carte.indexOf(cartaInModifica)] = carta;
  else dati.carte.push(carta);
  salvaDati();
  aggiornaTutto();
  dialogCarta.close();
});

document.getElementById('btn-nuova-carta').addEventListener('click', () => apriModuloCarta(null));

document.getElementById('elenco-carte').addEventListener('click', evento => {
  const pulsante = evento.target.closest('[data-azione-carta]');
  if (!pulsante) return;
  const carta = dati.carte.find(c => c.id === pulsante.dataset.id);
  if (pulsante.dataset.azioneCarta === 'modifica') apriModuloCarta(carta);
  if (pulsante.dataset.azioneCarta === 'elimina' && confirm(`Eliminare la carta ${carta.fornitore} ${carta.numero}?`)) {
    dati.carte = dati.carte.filter(c => c !== carta);
    salvaDati();
    aggiornaTutto();
  }
});

disegnaCarte();
