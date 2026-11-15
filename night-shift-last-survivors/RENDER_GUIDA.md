# NIGHT SHIFT — LAST SURVIVORS: pubblicazione su Render (piano Free)

Questa cartella è **pronta per Render**: contiene `render.yaml`, il backend Node.js/Socket.IO, il client Three.js e tutti gli asset del gioco. Render ospita il server multiplayer e distribuisce la pagina web dallo stesso servizio. Non serve aprire porte del router domestico.

## 1. Carica i file su GitHub

1. Accedi a https://github.com e premi **New repository**.
2. Nome consigliato: `night-shift-last-survivors`. Può essere **Private** se colleghi GitHub a Render e concedi l'accesso al repository. Se non hai esigenze particolari, puoi anche usare **Public**.
3. Crea il repository, poi scegli **Add file > Upload files**.
4. **Estrai lo ZIP** e carica il **contenuto** della cartella `night-shift-last-survivors/`: `server.js`, `package.json`, `render.yaml`, `public/`, ecc. Non caricare soltanto lo ZIP. Alla fine, `render.yaml` e `package.json` devono comparire nella radice del repository.
5. Conferma il commit con **Commit changes**.

## 2. Crea un servizio su Render

Metodo consigliato con render.yaml:

1. Accedi a https://dashboard.render.com
2. Fai **New > Blueprint** e collega GitHub.
3. Seleziona il repository `night-shift-last-survivors`.
4. Render leggerà `render.yaml` e proporrà un **Web Service** Node.js, piano **Free**, regione **Frankfurt**, con health check `/health`.
5. Conferma la creazione e attendi che il deploy risulti **Live**.

Alternativa con **New > Web Service** (senza Blueprint):

| Campo | Valore |
|---|---|
| Repository | `night-shift-last-survivors` |
| Runtime / Language | Node |
| Branch | `main` (o ramo predefinito) |
| Region | Frankfurt |
| Instance Type | Free |
| Build Command | `npm install --omit=dev --no-audit --no-fund` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

**Non creare uno Static Site**: il gioco ha un server multiplayer Node.js, quindi serve un **Web Service**.

## 3. Gioca online

1. Apri l'URL pubblico assegnato da Render, ad esempio `https://nome-scelto.onrender.com` (l'indirizzo reale sarà visibile nel dashboard).
2. Controlla `https://NOME-REALE.onrender.com/health`: deve restituire un oggetto JSON con `"ok": true`.
3. Sul sito del gioco scegli **CREA UNA STANZA**.
4. Condividi l'URL del gioco e il **codice stanza** agli altri giocatori: ciascuno entra dal proprio browser. È supportato fino a **5 persone per stanza** (un cacciatore, quattro sopravvissuti); puoi attivare i bot per riempire i posti vacanti.
5. Il capostanza avvia la partita.

## 4. Note importanti sul piano gratuito

- Dopo **15 minuti senza richieste o messaggi WebSocket in ingresso**, il servizio Free può addormentarsi. Il primo accesso successivo può richiedere circa un minuto. Le partite attive che trasmettono input mantengono traffico WebSocket.
- Render può riavviare l'istanza in altri momenti. **Stanze, partite e punteggi sono solo in memoria**: un riavvio li azzera. Se cade la connessione durante una partita, il giocatore non rientra automaticamente nella stessa stanza.
- Le istanze Free hanno limiti di CPU/RAM e ore gratuite per workspace; 5 utenti in una stanza è l'obiettivo progettuale, **non** una garanzia di fluidità né di numero di stanze simultanee. Per l'uso tra pochi amici, è una buona piattaforma per provare.
- Render termina HTTPS e gestisce WebSocket; non devi configurare certificati o porte sulla tua rete di casa.
- Non pubblicare credenziali in GitHub. Il gioco non richiede password o API key.

## 5. Diagnostica

- **Il deploy fallisce:** guarda i log di Render; verifica che `package.json`, `server.js` e `render.yaml` siano nella root, `public/` presente e build/start corrispondano a quelli sopra.
- **Pagina vuota:** apri `/health`; se il server risponde, verifica da F12 del browser la connessione del modulo Three.js.
- **La lobby non funziona:** verifica il WebSocket Socket.IO nella scheda Network del browser e che si stia usando un **Web Service**.
- **Il codice stanza non viene trovato:** tutti devono aprire **lo stesso dominio** e la stanza deve essere ancora presente nella memoria del server.
- **La pagina impiega a caricarsi:** potrebbe trattarsi della riattivazione dall'inattività di Render Free.

Documentazione ufficiale:
- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
- https://render.com/docs/websocket
