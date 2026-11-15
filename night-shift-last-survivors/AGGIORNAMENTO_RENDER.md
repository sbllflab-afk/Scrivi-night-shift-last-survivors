# NIGHT SHIFT 1.1 — aggiornamento del sito già online

Il gioco è già pubblicato su:
https://night-shift-last-survivors.onrender.com/

Repository GitHub in uso:
https://github.com/sbllflab-afk/Scrivi-night-shift-last-survivors

## Passaggi semplici

1. **Non creare un altro servizio Render.** Usa quello già funzionante.
2. Scarica lo ZIP v1.1 ed estrailo sul PC.
3. Apri GitHub → repository `Scrivi-night-shift-last-survivors` → cartella `night-shift-last-survivors`.
4. Carica i file aggiornati e la cartella `public`, mantenendo esattamente la struttura mostrata qui sotto. I file esistenti vanno **sostituiti**, non duplicati dentro una nuova sottocartella.
5. Conferma le modifiche con **Commit changes**. Render, se ha Auto Deploy abilitato, inizia automaticamente a pubblicarle; in alternativa vai al servizio Render e usa **Manual Deploy → Deploy latest commit**.
6. Aspetta che lo stato del nuovo deploy sia **Live**. Su PC e telefono aggiorna la pagina; su mobile chiudi eventualmente la vecchia scheda e riaprila, se conserva la vecchia versione.

## Struttura corretta su GitHub

```
Scrivi-night-shift-last-survivors/       ← repository
└── night-shift-last-survivors/         ← cartella già esistente
    ├── render.yaml                    ← contiene rootDir: night-shift-last-survivors
    ├── package.json
    ├── server.js                       ← modificato
    ├── public/
    │   ├── index.html                 ← modificato
    │   ├── game.js                    ← modificato
    │   ├── controls.js                ← NUOVO: indispensabile!
    │   ├── style.css                  ← modificato
    │   └── world.js
    └── tests/
        └── controls.test.js           ← NUOVO
```

**Importante:** carica *controls.js* insieme ai file aggiornati; senza di esso l'import JavaScript di `game.js` fallisce.

## Collaudo sullo smartphone

- Apri l'indirizzo del gioco da Chrome Android o Safari iPhone, preferibilmente in orizzontale.
- Crea una stanza e inizia una partita con bot.
- Tocca `TOCCA PER GIOCARE`.
- Muoviti con il joystick in basso a sinistra e ruota la visuale facendo scorrere un altro dito sulla scena 3D.
- Prova `TIENI USA` vicino a un generatore, `CORRI` mentre avanzi e `TORCIA`.
- Seleziona `ASSASSINO` nella lobby per verificare `ATTACCA` e `SONAR`.
- Per provare il vero multiplayer, entra nella **stessa stanza** da un secondo telefono con un nome diverso.

## Note

Le stanze sono ancora conservate nella memoria del servizio Render: un riavvio o un nuovo deploy azzera le partite già iniziate. Il ripristino dopo una breve perdita di rete aiuta soltanto finché la stanza è rimasta sullo stesso server.

La versione v1.1 è stata verificata con test di sintassi e test automatici su controlli, collisioni e mappa. L'esperienza 3D completa su dispositivi fisici deve essere verificata dopo il deploy.
