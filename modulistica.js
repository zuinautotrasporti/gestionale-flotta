/*
  modulistica.js — I DOCUMENTI DI USO QUOTIDIANO: certificati di lavaggio, buoni di carico, DDT...

  Sono allegati (allegati.js) con proprietario { tipo: 'modulistica' } e due campi in più:
  il titolo (es. "Certificato lavaggio cisterna") e il cliente a cui servono.
  Da qui si aprono, si stampano e si scaricano.
*/

const dialogModulo = document.getElementById('dialog-modulo');
const formModulo = document.getElementById('form-modulo');
const filtroCliente = document.getElementById('filtro-cliente-modulistica');

// I clienti già usati (modulistica e tratte salvate), per suggerirli mentre scrivi e per il filtro
function clientiNoti() {
  return [...new Set([
    ...allegatiDi('modulistica').map(a => a.cliente),
    ...dati.tratte.map(t => t.cliente),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function disegnaModulistica() {
  const tutti = allegatiDi('modulistica');

  // Menu del filtro: teniamo la scelta fatta, se il cliente esiste ancora
  const scelto = filtroCliente.value;
  const clienti = [...new Set(tutti.map(a => a.cliente).filter(Boolean))].sort();
  filtroCliente.innerHTML = '<option value="">Tutti i clienti</option>' +
    clienti.map(c => `<option ${c === scelto ? 'selected' : ''}>${esc(c)}</option>`).join('') +
    (tutti.some(a => !a.cliente) ? `<option value="-" ${scelto === '-' ? 'selected' : ''}>Senza cliente</option>` : '');

  const visibili = tutti
    .filter(a => !filtroCliente.value || (filtroCliente.value === '-' ? !a.cliente : a.cliente === filtroCliente.value))
    .sort((a, b) => (a.cliente || '￿').localeCompare(b.cliente || '￿') || a.titolo.localeCompare(b.titolo));

  const corpo = document.getElementById('tabella-modulistica');
  if (!tutti.length) {
    corpo.innerHTML = `<tr><td colspan="5" class="vuoto">Nessun documento. Con «Carica documento» aggiungi
      certificati di lavaggio, buoni di carico e tutto quello che ti serve ogni giorno.</td></tr>`;
    return;
  }

  // Le righe hanno data-id-allegato: i pulsanti Apri/Stampa/Scarica/✕ li gestisce allegati.js
  corpo.innerHTML = visibili.map(a => `
    <tr data-id-allegato="${a.id}">
      <td><strong>${esc(a.titolo)}</strong><br><span class="tenue">${esc(a.nomeFile)}</span></td>
      <td>${esc(a.categoria)}</td>
      <td>${esc(a.cliente) || '—'}</td>
      <td>${formattaData(a.caricato)}</td>
      <td class="azioni">
        <button type="button" class="secondario piccolo" data-azione-file="apri">Apri</button>
        <button type="button" class="piccolo" data-azione-file="stampa">Stampa</button>
        <button type="button" class="secondario piccolo" data-azione-file="scarica">Scarica</button>
        <button type="button" class="secondario piccolo pericolo" data-azione-file="elimina" aria-label="Elimina">✕</button>
      </td>
    </tr>`).join('');
}

function apriModuloModulistica() {
  formModulo.reset();
  const campi = formModulo.elements;
  campi.categoria.innerHTML = CATEGORIE_ALLEGATI.modulistica.map(c => `<option>${esc(c)}</option>`).join('');
  document.getElementById('elenco-clienti').innerHTML = clientiNoti().map(c => `<option value="${esc(c)}">`).join('');
  // Se stai guardando un cliente, lo proponiamo già
  if (filtroCliente.value && filtroCliente.value !== '-') campi.cliente.value = filtroCliente.value;
  document.getElementById('esito-modulo').textContent = '';
  dialogModulo.showModal();
}

// Scegliendo il file, se il titolo è vuoto lo riempiamo con il nome del file
formModulo.elements.file.addEventListener('change', () => {
  const campi = formModulo.elements;
  const file = campi.file.files[0];
  if (file && !campi.titolo.value.trim()) campi.titolo.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
});

formModulo.addEventListener('submit', async evento => {
  evento.preventDefault();
  const campi = formModulo.elements;
  const pulsante = formModulo.querySelector('button[type=submit]');
  pulsante.disabled = true;
  try {
    await aggiungiAllegato({ tipo: 'modulistica' }, campi.categoria.value, campi.file.files[0], {
      titolo: campi.titolo.value.trim(),
      cliente: campi.cliente.value.trim(),
    });
    dialogModulo.close();
    aggiornaTutto();
  } catch (errore) {
    document.getElementById('esito-modulo').textContent = errore.message;
  }
  pulsante.disabled = false;
});

document.getElementById('btn-nuovo-modulo').addEventListener('click', apriModuloModulistica);
filtroCliente.addEventListener('change', aggiornaTutto);
document.addEventListener('allegati-cambiati', aggiornaTutto);

disegnaModulistica();
