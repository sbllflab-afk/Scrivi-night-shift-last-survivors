# NIGHT SHIFT — LAST SURVIVORS

**Survival horror multiplayer 3D in prima persona, 4 sopravvissuti contro 1 animatronico originale. Versione 1.1 con controlli touch e ottimizzazioni smartphone.**

Gioco originale, ispirato alle *meccaniche* degli horror asimmetrici: nessun modello, personaggio o asset protetto copiato da Roblox o da altri videogiochi.

## Giocare online su Render (hosting gratuito)

**Il gioco già online si aggiorna tramite GitHub.** Leggi `AGGIORNAMENTO_RENDER.md` per mantenere intatta la tua configurazione Render esistente.

Questa versione include il file **`render.yaml`** per il deploy su Render come servizio Node.js nella regione di Francoforte. **Consulta `RENDER_GUIDA.md` per la procedura completa GitHub → Render**. Non usare lo Static Site, perché il gioco richiede un server multiplayer.

## Come giocare su Windows

1. Estrai l'intero ZIP in una cartella (non eseguire i file dentro lo ZIP).
2. Installa [Node.js LTS](https://nodejs.org/) (Node 20 o superiore).
3. Fai doppio clic su **`AVVIA_WINDOWS.bat`**. Al primo avvio, il programma installa automaticamente Express, Socket.IO e Three.js via npm: serve Internet.
4. Quando compare `Apri http://localhost:3000`, visita **http://localhost:3000** con Chrome, Edge o Firefox su un PC dotato di accelerazione 3D.
5. Inserisci il tuo nome, premi **CREA UNA STANZA**, scegli la preferenza di ruolo, lascia attivi i bot se vuoi provare il gioco da solo e premi **INIZIA LA NOTTE**.
6. Premi **ENTRA NELLA NOTTE** per agganciare il mouse e cominciare.

### Avvio manuale (Windows, Linux, macOS)

```bash
npm install
npm start
```

Porta predefinita `3000`. Per modificarla, imposta la variabile di ambiente `PORT` (per esempio `PORT=8080 npm start` su Linux/macOS oppure `set PORT=8080` prima di `npm start` su Windows CMD).

## Multiplayer: stesso PC, rete locale, Internet

Ogni giocatore usa **il proprio computer** e il proprio browser, connesso allo **stesso server**. Non è uno split-screen.

- **Stesso computer, per fare un test:** apri due schede su `http://localhost:3000` (ogni scheda può entrare con un nome diverso). Potresti dover cliccare sulla scheda prima di controllare il personaggio; le schede in secondo piano possono rallentare.
- **Rete locale:** usa `http://IP-DEL-COMPUTER-SERVER:3000` su tutti i PC collegati allo stesso Wi-Fi/LAN. Consenti `node.exe` nel firewall di Windows, se richiesto.
- **Amici via Internet:** pubblica il progetto su un servizio che esegue applicazioni Node.js con connessioni WebSocket, oppure su un tuo VPS. Condividi l'URL HTTPS pubblico e il codice di stanza (o il link generato dal pulsante **COPIA INVITO**). Avviare il server solo su `localhost` **non** lo rende accessibile da Internet. Se usi il tuo PC come server, occorrono un indirizzo raggiungibile e la configurazione di router/firewall/HTTPS appropriata.

Non è necessario installare Roblox. Il server gestisce fisicamente i personaggi, collisioni, obiettivi, attacchi, timer e vittorie; i browser disegnano la grafica 3D e inviano i controlli. La partita continua anche se un giocatore sblocca il mouse.

## Meccaniche

**Sopravvissuti**: fino a 4, 2 punti salute, torcia elettrica, corsa con stamina (si esaurisce e si rigenera), accovacciamento, riparazione dei generatori tenendo premuto `E`, cura dei compagni feriti tenendo `E`, e fuga da una delle 2 uscite. Ci sono 6 generatori e ne servono 4 per aprire le uscite. A quel punto, tieni premuto `E` al portale per 3 secondi per scappare. I sopravvissuti vincono se almeno uno riesce a fuggire prima dell'alba.

**Assassino — THE WARDEN**: un animatronico originale dalla silhouette industriale, con attacco ravvicinato (click sinistro o barra spaziatrice) e abilità sonar (`Q`) che rivela temporaneamente i superstiti sulla mappa. Vince se nessuno riesce a fuggire. Ha velocità e vantaggi asimmetrici rispetto agli altri.

**Bot**: sono gestiti direttamente dal server. Se mancano persone, i bot completano i posti fino a 5. I bot superstiti cercano i generatori e le uscite e fuggono dal cacciatore; il bot cacciatore insegue, attacca e usa il sonar. Puoi testare una partita con 1 solo umano più 4 bot.

**Durata del turno**: 7 minuti (420 secondi). Stanza privata di 5 persone massimo.

### Comandi per smartphone (Android / iPhone)

Apri **lo stesso link pubblico di Render** direttamente dal telefono; non serve installare un'app.
Sono supportati anche schermi verticali, ma **la modalità orizzontale (landscape) è consigliata**.

- Tocca **TOCCA PER GIOCARE** all'inizio della partita.
- **Joystick a sinistra:** cammina con velocità analogica, anche in diagonale.
- **Scorri con un altro dito sullo schermo:** gira la telecamera e guarda in alto/basso.
- **CORRI:** tieni premuto per correre (consuma stamina); **TIENI E USA:** tieni premuto per riparare, curare o fuggire.
- **GIÙ:** attiva/disattiva accovacciamento; **TORCIA:** accende/spegne la luce.
- Se sei il cacciatore, appaiono **ATTACCA** (si può tenere premuto) e **SONAR**.
- **MAPPA** mostra/nasconde la minimappa, **PAUSA** apre il pannello con il cursore per la sensibilità visuale.
- Su Android/iOS, se passi ad altre app o metti in secondo piano la scheda, i comandi vengono rilasciati per evitare che il personaggio continui a camminare da solo. La partita online prosegue.
- I comandi desktop rimangono funzionanti. In caso di breve disconnessione o aggiornamento della pagina, il server tenta di ripristinare automaticamente la stanza e il personaggio. Se tutti escono, la stanza rimane recuperabile per circa 3 minuti; i riavvii del servizio Render continuano invece ad azzerare la memoria.

### Comandi

| Tasto | Funzione |
|---|---|
| `W A S D` | Movimento |
| `Mouse` | Visuale in prima persona |
| `Shift` | Corsa |
| `Ctrl` | Accovacciati (sopravvissuto) |
| `E` (tieni premuto) | Ripara / cura / scappa |
| `F` | Accendi/spegni la torcia (sopravvissuto) |
| `Click sinistro` o `Spazio` | Attacco (cacciatore) |
| `Q` | Sonar (cacciatore) |
| `M` | Mostra/nascondi il radar |
| `Tab` | Elenco giocatori |
| `Esc` | Sblocca mouse e apri menu pausa |

## Struttura del progetto

```text
night-shift-last-survivors/
├── AVVIA_WINDOWS.bat          # Avvio facile su Windows
├── Dockerfile                 # Immagine per server cloud
├── package.json               # Librerie e comandi
├── server.js                  # Multiplayer, bot, collisioni, combattimento e regole
├── public/
│   ├── index.html             # Menu, lobby, HUD e risultati
│   ├── style.css              # Grafica dell'interfaccia
│   ├── game.js                # Scena Three.js, animatronico, input touch e audio
│   ├── controls.js            # Matematica dei comandi PC e joystick touch
│   └── world.js               # Mappa e movimento condivisi
└── tests/
    └── world.test.js          # Test automatici della mappa
```

### Hosting online tramite Docker

Il `Dockerfile` usa Node 22 Alpine, installa le dipendenze ed espone la porta 3000. Puoi usarlo su un VPS o su una piattaforma di hosting per container con WebSocket supportati. Adotta HTTPS per condividere un URL pubblico con gli amici. La gestione delle stanze è in memoria: se riavvii il server, le partite in corso si perdono. Per scalare a più istanze serve aggiungere uno store/adapter distribuito; questa versione gestisce un singolo server.

### Risoluzione dei problemi

- **Schermo nero**: verifica che il PC supporti WebGL 2, attiva l'accelerazione hardware del browser e controlla la console del browser (`F12`).
- **La libreria non si installa**: chiudi il gioco, verifica la connessione e ripeti `npm install` nella cartella; la prima installazione richiede Internet.
- **Gli amici non si collegano**: non inviare `localhost`: devono aprire l'indirizzo IP LAN o l'URL HTTPS pubblico del server.
- **Non riesci a muoverti**: nella schermata di pausa premi *ENTRA NELLA NOTTE* e consenti il blocco del puntatore. `Esc` lo sblocca.
- **Il mouse sparisce**: durante il gioco è normale; premi `Esc` per riaverlo.
- **Prestazioni basse**: riduci lo zoom del browser e chiudi schede pesanti; la grafica è renderizzata sulla GPU del computer, non sul server.

## Note tecniche

La scena, i personaggi, il mostro, i macchinari e l'illuminazione sono composti proceduralmente in Three.js, senza bisogno di modelli 3D o texture a pagamento. I suoni sono sintetizzati tramite Web Audio API. Usa la classe `AudioMachine` per controllare l'audio o disattivarlo nel menu pausa.

La simulazione server gira a ~20 Hz, gli aggiornamenti multiplayer vengono inviati a ~10 Hz e il browser interpola i giocatori remoti; il movimento locale è predetto per ridurre la sensazione di latenza. Il gioco funziona con una singola istanza server Node.js.
