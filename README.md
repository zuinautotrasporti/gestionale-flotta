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
| `cloud.js` | collegamento al database Supabase: accesso, sincronizzazione, file |
| `database/schema.sql` | struttura del database e regole di accesso (da eseguire in Supabase) |

## Dove stanno i dati

I dati stanno nel database **Supabase** (server in UE, Francoforte): tabella `record` per i dati,
archivio privato `file` per foto e documenti. Si entra con email e password, e solo le email presenti
nella tabella `autorizzati` possono leggere o scrivere (regole RLS in `database/schema.sql`).

Il browser tiene una copia di lavoro, così l'app funziona anche senza segnale: le modifiche partono
appena torna la connessione. La chiave HERE resta solo sul dispositivo e non va sul database.

Non caricare qui file Excel, backup o documenti: contengono dati personali.
