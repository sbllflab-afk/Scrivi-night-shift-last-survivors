# NIGHT SHIFT v1.2 — correzione del personaggio bloccato

## Il difetto reale

Nel server v1.1 la formula del movimento orizzontale conteneva `Math.cos(p.y)` invece di `Math.cos(p.yaw)`. `p.y` non esisteva: questo produceva `NaN` e poteva danneggiare la posizione di un giocatore.

Inoltre client e server avevano convenzioni diverse per il segno dell'angolo della telecamera: dopo aver ruotato la visuale, l'avanzamento poteva andare verso la direzione opposta.

## Le correzioni

- Movimento condiviso con `movementDelta` tra server e browser, con direzioni allineate alla telecamera Three.js.
- Protezione da coordinate numeriche non valide nelle collisioni.
- Rotazione corretta anche per i bot cacciatori e per l'attacco.
- Radar allineato alla visuale.
- Comandi touch attivi automaticamente dopo l'inizio della partita.
- Indicatore di movimento su schermo per capire se il joystick è attivo o il personaggio è davanti a un muro.
- Risorse aggiornate con query `?v=12` per ridurre il rischio di caricare vecchio codice dalla cache.

## Verifiche

- 19 test automatici: movimento avanti/dietro, destra/sinistra, diagonali, sterzata, geometria, collisioni e NaN.
- Smoke test dell'effettivo `server.js` con socket simulati: il giocatore si sposta avanti, dopo la rotazione di 90° va verso destra, tornando indietro ripercorre la strada, con coordinate finite.
- Prova fisica sul telefono e partita completa con dispositivi reali ancora da effettuare dopo la pubblicazione.

## Pubblicazione

Carica le nuove versioni **insieme** su GitHub, nello stesso repository e nella stessa cartella già usati (vedi `AGGIORNAMENTO_RENDER.md`). Il file `render.yaml` resta invariato: non creare un nuovo server. Dopo che Render segnala `Live`, chiudi la vecchia scheda del telefono e riapri il link.
