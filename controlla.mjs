/* ===========================================================================
   COME STA IL SITO DELLA CHIESA — il controllo che gira su GitHub.

   Chiesto il 21 ottobre 2026: «una pagina che resta su anche quando il NAS è
   spento, la corrente salta o internet di casa cade. Dice a chi apre il sito
   se funziona o no, da quando, e che cosa fare intanto».

   La pagina non puo' stare sul NAS: quando il NAS e' spento, e' spenta anche
   lei. Sta su GitHub Pages, in un repository PUBBLICO a parte («stato»), e
   questo file la riscrive ogni dieci minuti circa (lo fa partire
   .github/workflows/stato.yml, che e' workflow-stato.yml di questa cartella).

   CHE COSA FA, in ordine:
     1. si ricorda com'era (stato.json: quello salvato nel repository e quello
        gia' pubblicato, il piu' recente dei due);
     2. chiede al sito /api/versione — la stessa domanda leggera che fa il
        sito per capire se il NAS risponde — con un tempo massimo;
     3. se la risposta non arriva, riprova UNA volta dopo qualche secondo:
        una richiesta persa capita, e non vuol dire che il sito sia giu';
     4. classifica: funziona / lento / non risponde / risponde con un errore /
        il nome non si trova;
     5. quando il sito risponde, una volta all'ora, si ricorda le cose
        PUBBLICHE che servono quando sara' giu': il titolo, il canale YouTube
        e la diretta, gli orari dei culti. Solo quelle: nient'altro di quello
        che /api/site racconta finisce qui (vedi «ricordaIlSito»);
     6. scrive stato.json (le ultime 48 ore, un punto per controllo),
        index.html (la pagina), icona.svg e CNAME.

   PERCHE' /api/versione E NON /api/site A OGNI GIRO. /api/site e' grande
   (eventi, testi, orari...) e conta come una visita; /api/versione sono due
   numeri. Quella grande si chiede una volta all'ora, e con l'intestazione
   «x-autodiagnosi», che il NAS usa gia' per non contare come visita i suoi
   stessi controlli.

   NIENTE LIBRERIE: Node 22 e basta (fetch e Intl ci sono gia').

   Le manopole, tutte facoltative (le prove le usano per i finti NAS):
     VH_STATO_URL       l'indirizzo del sito (di serie https://adigela.it)
     VH_STATO_DIR       dove sta stato.json da salvare (di serie: qui)
     VH_STATO_USCITA    dove scrivere la pagina (di serie: qui)
     VH_STATO_PRIMA     l'indirizzo dello stato.json gia' pubblicato
     VH_STATO_TEMPO_MS  il tempo massimo di una risposta (15000)
     VH_STATO_LENTO_MS  oltre questo e' «lento» (5000)
     VH_STATO_ATTESA_MS quanto aspettare prima di riprovare (5000)
     VH_STATO_ORA       l'ora finta del controllo (solo per le prove)
     VH_STATO_DOMINIO   il nome della pagina, per CNAME (di serie stato.<sito>)
   =========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const SITO = String(env.VH_STATO_URL || 'https://adigela.it').trim().replace(/\/+$/, '');
const DIR = env.VH_STATO_DIR || QUI;
const USCITA = env.VH_STATO_USCITA || DIR;
const TEMPO = Number(env.VH_STATO_TEMPO_MS) || 15000;
const LENTO = Number(env.VH_STATO_LENTO_MS) || 5000;
const ATTESA = env.VH_STATO_ATTESA_MS !== undefined ? Number(env.VH_STATO_ATTESA_MS) : 5000;
const ORA = env.VH_STATO_ORA ? new Date(env.VH_STATO_ORA) : new Date();
const ORE_STORIA = 48;
// Il ricordo del sito si rinfresca ogni ora; il canale YouTube ogni giorno
// (lo chiede /api/videos, che sul NAS e' piu' pesante).
const RICORDO_OGNI = 60 * 60 * 1000;
const YOUTUBE_OGNI = 24 * 60 * 60 * 1000;
// Lo storico si SALVA nel repository solo quando cambia qualcosa, o ogni sei
// ore: un commit ogni dieci minuti sarebbero 144 commit al giorno di niente.
// Fra un salvataggio e l'altro lo storico vive nella pagina pubblicata
// (VH_STATO_PRIMA), che si rilegge all'inizio di ogni giro.
const SALVA_OGNI = 6 * 60 * 60 * 1000;

const UA = 'VideoHub-stato/1 (controllo automatico da GitHub Actions)';
const GUASTI = new Set(['giu', 'errore', 'dns']);

// ---------------------------------------------------------------------------
// LE PAROLE DEL TEMPO. Queste funzioni si usano qui E dentro la pagina (si
// copiano nel <script> con toString): cosi' «oggi alle 14:20» lo scrive
// sempre la stessa ricetta, anche quando la pagina si aggiorna da sola sul
// telefono e intanto e' passata la mezzanotte. Non devono usare niente di
// fuori da se' stesse, a parte Intl.
// ---------------------------------------------------------------------------
function vhGiornoRoma(d) {
  // «2026-10-21» nel fuso di Roma, per capire se e' oggi o ieri
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p;
}
function vhOra(d) {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(d);
}
function vhQuando(d, adesso) {
  const g = vhGiornoRoma(d);
  if (g === vhGiornoRoma(adesso)) return 'oggi alle ' + vhOra(d);
  if (g === vhGiornoRoma(new Date(adesso.getTime() - 86400000))) return 'ieri alle ' + vhOra(d);
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(d) + ' alle ' + vhOra(d);
}
function vhDurata(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'meno di un minuto';
  const parola = (n, uno, tanti) => n + ' ' + (n === 1 ? uno : tanti);
  if (min < 60) return parola(min, 'minuto', 'minuti');
  const ore = Math.floor(min / 60), resto = min % 60;
  if (ore < 24) return parola(ore, 'ora', 'ore') + (resto ? ' e ' + parola(resto, 'minuto', 'minuti') : '');
  const giorni = Math.floor(ore / 24), oreR = ore % 24;
  return parola(giorni, 'giorno', 'giorni') + (oreR ? ' e ' + parola(oreR, 'ora', 'ore') : '');
}

// ---------------------------------------------------------------------------
// IL RICORDO: stato.json salvato qui, e quello gia' pubblicato.
// ---------------------------------------------------------------------------
function leggiLocale() {
  try { const j = JSON.parse(readFileSync(join(DIR, 'stato.json'), 'utf8')); return j && j.versione === 1 ? j : null; }
  catch { return null; }
}
async function leggiPubblicato() {
  if (!env.VH_STATO_PRIMA) return null;
  try {
    const r = await fetch(env.VH_STATO_PRIMA + (env.VH_STATO_PRIMA.includes('?') ? '&' : '?') + 'giro=' + ORA.getTime(),
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.versione === 1 ? j : null;
  } catch { return null; }
}
const tempo = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : 0; };

// Due ricordi diventano uno: lo storico e' l'unione dei punti, il resto lo
// dice il piu' recente. (Quello pubblicato di solito e' piu' fresco: quello
// salvato nel repository puo' avere fino a sei ore.)
function unisci(a, b) {
  if (!a) return b; if (!b) return a;
  const [vecchio, nuovo] = tempo(a.controllato) >= tempo(b.controllato) ? [b, a] : [a, b];
  const punti = new Map();
  for (const p of [...(vecchio.storia || []), ...(nuovo.storia || [])]) if (Array.isArray(p) && Number.isFinite(p[0])) punti.set(p[0], p);
  const ricordo = tempo(a.ricordo?.aggiornato) >= tempo(b.ricordo?.aggiornato) ? a.ricordo : b.ricordo;
  return { ...nuovo, ricordo, storia: [...punti.values()].sort((x, y) => x[0] - y[0]) };
}

// ---------------------------------------------------------------------------
// LA DOMANDA AL SITO.
// ---------------------------------------------------------------------------
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
function causa(err) {
  // fetch di Node mette il motivo vero dentro «cause» (a volte due piani sotto)
  // [ATTENZIONE] il tempo scaduto e' un DOMException, che ha anche lui un
  // «code» — ma e' un numero (23): si guarda prima il nome, e dei codici
  // si prendono solo le parole (ECONNREFUSED, ENOTFOUND...)
  let c = err;
  for (let i = 0; i < 4 && c; i++) {
    if (c.name === 'TimeoutError' || c.name === 'AbortError') return 'TEMPO';
    if (typeof c.code === 'string' && c.code) return c.code;
    c = c.cause;
  }
  return err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'TEMPO' : '';
}
async function chiedi(percorso, tempoMax = TEMPO) {
  const t0 = Date.now();
  try {
    const r = await fetch(SITO + percorso, {
      headers: { 'user-agent': UA, 'x-autodiagnosi': 'stato', accept: 'application/json' },
      signal: AbortSignal.timeout(tempoMax), cache: 'no-store', redirect: 'follow',
    });
    const testo = await r.text();
    return { ok: true, status: r.status, testo, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, codice: causa(err), messaggio: String(err?.cause?.message || err?.message || err), ms: Date.now() - t0 };
  }
}

// Che cosa vuol dire la risposta, in parole per chi legge.
function classifica(r) {
  if (!r.ok) {
    const c = r.codice;
    if (c === 'ENOTFOUND' || c === 'EAI_AGAIN' || c === 'EAI_NONAME' || c === 'EAI_FAIL') {
      return { stato: 'dns', dettaglio: 'Internet non sa più a quale indirizzo sta il nome del sito.' };
    }
    if (c === 'TEMPO' || c === 'UND_ERR_CONNECT_TIMEOUT' || c === 'ETIMEDOUT' || c === 'UND_ERR_HEADERS_TIMEOUT') {
      return { stato: 'giu', dettaglio: 'Non ha risposto in ' + Math.round(TEMPO / 1000) + ' secondi.' };
    }
    if (c === 'ECONNREFUSED') return { stato: 'giu', dettaglio: 'La linea c’è, ma dall’altra parte nessuno risponde.' };
    if (/^(CERT_|ERR_TLS|ERR_SSL|UNABLE_TO|DEPTH_ZERO|SELF_SIGNED)/.test(c)) {
      return { stato: 'errore', dettaglio: 'Il certificato del sito (la «s» di https) non va: il telefono lo segnala come non sicuro.' };
    }
    return { stato: 'giu', dettaglio: 'Il collegamento si è interrotto' + (c ? ' (' + c + ')' : '') + '.' };
  }
  if (r.status >= 500) {
    return { stato: 'errore', codice: r.status, dettaglio: r.status === 502 || r.status === 503 || r.status === 504
      ? 'Il NAS è acceso, ma il programma del sito non risponde (codice ' + r.status + '): può darsi che si stia riavviando o aggiornando.'
      : 'Il programma del sito ha avuto un guasto (codice ' + r.status + ').' };
  }
  if (r.status >= 400) return { stato: 'errore', codice: r.status, dettaglio: 'Il sito risponde «non si può» (codice ' + r.status + ').' };
  let j = null;
  try { j = JSON.parse(r.testo); } catch {}
  if (!j || typeof j.aggiornamento !== 'number') {
    return { stato: 'errore', codice: r.status, dettaglio: 'Risponde qualcosa, ma non è il sito della chiesa (forse una pagina del router o del fornitore).' };
  }
  if (r.ms > LENTO) return { stato: 'lento', dettaglio: 'Ha risposto, ma in ' + (r.ms / 1000).toFixed(1).replace('.', ',') + ' secondi.' };
  return { stato: 'ok', dettaglio: 'Ha risposto in ' + (r.ms / 1000).toFixed(1).replace('.', ',') + ' secondi.' };
}

// ---------------------------------------------------------------------------
// IL RICORDO DEL SITO: SOLO LE COSE PUBBLICHE.
//
// [ATTENZIONE] Il repository «stato» e' PUBBLICO, e lo storico ci resta per
// sempre. /api/site racconta molte cose (i pastori coi loro nomi, il numero
// di WhatsApp, le coordinate per le offerte, gli eventi...): qui se ne
// prendono QUATTRO, campo per campo, e il resto non si tocca nemmeno. Mai
// scrivere «...j» o copiare un oggetto intero: un campo nuovo di domani
// finirebbe in pubblico senza che nessuno l'abbia deciso. La prova
// (strumenti/prova-stato.mjs) mette nel finto NAS nomi, numeri e IBAN finti
// e controlla che non arrivino da nessuna parte.
// ---------------------------------------------------------------------------
const pulito = (v, max = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function ricordaIlSito(j, vecchio) {
  const s = j && typeof j === 'object' ? j : {};
  const site = s.site && typeof s.site === 'object' ? s.site : {};
  const culti = (Array.isArray(s.sedi) ? s.sedi : []).slice(0, 4).map((sede) => ({
    sede: pulito(sede?.nome, 80),
    indirizzo: pulito(sede?.indirizzo, 120),
    orari: (Array.isArray(sede?.orariCulti) ? sede.orariCulti : []).slice(0, 12).map((o) => ({
      giorno: pulito(o?.giorno, 20), ora: /^\d{1,2}[:.]\d{2}$/.test(String(o?.ora || '').trim()) ? String(o.ora).trim() : '', tipo: pulito(o?.tipo, 60),
    })).filter((o) => o.giorno && o.ora),
  })).filter((c) => c.sede || c.orari.length);
  const facebook = (Array.isArray(s.facebookPages) ? s.facebookPages : []).slice(0, 2)
    .map((p) => ({ nome: pulito(p?.nome, 60), url: String(p?.url || '').trim() }))
    .filter((p) => /^https:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9._\-\/?=&%]{1,120}$/.test(p.url));
  return {
    titolo: pulito(site.title, 100) || vecchio?.titolo || '',
    titoloBreve: pulito(site.shortTitle, 40) || vecchio?.titoloBreve || '',
    canaleScelto: pulito(s.canaleHome, 60),
    culti,
    facebook,
    youtube: vecchio?.youtube || null,
    aggiornatoYoutube: vecchio?.aggiornatoYoutube || '',
  };
}
// Dal NAS: l'indirizzo del canale (www.youtube.com/channel/UC...) e, da li',
// quello della diretta (/live, che YouTube apre sulla diretta in corso, se
// c'e', o sul canale).
function ricordaYoutube(j, sceltoNome) {
  const canali = (Array.isArray(j?.channels) ? j.channels : [])
    .map((c) => ({ nome: pulito(c?.nome || c?.title, 60), url: String(c?.url || '').trim() }))
    .filter((c) => /^https:\/\/www\.youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/.test(c.url));
  const c = canali.find((x) => sceltoNome && x.nome === sceltoNome) || canali[0];
  return c ? { nome: c.nome, canale: c.url, diretta: c.url + '/live' } : null;
}

// ---------------------------------------------------------------------------
// LA PAGINA.
// ---------------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nomeDelSito = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

// Le icone: prese da public/icons.svg del sito (stesso tratto, stessa griglia
// di 24), scritte qui dentro perche' la pagina non puo' chiedere niente al NAS.
const ICONE = {
  check: '<path d="M4.5 12.5l5 5L19.5 6.5"/>',
  alert: '<path d="M12 4.2L2.9 19.8h18.2z"/><path d="M12 10.2v4M12 17.4h.01" stroke-width="2"/>',
  lento: '<path d="M4.6 16.8a8.5 8.5 0 1 1 14.8 0M12 15.5l-4.2-3.2"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none"/>',
  spento: '<path d="M3.2 3.2l17.6 17.6"/><path d="M8.7 15.8a5.2 5.2 0 0 1 6.6-.1M5.2 12.4a9.8 9.8 0 0 1 4-2.4M13 9.5a9.8 9.8 0 0 1 5.8 2.9M2.2 9a14 14 0 0 1 3.2-2.2M11.6 5.7a14 14 0 0 1 10.2 3.3"/><circle cx="12" cy="19.1" r="1.4" fill="currentColor" stroke="none"/>',
  globo: '<circle cx="12" cy="12" r="9.2"/><path d="M2.9 12h18.2"/><path d="M12 2.8c2.4 2.5 3.7 5.7 3.7 9.2s-1.3 6.7-3.7 9.2c-2.4-2.5-3.7-5.7-3.7-9.2S9.6 5.3 12 2.8z"/>',
  diretta: '<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M7.9 16.1a5.8 5.8 0 0 1 0-8.2M16.1 7.9a5.8 5.8 0 0 1 0 8.2M5.1 18.9a9.8 9.8 0 0 1 0-13.8M18.9 5.1a9.8 9.8 0 0 1 0 13.8"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.7-6.2M20.5 4v5h-5"/>',
  chiesa: '<path d="M12 2.5V7M9.8 4.5h4.4M6 20.5v-8.3L12 7l6 5.2v8.3M3.5 20.5h17M10 20.5v-3.5a2 2 0 0 1 4 0v3.5"/>',
  telefono: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.3h2"/>',
  orologio: '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.6V12l3.8 2.2"/>',
  info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11v5M12 7.6h.01" stroke-width="2"/>',
};
const ico = (n, cls = '') => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONE[n] + '</svg>';

const TITOLI = {
  ok: 'Il sito della chiesa funziona',
  lento: 'Il sito della chiesa funziona, ma è lento',
  giu: 'Il sito della chiesa non risponde',
  errore: 'Il sito della chiesa risponde con un errore',
  dns: 'Il nome del sito non si trova',
};
const PERCHE = {
  giu: 'Di solito vuol dire che il piccolo computer che tiene il sito (il NAS) è spento, che è saltata la corrente, oppure che è caduto internet dove sta il NAS.',
  errore: 'Il computer del sito è raggiungibile, ma qualcosa non va. Spesso si sistema da solo in qualche minuto, dopo un aggiornamento o un riavvio.',
  dns: 'Il NAS potrebbe anche essere acceso: è il nome del sito che non porta più da nessuna parte. È un problema del dominio, e lo deve guardare chi gestisce il sito.',
};

// Le 48 ore in 48 caselle, una per ora: il colore e' il peggio di quell'ora.
function caselle(storia, adesso) {
  const ORA_MS = 3600000;
  const fine = Math.floor(adesso.getTime() / ORA_MS) * ORA_MS + ORA_MS;   // la fine dell'ora in corso
  const inizio = fine - ORE_STORIA * ORA_MS;
  const peso = { o: 1, l: 2, e: 3, g: 3, d: 3 };
  const c = Array.from({ length: ORE_STORIA }, (_, i) => ({ da: inizio + i * ORA_MS, punti: 0, peggio: '' }));
  for (const [t, s] of storia) {
    const ms = t * 1000;
    if (ms < inizio || ms >= fine) continue;
    const k = c[Math.floor((ms - inizio) / ORA_MS)];
    k.punti++;
    if (!k.peggio || peso[s] > peso[k.peggio]) k.peggio = s;
  }
  return c;
}
// I pezzi di tempo in cui il sito non rispondeva, dal piu' recente.
function buchi(storia) {
  const fuori = [];
  let cur = null;
  for (const [t, s] of storia) {
    if ('egd'.includes(s)) { if (!cur) cur = { da: t, a: t }; else cur.a = t; }
    else if (cur) { cur.tornato = t; fuori.push(cur); cur = null; }
  }
  if (cur) { cur.inCorso = true; fuori.push(cur); }
  return fuori.reverse();
}

function scriviPagina(st) {
  const adesso = new Date(st.controllato);
  const r = st.ricordo || {};
  const titoloSito = r.titolo || nomeDelSito(st.indirizzo);
  const guasto = GUASTI.has(st.stato);
  const classe = guasto ? 'rosso' : st.stato === 'lento' ? 'giallo' : 'verde';
  const icona = st.stato === 'ok' ? 'check' : st.stato === 'lento' ? 'lento' : st.stato === 'dns' ? 'globo' : st.stato === 'giu' ? 'spento' : 'alert';
  const da = new Date(st.daQuando || st.controllato);
  const primoGiro = !st.daQuando || st.daQuando === st.controllato;

  // Il titolo e' HTML: dentro c'e' la durata, che la pagina tiene aggiornata
  // da sola (data-durata) mentre la si guarda.
  let titolo = esc(TITOLI[st.stato]);
  let sotto = esc(st.dettaglio || '');
  if (guasto) {
    if (!primoGiro) titolo += ' da <span data-durata="' + esc(st.daQuando) + '">' + esc(vhDurata(adesso - da)) + '</span>';
    sotto = (primoGiro ? 'Il primo controllo andato male è di ' : 'Non risponde da ')
      + '<span data-quando="' + esc(st.daQuando || st.controllato) + '">' + esc(vhQuando(da, adesso)) + '</span>'
      + (st.ultimaBene ? '; l’ultima volta che ha risposto: <span data-quando="' + esc(st.ultimaBene) + '">' + esc(vhQuando(new Date(st.ultimaBene), adesso)) + '</span>' : '')
      + '. ' + esc(st.dettaglio || '');
  }

  // ---- che cosa fare intanto ----
  const yt = r.youtube;
  const cercaYt = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(titoloSito);
  const dirette = yt
    ? '<a class="tasto" href="' + esc(yt.diretta) + '" rel="noopener">' + ico('play') + ' Guarda la diretta su YouTube</a>'
      + '<a class="tasto secondo" href="' + esc(yt.canale) + '" rel="noopener">' + ico('diretta') + ' Il canale' + (yt.nome ? ' «' + esc(yt.nome) + '»' : ' della chiesa') + '</a>'
    : '<a class="tasto" href="' + esc(cercaYt) + '" rel="noopener">' + ico('play') + ' Cerca la chiesa su YouTube</a>';
  const fb = (r.facebook || []).map((p) => '<a class="tasto secondo" href="' + esc(p.url) + '" rel="noopener">' + ico('diretta') + ' ' + esc(p.nome || 'Facebook') + ' su Facebook</a>').join('');
  const orari = (r.culti || []).filter((c) => c.orari?.length).map((c) =>
    '<div class="sede"><b>' + esc(c.sede || 'In chiesa') + '</b>' + (c.indirizzo ? '<small>' + esc(c.indirizzo) + '</small>' : '')
    + '<ul>' + c.orari.map((o) => '<li><span>' + esc(o.giorno) + ' ' + esc(o.ora) + '</span>' + (o.tipo ? ' — ' + esc(o.tipo) : '') + '</li>').join('') + '</ul></div>').join('');

  const intanto = guasto || st.stato === 'lento' ? `
  <section class="scheda">
    <h2>Che cosa fare intanto</h2>
    <p class="riga">${ico('diretta')}<span><b>La diretta resta su YouTube</b>${yt ? ': <a href="' + esc(yt.diretta) + '" rel="noopener">' + esc(yt.diretta.replace(/^https:\/\//, '')) + '</a>' : '.'} Il sito, lento o spento, non la ferma.</span></p>
    <div class="tasti">${dirette}${fb}</div>
    <p class="riga">${ico('refresh')}<span><b>Riprova fra qualche minuto.</b> Questa pagina si aggiorna da sola: non serve ricaricarla.</span></p>
    <p class="riga">${ico('telefono')}<span>Se hai l’app della chiesa o il sito salvato sul telefono, <b>la Bibbia, i cantici e quello che avevi già aperto si leggono lo stesso</b>, anche senza il sito.</span></p>
    ${orari ? '<p class="riga">' + ico('chiesa') + '<span><b>I culti si fanno come sempre.</b></span></p><div class="sedi">' + orari + '</div>' : ''}
  </section>` : `
  <section class="scheda">
    <h2>Se a te il sito non si apre</h2>
    <p class="riga">${ico('telefono')}<span>Qui risulta acceso: il problema allora è <b>sul tuo telefono o sulla tua rete</b>. Prova a passare dal Wi-Fi ai dati mobili (o al contrario), poi riapri <a href="${esc(st.indirizzo)}">${esc(nomeDelSito(st.indirizzo))}</a>.</span></p>
    <p class="riga">${ico('diretta')}<span>La diretta è anche su YouTube${yt ? ': <a href="' + esc(yt.diretta) + '" rel="noopener">' + esc(yt.diretta.replace(/^https:\/\//, '')) + '</a>' : ': <a href="' + esc(cercaYt) + '" rel="noopener">cerca la chiesa</a>'}.</span></p>
  </section>`;

  // ---- la striscia delle 48 ore ----
  const cc = caselle(st.storia || [], adesso);
  const nomeStato = { o: 'funzionava', l: 'lento', e: 'rispondeva con un errore', g: 'non rispondeva', d: 'il nome non si trovava' };
  const W = 480, passo = W / ORE_STORIA;
  const rett = cc.map((k, i) => {
    const cl = !k.peggio ? 'c-vuoto' : k.peggio === 'o' ? 'c-ok' : k.peggio === 'l' ? 'c-lento' : 'c-giu';
    const quando = vhQuando(new Date(k.da), adesso) + '–' + vhOra(new Date(k.da + 3600000));
    const cosa = k.peggio ? nomeStato[k.peggio] + ' (' + k.punti + (k.punti === 1 ? ' controllo' : ' controlli') + ')' : 'nessun controllo (GitHub in ritardo)';
    return '<rect class="' + cl + '" x="' + (i * passo + 0.6).toFixed(1) + '" y="0" width="' + (passo - 1.2).toFixed(1) + '" height="34" rx="1.5"><title>' + esc(quando + ': ' + cosa) + '</title></rect>';
  }).join('');
  const tot = (st.storia || []).length;
  const bene = (st.storia || []).filter((p) => p[1] === 'o' || p[1] === 'l').length;
  const bb = buchi(st.storia || []).slice(0, 5);
  const elencoBuchi = bb.map((b) => {
    const a = new Date(b.da * 1000), z = new Date((b.tornato || b.a) * 1000);
    return '<li>' + (b.inCorso
      ? 'da <span data-quando="' + esc(a.toISOString()) + '">' + esc(vhQuando(a, adesso)) + '</span>: <b>ancora adesso</b>'
      : 'da <span data-quando="' + esc(a.toISOString()) + '">' + esc(vhQuando(a, adesso)) + '</span> a <span data-quando="' + esc(z.toISOString()) + '">' + esc(vhQuando(z, adesso)) + '</span> (circa ' + esc(vhDurata(z - a)) + ')') + '</li>';
  }).join('');
  const riassunto = tot
    ? 'Nelle ultime 48 ore: ' + tot + (tot === 1 ? ' controllo' : ' controlli') + ', il sito ha risposto a ' + bene + '.'
    : 'Ancora nessun controllo.';

  const statoPerJs = JSON.stringify({ controllato: st.controllato }).replace(/</g, '\\u003c');
  const nome = nomeDelSito(st.indirizzo);

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'">
<title>${esc(TITOLI[st.stato])} — ${esc(r.titoloBreve || titoloSito)}</title>
<meta name="description" content="Come sta il sito ${esc(nome)}: funziona o no, da quando, e dove trovare la diretta intanto.">
<link rel="icon" href="icona.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light dark;
    --fondo: #f5f6f8; --carta: #ffffff; --testo: #15181d; --tenue: #586170; --riga: #dde1e7; --link: #0b5cad;
    --verde: #136c43; --verde-f: #e3f3ea; --giallo: #7a5000; --giallo-f: #fff2d6; --rosso: #b42318; --rosso-f: #fdebe9;
    --c-ok: #2f9e66; --c-lento: #d99a00; --c-giu: #d64545; --c-vuoto: #cfd4db; }
  @media (prefers-color-scheme: dark) { :root {
    --fondo: #0f1216; --carta: #181c22; --testo: #eef1f5; --tenue: #a3acb9; --riga: #2b313a; --link: #7cb7ff;
    --verde: #5fd09a; --verde-f: #12291e; --giallo: #f2bd55; --giallo-f: #2b2111; --rosso: #ff8a80; --rosso-f: #2f1715;
    --c-ok: #3fb97a; --c-lento: #e0a82e; --c-giu: #e5534b; --c-vuoto: #39404a; } }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--fondo); color: var(--testo);
    font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 20px 16px 40px; }
  a { color: var(--link); overflow-wrap: anywhere; }
  .ic { width: 1.25em; height: 1.25em; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; vertical-align: -.25em; }
  .testa { display: flex; align-items: center; gap: 8px; color: var(--tenue); font-size: .95rem; margin: 0 0 14px; }
  .testa a { color: inherit; }
  .esito { border-radius: 14px; padding: 20px 18px; margin: 0 0 16px; border: 1px solid var(--riga); }
  .esito.verde { background: var(--verde-f); color: var(--verde); }
  .esito.giallo { background: var(--giallo-f); color: var(--giallo); }
  .esito.rosso { background: var(--rosso-f); color: var(--rosso); }
  .esito h1 { display: flex; gap: 12px; align-items: flex-start; margin: 0; font-size: clamp(1.55rem, 6.4vw, 2.3rem); line-height: 1.18; }
  .esito h1 .ic { width: 1.35em; height: 1.35em; stroke-width: 2.2; margin-top: -.05em; }
  .esito p { margin: 10px 0 0; color: var(--testo); font-size: 1.02rem; }
  .scheda { background: var(--carta); border: 1px solid var(--riga); border-radius: 14px; padding: 16px 18px; margin: 0 0 16px; }
  .scheda h2 { margin: 0 0 10px; font-size: 1.15rem; }
  .riga { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0; }
  .riga > .ic { color: var(--tenue); margin-top: .12em; }
  .tasti { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 12px 30px; }
  .tasto { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 16px; border-radius: 10px;
    background: var(--rosso); color: #fff; text-decoration: none; font-weight: 650; }
  @media (prefers-color-scheme: dark) { .tasto { color: #1a0d0c; } }
  .tasto.secondo { background: transparent; color: var(--testo); border: 1px solid var(--riga); }
  .sedi { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 0 0 4px 30px; }
  .sede small { display: block; color: var(--tenue); }
  .sede ul { margin: 6px 0 0; padding: 0 0 0 18px; }
  .sede li span { font-variant-numeric: tabular-nums; font-weight: 600; }
  .striscia { display: block; width: 100%; height: 34px; }
  .c-ok { fill: var(--c-ok); } .c-lento { fill: var(--c-lento); } .c-giu { fill: var(--c-giu); } .c-vuoto { fill: var(--c-vuoto); }
  .assi { display: flex; justify-content: space-between; color: var(--tenue); font-size: .82rem; margin-top: 4px; }
  .legenda { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--tenue); font-size: .88rem; margin: 10px 0 0; padding: 0; list-style: none; }
  .legenda i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .buchi { margin: 8px 0 0; padding-left: 20px; }
  .piede { color: var(--tenue); font-size: .92rem; }
  .piede p { margin: 8px 0; }
  .ritardo { background: var(--giallo-f); color: var(--giallo); border-radius: 10px; padding: 10px 12px; font-weight: 600; }
</style>
</head>
<body>
<main>
  <p class="testa">${ico('chiesa')}<span>${esc(titoloSito)} · <a href="${esc(st.indirizzo)}">${esc(nome)}</a></span></p>

  <section class="esito ${classe}" role="status">
    <h1>${ico(icona)}<span>${titolo}</span></h1>
    <p>${sotto}</p>
    ${guasto && PERCHE[st.stato] ? '<p>' + esc(PERCHE[st.stato]) + '</p>' : ''}
  </section>
  ${intanto}
  <section class="scheda">
    <h2>Le ultime 48 ore</h2>
    <svg class="striscia" viewBox="0 0 ${W} 34" preserveAspectRatio="none" role="img" aria-label="${esc(riassunto)}">${rett}</svg>
    <div class="assi"><span>48 ore fa</span><span>24 ore fa</span><span>adesso</span></div>
    <ul class="legenda">
      <li><i style="background:var(--c-ok)"></i>funzionava</li>
      <li><i style="background:var(--c-lento)"></i>lento</li>
      <li><i style="background:var(--c-giu)"></i>non rispondeva</li>
      <li><i style="background:var(--c-vuoto)"></i>nessun controllo</li>
    </ul>
    <p>${esc(riassunto)}${bb.length ? ' Non rispondeva:' : ' Ha sempre risposto.'}</p>
    ${bb.length ? '<ul class="buchi">' + elencoBuchi + '</ul>' : ''}
  </section>

  <section class="piede">
    <p id="ritardo" class="ritardo" hidden></p>
    <p>${ico('orologio')} Controllato <span data-quando="${esc(st.controllato)}">${esc(vhQuando(adesso, adesso))}</span>.
    Il controllo lo fa GitHub ogni 10 minuti circa, ma a volte ritarda anche di mezz’ora: l’ora scritta qui è quella vera dell’ultimo controllo.</p>
    <p>${ico('info')} Questa pagina sta su GitHub, non sul computer della chiesa: per questo resta su anche quando il sito è spento. Non contiene niente di riservato, solo lo stato del sito.</p>
  </section>
</main>
<script>
${[vhGiornoRoma, vhOra, vhQuando, vhDurata].map((f) => f.toString()).join('\n')}
(function () {
  var DATI = ${statoPerJs};
  var ritardo = document.getElementById('ritardo');
  function rinfresca() {
    var adesso = new Date();
    var el = document.querySelectorAll('[data-quando]');
    for (var i = 0; i < el.length; i++) el[i].textContent = vhQuando(new Date(el[i].getAttribute('data-quando')), adesso);
    var du = document.querySelectorAll('[data-durata]');
    for (var k = 0; k < du.length; k++) du[k].textContent = vhDurata(adesso - new Date(du[k].getAttribute('data-durata')));
    // GitHub in ritardo: si dice, invece di lasciar credere che sia fresco
    var vecchio = adesso - new Date(DATI.controllato);
    if (vecchio > 45 * 60000) {
      ritardo.hidden = false;
      ritardo.textContent = 'Attenzione: l’ultimo controllo è di ' + vhDurata(vecchio) + ' fa. GitHub è in ritardo, e quello che leggi qui sopra potrebbe non essere più vero.';
    } else ritardo.hidden = true;
  }
  rinfresca();
  setInterval(rinfresca, 30000);
  // un controllo nuovo? si ricarica da sola (solo se la pagina si sta guardando)
  setInterval(function () {
    if (document.hidden || !window.fetch) return;
    fetch('stato.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.controllato && j.controllato !== DATI.controllato) location.reload(); })
      .catch(function () {});
  }, 120000);
})();
</script>
</body>
</html>
`;
}

// L'iconcina della pagina. Serve anche al sito della chiesa per capire se il
// telefono esce su internet: se questa si carica, internet c'e' (e quindi e'
// il NAS a non rispondere). Vedi «sondaStato» in public/index.html.
const ICONA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#136c43"/>'
  + '<path d="M3.5 12.5h4l2.2-5.5 4.4 11 2.4-5.5h4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>\n';

// ---------------------------------------------------------------------------
// IL GIRO.
// ---------------------------------------------------------------------------
async function giro() {
  const locale = leggiLocale();
  const prima = unisci(locale, await leggiPubblicato());

  let r = await chiedi('/api/versione');
  let esito = classifica(r);
  if (GUASTI.has(esito.stato) && ATTESA >= 0) {
    // una sola richiesta persa non e' un sito giu': si riprova una volta
    await aspetta(ATTESA);
    r = await chiedi('/api/versione');
    esito = classifica(r);
  }
  const funziona = !GUASTI.has(esito.stato);
  const iso = ORA.toISOString();

  // il ricordo delle cose pubbliche, quando il sito risponde
  let ricordo = prima?.ricordo || null;
  if (funziona && (!ricordo || ORA - tempo(ricordo.aggiornato) > RICORDO_OGNI)) {
    const s = await chiedi('/api/site', 20000);
    let j = null;
    try { j = s.ok && s.status === 200 ? JSON.parse(s.testo) : null; } catch {}
    if (j && j.site) ricordo = { ...ricordaIlSito(j, ricordo), aggiornato: iso };
  }
  if (funziona && ricordo && (!ricordo.youtube || ORA - tempo(ricordo.aggiornatoYoutube) > YOUTUBE_OGNI)) {
    const v = await chiedi('/api/videos', 20000);
    let j = null;
    try { j = v.ok && v.status === 200 ? JSON.parse(v.testo) : null; } catch {}
    const yt = j ? ricordaYoutube(j, ricordo.canaleScelto) : null;
    if (yt) ricordo = { ...ricordo, youtube: yt, aggiornatoYoutube: iso };
  }

  // da quando: lo stato e' «lo stesso» se e' ancora un guasto (o ancora no)
  const eraGuasto = prima ? GUASTI.has(prima.stato) : null;
  const daQuando = prima && eraGuasto === !funziona && prima.daQuando ? prima.daQuando : iso;
  const sigla = { ok: 'o', lento: 'l', giu: 'g', errore: 'e', dns: 'd' }[esito.stato];
  const limite = Math.floor(ORA.getTime() / 1000) - ORE_STORIA * 3600;
  const storia = [...(prima?.storia || []).filter((p) => p[0] > limite && p[0] !== Math.floor(ORA.getTime() / 1000)),
    [Math.floor(ORA.getTime() / 1000), sigla, r.ms]];

  const st = {
    versione: 1,
    indirizzo: SITO,
    controllato: iso,
    stato: esito.stato,
    dettaglio: esito.dettaglio,
    ...(esito.codice ? { codice: esito.codice } : {}),
    ms: r.ms,
    daQuando,
    ultimaBene: funziona ? iso : (prima?.ultimaBene || ''),
    ricordo,
    storia,
  };

  // Salvare nel repository? Solo se e' cambiato qualcosa che conta, o ogni sei
  // ore (cosi' anche il repository ricorda, se la pagina pubblicata si perde).
  const senzaOre = (x) => x ? JSON.stringify({ ...x, aggiornato: '', aggiornatoYoutube: '' }) : '';
  const perche = !locale ? 'primo salvataggio'
    : locale.stato !== st.stato ? 'lo stato è cambiato (' + locale.stato + ' → ' + st.stato + ')'
    : senzaOre(locale.ricordo) !== senzaOre(st.ricordo) ? 'il ricordo del sito è cambiato'
    : ORA - tempo(locale.salvato || locale.controllato) > SALVA_OGNI ? 'sono passate sei ore'
    : '';
  st.salvato = perche ? iso : (locale?.salvato || locale?.controllato || iso);

  // un punto dello storico per riga: 288 righe corte invece di 1152, e nel
  // repository si legge a occhio quando e' caduto
  const json = JSON.stringify(st, null, 1).replace(/\[\n\s+(\d+),\n\s+("[a-z]"),\n\s+(\d+)\n\s+\]/g, '[$1, $2, $3]') + '\n';
  mkdirSync(DIR, { recursive: true });
  mkdirSync(USCITA, { recursive: true });
  writeFileSync(join(DIR, 'stato.json'), json);
  if (USCITA !== DIR) writeFileSync(join(USCITA, 'stato.json'), json);
  writeFileSync(join(USCITA, 'index.html'), scriviPagina(st));
  writeFileSync(join(USCITA, 'icona.svg'), ICONA);
  const dominio = env.VH_STATO_DOMINIO || ('stato.' + nomeDelSito(SITO));
  writeFileSync(join(USCITA, 'CNAME'), dominio + '\n');

  if (env.GITHUB_OUTPUT) {
    try { appendFileSync(env.GITHUB_OUTPUT, 'salva=' + (perche ? 'si' : 'no') + '\nstato=' + st.stato + '\n'); } catch {}
  }
  console.log('[stato] ' + SITO + ': ' + st.stato + ' (' + r.ms + ' ms) — ' + st.dettaglio
    + (perche ? ' | da salvare: ' + perche : ' | niente da salvare'));
  return st;
}

giro().catch((err) => {
  // Questo file non deve MAI fallire per colpa del sito: il sito giu' e' una
  // notizia da scrivere nella pagina, non un errore. Se arriva qui e' un guaio
  // nostro, e allora si dice in chiaro.
  console.error('[stato] Non sono riuscito a scrivere la pagina:', err && err.stack || err);
  process.exit(1);
});
