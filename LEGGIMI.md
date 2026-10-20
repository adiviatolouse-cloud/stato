# La pagina dello stato: stato.adigela.it

Una pagina piccola che **resta su anche quando il NAS è spento**, salta la
corrente o cade internet di casa. Dice a chi apre il sito se funziona o no, da
quando, e che cosa fare intanto (la diretta resta su YouTube, riprova fra
qualche minuto, gli orari dei culti).

Non sta sul NAS: sta su **GitHub Pages**, in un repository **pubblico** a parte
che si chiama «stato» (le pagine di GitHub dai repository privati vogliono il
piano a pagamento). Ogni 10 minuti circa GitHub, da solo, chiede al sito se
risponde e riscrive la pagina. Non costa niente e non serve nessuna chiave.

> I nomi dei menu e le regole dei domini qui sotto li ho controllati il
> **20 ottobre 2026** sulla guida ufficiale di GitHub (docs.github.com, nella
> versione del 19 ottobre 2026). Se fra qualche mese un nome è cambiato, il
> posto è lo stesso.

## Che cosa c'è in questa cartella

| File | Dove va | A che cosa serve |
|---|---|---|
| `controlla.mjs` | nel repository «stato», in cima | chiede al sito come sta e scrive la pagina |
| `workflow-stato.yml` | nel repository «stato», come `.github/workflows/stato.yml` | dice a GitHub di far girare il controllo ogni 10 minuti |
| `LEGGIMI.md` | resta qui in VideoHub | questi passi |

Nel repository «stato» vanno **solo quei due file**. Il resto (`stato.json`)
lo scrive GitHub da solo.

## I passi, uno per uno

Si fanno una volta sola. Vanno bene il PC o il telefono (dal telefono usa il
browser, non l'app di GitHub: l'app non sa caricare file).

1. **Crea il repository pubblico «stato».**
   Su github.com, in alto a destra **+** → **New repository**.
   - Owner: **adiviatolouse-cloud**
   - Repository name: **stato**
   - scegli **Public**
   - metti su **On** la voce **Add README** (così il repository nasce col ramo «main»)
   - **Create repository**.

2. **Carica `controlla.mjs`.**
   Prima prendilo da VideoHub: apri il repository Videohub su GitHub, cartella
   `stato`, file `controlla.mjs`, e premi il tasto **Download raw file**
   (la freccia verso il basso, in alto a destra del file).
   Poi nel repository «stato»: **Add file** → **Upload files** → trascina o
   scegli `controlla.mjs` → **Commit changes**.

3. **Accendi le pagine di GitHub.**
   Nel repository «stato»: **Settings** (l'ingranaggio; se non lo vedi, è
   dentro il menu **···**) → nella colonna a sinistra, sezione «Code, planning,
   and automation», **Pages** → sotto «Build and deployment», alla voce **Source**,
   scegli **GitHub Actions**.
   (Non «Deploy from a branch»: vedi «Perché così» in fondo.)

4. **Metti il file del controllo nella cartella giusta.**
   Nel repository «stato»: **Add file** → **Create new file**.
   Come nome scrivi esattamente `.github/workflows/stato.yml` (ogni «/» che
   scrivi crea una cartella: è giusto così). Nel riquadro grande incolla tutto
   il contenuto di `stato/workflow-stato.yml` di VideoHub (aprilo, tasto
   **Copy raw content**, i due fogli in alto a destra, e incolla). **Commit changes**.

5. **Fallo partire la prima volta a mano.**
   Nel repository «stato»: **Actions** → a sinistra **Stato del sito** → a
   destra **Run workflow** → **Run workflow**. Dopo un minuto deve comparire il
   segno verde. Aprendo il giro, alla riga «Chiedi al sito come sta» c'è scritto
   per esempio `[stato] https://adigela.it: ok (412 ms)`.
   Adesso la pagina c'è già a questo indirizzo:
   **https://adiviatolouse-cloud.github.io/stato/**
   Da qui in poi parte da sola ogni 10 minuti.

6. **(Consigliato) Fai riconoscere adigela.it come tuo.**
   GitHub lo consiglia prima del passo 7: così nessun altro su GitHub può
   usare un nome che finisce con adigela.it. Se adiviatolouse-cloud è
   un'organizzazione: dalla pagina dell'organizzazione **Settings** → **Pages**;
   se è il tuo profilo: la tua foto in alto a destra → **Settings** → **Pages**.
   Poi **Add a domain** → scrivi `adigela.it` → **Add domain**. GitHub ti dà un
   record **TXT** da mettere su deSEC (Subname `_github-pages-challenge-adiviatolouse-cloud`,
   tipo TXT, il valore che ti mostra). Mettilo, aspetta qualche minuto e premi
   **Verify**. Il record TXT non va più tolto.

7. **Scrivi il nome della pagina su GitHub.**
   Nel repository «stato»: **Settings** → **Pages** → sotto **Custom domain**
   scrivi `stato.adigela.it` → **Save**.
   (Il file CNAME non serve: con «GitHub Actions» GitHub lo ignora. Conta
   quello che scrivi qui.)

8. **Il nome su deSEC.**
   Su desec.io, entra, apri il dominio **adigela.it** → **+** (aggiungi un
   record):
   - Subname: `stato`
   - Type: **CNAME**
   - Value: `adiviatolouse-cloud.github.io.` — **col punto in fondo**, e senza
     «/stato»: il nome del repository non ci va
   - TTL: lascia quello che propone (3600 va bene)
   - salva.
   Fallo DOPO il passo 7, non prima: GitHub lo chiede in quest'ordine.

9. **Accendi la «s» di https.**
   Torna in **Settings** → **Pages** del repository «stato». Quando sotto il
   nome compare «DNS check successful», spunta **Enforce HTTPS**. Se la casella
   è grigia, GitHub sta ancora preparando il certificato: può metterci fino a
   24 ore. Riprova più tardi.

10. **Controlla che funzioni.**
    - Apri **https://stato.adigela.it** dal telefono: deve dire in verde
      «Il sito della chiesa funziona» e, in fondo, «Controllato oggi alle …»
      con un'ora di non più di dieci-venti minuti fa.
    - Ricarica fra mezz'ora: l'ora in fondo deve essere cambiata.
    - Nel sito, **Amministrazione** → scheda **La pagina dello stato** →
      **Guarda se la pagina c'è**: deve rispondere «La pagina c'è e risponde».
    - Se vuoi vederla rossa: la prossima volta che il NAS si riavvia per un
      aggiornamento, apri stato.adigela.it dopo dieci minuti.

## Che cosa c'è di pubblico, e che cosa no

Il repository «stato» e la pagina li può vedere **chiunque**. Dentro ci sono:

- i due file del programma (`controlla.mjs` e il workflow), che non contengono
  né password, né gettoni, né indirizzi di casa;
- `stato.json`: se il sito rispondeva, a che ora, in quanti millisecondi, per le
  ultime 48 ore;
- le cose **già pubbliche** del sito, che servono quando il sito è giù: il
  titolo, il link del canale YouTube e della diretta, le pagine Facebook della
  chiesa, gli orari dei culti con il nome e l'indirizzo delle sedi.

**Non c'è** e non ci può finire: nessun nome di persona (i pastori no), nessun
numero di telefono o di WhatsApp, nessun IBAN, nessun evento, nessuna preghiera,
nessun indirizzo interno del NAS. Il controllo prende da `/api/site` quei pochi
campi uno per uno e ignora tutto il resto; la prova
`strumenti/prova-stato.mjs` mette nel finto NAS nomi, numeri e IBAN finti e
controlla che non arrivino da nessuna parte.

Il controllo chiede al sito `/api/versione` a ogni giro (due numeri) e
`/api/site` una volta all'ora, con l'intestazione che il NAS usa per non
contarlo come una visita: le statistiche delle visite non cambiano.

## Da sapere

- **GitHub può ritardare.** I 10 minuti non sono garantiti: nei momenti di
  traffico un giro può partire tardi o saltare (nella striscia delle 48 ore è
  una casella grigia, «nessun controllo»). Per questo la pagina scrive sempre
  l'ora vera dell'ultimo controllo, e se è più vecchia di 45 minuti lo dice
  in giallo.
- **Dopo 60 giorni senza movimento** GitHub spegne gli orari dei repository
  pubblici. Qui non dovrebbe succedere: il controllo salva `stato.json` almeno
  ogni sei ore, e questo conta come movimento. Se mai arrivasse una mail
  «scheduled workflow disabled»: **Actions** → **Stato del sito** →
  **Enable workflow**.
- **Per fermarlo**: **Actions** → **Stato del sito** → **···** (Show
  workflow options) → **Disable workflow**. Se un giorno si toglie la pagina, togli anche il record
  `stato` su deSEC (un nome che punta a GitHub senza pagina dietro lo potrebbe
  prendere qualcun altro: il passo 6 serve anche a questo).
- **Il sito sa già il nome della pagina**: lo ricava dall'indirizzo pubblico
  (Amministrazione → Generale → «Indirizzo pubblico del sito»: da
  `https://adigela.it` viene `https://stato.adigela.it`). Quando il NAS non
  risponde, la fascia in cima al sito e all'app dice «Guarda come sta:
  stato.adigela.it»; se invece è il telefono a non avere internet, lo dice, e
  dice anche che allora nemmeno stato.adigela.it si apre.

## Perché così

- **Perché GitHub Actions e non «Deploy from a branch».** La pagina scrive l'ora
  dell'ultimo controllo, quindi cambia a ogni giro. Pubblicandola da un ramo
  servirebbe un salvataggio (un «commit») ogni dieci minuti: 144 al giorno, tutti
  uguali tranne l'ora. Con GitHub Actions la pagina fresca si pubblica senza
  commit, e `stato.json` si salva solo quando il sito cade o torna, quando
  cambia qualcosa di quello che ricorda, o ogni sei ore. Fra un salvataggio e
  l'altro lo storico non si perde: ogni giro rilegge lo `stato.json` già
  pubblicato. Il prezzo sono due permessi in più nel workflow (`pages` e
  `id-token`), che servono solo a pubblicare le pagine di quel repository.
- **Perché un repository a parte.** VideoHub è privato e deve restarlo; e così
  la pagina dello stato non dipende da niente di quello che c'è sul NAS.
