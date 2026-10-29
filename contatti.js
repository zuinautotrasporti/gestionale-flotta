/*
  contatti.js — IL BIGLIETTO DA VISITA dell'azienda.

  I dati stanno in dati.contatti (quindi finiscono anche nel backup) e da lì si ricavano:
    - l'anteprima del biglietto
    - il TESTO semplice, per WhatsApp e SMS
    - la versione GRAFICA (HTML) da incollare in un'email
    - il file .vcf (vCard): il formato standard delle rubriche di telefoni e computer

  Stesso principio di sempre: i dati si scrivono una volta, tutto il resto si calcola.
*/

dati.contatti = dati.contatti || {};

const formContatti = document.getElementById('form-contatti');
const CAMPI_CONTATTI = ['ragioneSociale', 'attivita', 'referente', 'ruolo', 'telefono', 'cellulare',
                        'email', 'pec', 'indirizzo', 'piva', 'sito'];

// I dati di oggi, con la ragione sociale presa dalle impostazioni se non l'hai ancora scritta
function contattiAttuali() {
  return { ragioneSociale: impostazioni.nomeAzienda || 'ZUIN AUTOTRASPORTI SRL', ...dati.contatti };
}

// Le righe del biglietto, nell'ordine in cui compaiono. Quelle vuote vengono scartate.
function righeContatti(c) {
  return [
    ['Tel.', c.telefono],
    ['Cell.', c.cellulare],
    ['Email', c.email],
    ['PEC', c.pec],
    ['Sede', c.indirizzo],
    ['P.IVA', c.piva],
    ['Web', c.sito],
  ].filter(([, valore]) => valore);
}


/* ======================================================================
   1. TESTO SEMPLICE (WhatsApp, SMS)
   ====================================================================== */

function testoBiglietto(c) {
  return [
    c.ragioneSociale,
    c.attivita,
    '',
    [c.referente, c.ruolo].filter(Boolean).join(' – '),
    ...righeContatti(c).map(([etichetta, valore]) => `${etichetta} ${valore}`),
  ]
    .filter((riga, i, tutte) => riga !== '' || (tutte[i - 1] && tutte[i + 1]))   // niente righe vuote inutili
    .join('\n')
    .trim();
}


/* ======================================================================
   2. VERSIONE GRAFICA (anteprima ed email)
   ====================================================================== */

// Gli stili sono scritti DENTRO l'HTML ("inline") perché i programmi di posta ignorano i fogli di stile.
// La tabella non è per i dati: è il modo più sicuro per impaginare nelle email.
function htmlBiglietto(c, conLogo) {
  const BLU = '#1F3A5F';
  // Online il logo ha un indirizzo web pubblico: così lo vede anche il cliente che riceve l'email.
  // Aperta dal PC come file, invece, l'immagine starebbe solo sul tuo computer: nell'email non la mettiamo.
  const indirizzoLogo = location.protocol === 'https:' ? new URL('logo.png', location.href).href : (conLogo ? 'logo.png' : '');
  const logo = indirizzoLogo && document.querySelector('.barra-alta .logo:not([hidden])')
    ? `<img src="${indirizzoLogo}" alt="" width="64" height="64" onerror="this.remove()" style="height:64px;width:64px;object-fit:contain;margin-right:12px;vertical-align:middle">`
    : '';
  const persona = [c.referente, c.ruolo].filter(Boolean).map(esc).join(' – ');
  const righe = righeContatti(c).map(([etichetta, valore]) => {
    let mostrato = esc(valore);
    if (etichetta === 'Email' || etichetta === 'PEC') mostrato = `<a href="mailto:${esc(valore)}" style="color:${BLU};text-decoration:none">${esc(valore)}</a>`;
    if (etichetta === 'Tel.' || etichetta === 'Cell.') mostrato = `<a href="tel:${esc(valore.replace(/\s/g, ''))}" style="color:#1C2730;text-decoration:none">${esc(valore)}</a>`;
    return `<tr><td style="color:#5F6E7A;padding:2px 12px 2px 0;white-space:nowrap;vertical-align:top">${etichetta}</td>
            <td style="color:#1C2730;padding:2px 0">${mostrato}</td></tr>`;
  }).join('');

  return `
<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;border-left:4px solid ${BLU};background:#ffffff">
  <tr><td style="padding:14px 18px 10px">
    ${logo}<span style="font-size:18px;font-weight:bold;color:${BLU};letter-spacing:0.02em;vertical-align:middle">${esc(c.ragioneSociale)}</span>
    ${c.attivita ? `<div style="color:#5F6E7A;font-size:13px;margin-top:2px">${esc(c.attivita)}</div>` : ''}
  </td></tr>
  ${persona ? `<tr><td style="padding:0 18px 8px;font-weight:bold;color:#1C2730">${persona}</td></tr>` : ''}
  ${righe ? `<tr><td style="padding:0 18px 14px"><table cellpadding="0" cellspacing="0" style="font-size:14px">${righe}</table></td></tr>` : ''}
</table>`.trim();
}

function disegnaBiglietto() {
  const c = contattiAttuali();
  document.getElementById('biglietto').innerHTML = htmlBiglietto(c, true);
  const vuoto = righeContatti(c).length === 0 && !c.referente;
  document.getElementById('esito-contatti').textContent = vuoto ? 'Aggiungi almeno un telefono o un\'email.' : '';
}


/* ======================================================================
   3. vCard (.vcf) — il cliente lo apre e ti salva in rubrica
   ====================================================================== */

function vcardBiglietto(c) {
  // Nel formato vCard virgole e punti e virgola vanno "protetti" con una barra rovesciata
  const v = testo => String(testo || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1');
  const [nome, ...cognome] = (c.referente || '').trim().split(/\s+/);
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${v(cognome.join(' '))};${v(nome)};;;`,
    `FN:${v(c.referente || c.ragioneSociale)}`,
    `ORG:${v(c.ragioneSociale)}`,
    c.ruolo && `TITLE:${v(c.ruolo)}`,
    c.telefono && `TEL;TYPE=WORK,VOICE:${c.telefono}`,
    c.cellulare && `TEL;TYPE=CELL:${c.cellulare}`,
    c.email && `EMAIL;TYPE=INTERNET,WORK:${c.email}`,
    c.pec && `EMAIL;TYPE=INTERNET:${c.pec}`,
    c.indirizzo && `ADR;TYPE=WORK:;;${v(c.indirizzo)};;;;`,
    c.sito && `URL:${c.sito}`,
    c.piva && `NOTE:P.IVA ${v(c.piva)}${c.pec ? ' - PEC ' + v(c.pec) : ''}`,
    'END:VCARD',
  ].filter(Boolean).join('\r\n');
}


/* ======================================================================
   4. PULSANTI
   ====================================================================== */

function avvisaCopia(messaggio) {
  const esito = document.getElementById('esito-copia');
  esito.textContent = messaggio;
  clearTimeout(avvisaCopia.timer);
  avvisaCopia.timer = setTimeout(() => { esito.textContent = ''; }, 4000);
}

// Copia "vecchio stile": seleziona un elemento nascosto e usa il comando Copia del browser.
// Serve come riserva se il browser non permette gli appunti moderni.
function copiaConSelezione(elemento) {
  elemento.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(elemento);
  const selezione = getSelection();
  selezione.removeAllRanges();
  const intervallo = document.createRange();
  intervallo.selectNodeContents(elemento);
  selezione.addRange(intervallo);
  const riuscito = document.execCommand('copy');
  selezione.removeAllRanges();
  elemento.remove();
  return riuscito;
}

document.getElementById('btn-copia-testo').addEventListener('click', async () => {
  const testo = testoBiglietto(contattiAttuali());
  try {
    await navigator.clipboard.writeText(testo);
  } catch {
    const area = document.createElement('pre');
    area.textContent = testo;
    if (!copiaConSelezione(area)) return avvisaCopia('Il browser non ha permesso di copiare.');
  }
  avvisaCopia('Testo copiato: incollalo in WhatsApp o in un messaggio.');
});

document.getElementById('btn-copia-biglietto').addEventListener('click', async () => {
  const c = contattiAttuali();
  const html = htmlBiglietto(c, false);   // il logo c'è solo se l'app è online (vedi htmlBiglietto)
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([testoBiglietto(c)], { type: 'text/plain' }),
    })]);
  } catch {
    const contenitore = document.createElement('div');
    contenitore.innerHTML = html;
    if (!copiaConSelezione(contenitore)) return avvisaCopia('Il browser non ha permesso di copiare.');
  }
  avvisaCopia('Biglietto copiato: incollalo nel testo di un\'email.');
});

document.getElementById('btn-vcard').addEventListener('click', () => {
  const c = contattiAttuali();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([vcardBiglietto(c)], { type: 'text/vcard' }));
  link.download = `${(c.ragioneSociale || 'contatto').replace(/[^\w]+/g, '_')}.vcf`;
  link.click();
  URL.revokeObjectURL(link.href);
});

// "Condividi" esiste solo dove il sistema lo offre (soprattutto sui telefoni): altrimenti il pulsante resta nascosto
const pulsanteCondividi = document.getElementById('btn-condividi');
if (navigator.share) {
  pulsanteCondividi.hidden = false;
  pulsanteCondividi.addEventListener('click', async () => {
    const c = contattiAttuali();
    try {
      await navigator.share({ title: c.ragioneSociale, text: testoBiglietto(c) });
    } catch { /* condivisione annullata: niente da fare */ }
  });
}


/* ======================================================================
   5. MODULO: si salva da solo mentre scrivi
   ====================================================================== */

function mostraContatti() {
  const c = contattiAttuali();
  for (const nome of CAMPI_CONTATTI) formContatti.elements[nome].value = c[nome] || '';
  disegnaBiglietto();
}

formContatti.addEventListener('input', () => {
  for (const nome of CAMPI_CONTATTI) dati.contatti[nome] = formContatti.elements[nome].value.trim();
  salvaDati();
  disegnaBiglietto();
});
formContatti.addEventListener('submit', evento => evento.preventDefault());

mostraContatti();
