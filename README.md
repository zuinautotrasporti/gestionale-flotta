# Gestionale Flotta – ZUIN AUTOTRASPORTI SRL

Web app per la gestione della flotta: scadenze di mezzi, autisti e carte carburante,
documenti caricati, calcolo dei percorsi per camion (con pedaggi), tratte e margini, modulistica.

## Come è fatta

È una pagina web semplice, senza server: HTML, CSS e JavaScript.

| File | Cosa fa |
|---|---|
| `index.html` | la struttura delle pagine |
| `style.css` | l'aspetto grafico |
| `app.js` | dati, regole delle scadenze, mezzi e autisti |
| `ui.js` | panoramica, schede, ricerca e ordinamento, versione per telefono |
| `import-excel.js` | importazione dal file Excel |
| `percorso.js` | calcolo dei percorsi con HERE |
| `tratte.js` | tratte salvate, costi e margini |
| `foto.js` | foto dei mezzi |
| `allegati.js` | documenti caricati (PDF e immagini) |
| `carte.js` | carte carburante |
| `modulistica.js` | documenti di uso quotidiano |
| `contatti.js` | biglietto da visita |

## Dove stanno i dati

I dati **non** sono in questo progetto: restano nel browser di chi usa l'app
(localStorage per i dati, IndexedDB per foto e documenti). Anche la chiave HERE resta nel browser.
Per spostarli da un dispositivo all'altro si usa *Dati e impostazioni → Esporta / Importa backup*.

Non caricare qui file Excel, backup o documenti: contengono dati personali.
