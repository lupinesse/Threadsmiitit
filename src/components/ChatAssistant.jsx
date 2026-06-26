/**
 * @fileoverview AI chat assistant sheet ("Miitti-apuri").
 *
 * Lets users add, edit, or remove their own meetups in natural Finnish.
 * Sends a structured system prompt to the AI backend and parses a JSON reply:
 * { reply: string, actions: [{op, title, date, city, cat, org, url, id?}] }
 *
 * Also detects pasted Threads links and backfills url/org automatically.
 */

import { Fragment, useState, useRef, useEffect } from 'react';
import { CITIES, CATEGORIES, DH } from '../data.js';
import EventStore from '../store/EventStore.js';
import { complete } from '../api/claude.js';
import { hexA, cityName } from './ui.jsx';
import { IconSpark, IconClose, IconCheck, IconArrowUpRight } from './icons.jsx';

/**
 * Builds the system prompt context listing known cities, categories, and the
 * user's own meetups with their IDs.
 * @returns {string}
 */
function systemContext() {
  const cities = CITIES.map((c) => `${c.key} (${c.short})`).join(', ');
  const cats = Object.keys(CATEGORIES)
    .map((k) => `${k} (${CATEGORIES[k].label})`)
    .join(', ');
  const myEvents = EventStore.load();
  const mine = myEvents.length
    ? myEvents
        .map(
          (e) => `- #${e.id}: "${e.title}" ${e.date} ${e.city} ${e.cat} ${(e.org ?? []).join(' ')}`
        )
        .join('\n')
    : '(ei vielä yhtään)';

  return `Olet "Miitti-apuri", suomenkielinen avustaja Threadsmiitit-sovelluksessa, jolla ihmiset lisäävät yhteisötapaamisia (miittejä).
Tänään on ${DH.todayStr()}. Vastaa AINA suomeksi, lämpimästi ja lyhyesti.

Tehtäväsi: auta käyttäjää LISÄÄMÄÄN, MUOKKAAMAAN tai POISTAMAAN heidän omia miittejään.

Tunnetut kaupungit (käytä avainta jos kaupunki on listalla): ${cities}.
Jos kaupunki EI ole listalla mutta on oikea Suomen kunta (esim. "Rovaniemi", "Savonlinna"), se on silti sallittu — anna silloin city-kenttään kunnan nimi sellaisenaan, niin uusi kaupunki luodaan automaattisesti. Hyväksy vain oikeita Suomen kuntia. Älä koskaan kieltäydy vain siksi, että kaupunkia ei ole valmiiksi listalla.
Sallitut lajit (käytä avainta): ${cats}.

Käyttäjän omat miitit (id, jolla muokataan/poistetaan):
${mine}

Lisäämiseen tarvitaan AINA: nimi (title), päivämäärä (date, muoto YYYY-MM-DD), kaupunki (city-avain) JA linkki Threads-postaukseen (url, alkaa https://www.threads.com/…).
Jos käyttäjä antaa selkeän toiminnan (esim. "saunamiitti", "lautapelit"), käytä sitä suoraan nimenä äläkä kysy erikseen.
Threads-postauslinkki on PAKOLLINEN: älä koskaan lisää miittiä ilman sitä. Jos linkki puuttuu, älä lisää — pyydä käyttäjää tekemään postaus Threadsiin ja liittämään sen linkki.
Jos jokin muu pakollinen TODELLA puuttuu, älä lisää — kysy vain se puuttuva tieto lyhyesti.
Muokkaus ja poisto vaativat id:n (4 merkkiä). Jos käyttäjä ei anna id:tä mutta omia miittejä on vain yksi, voit käyttää sitä.

Vastaa AINA pelkkänä JSON-objektina, ei muuta tekstiä, tässä muodossa:
{"reply":"<viestisi käyttäjälle>","actions":[{"op":"add","title":"..","date":"YYYY-MM-DD","city":"<avain>","cat":"<avain>","org":"@nimi","url":"https://www.threads.com/...","area":""}]}
op voi olla: "add", "edit" (vaatii "id"), "remove" (vaatii "id"), tai jätä actions tyhjäksi [] jos vain keskustelet/kysyt.
Älä KOSKAAN keksi url-linkkiä itse — käytä vain käyttäjän antamaa Threads-linkkiä. org-kenttä on järjestäjän Threads-nimimerkki.`;
}

/**
 * Extracts a Threads post URL and organizer handle from free text.
 * @param {string} text
 * @returns {object|null} Object with url and handle properties, or null.
 */
function parseThreadsLink(text) {
  const m = String(text).match(/https?:\/\/(?:www\.)?threads\.(?:com|net)\/[^\s)]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,)]+$/, '');
  const h = url.match(/threads\.(?:com|net)\/([@A-Za-z0-9._]+)/i);
  return { url, handle: h ? h[1] : null };
}

/**
 * Robustly parses a JSON object from a string, tolerating surrounding text.
 * @param {string} s
 * @returns {object|null}
 */
function parseJSON(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // Try extracting the first {...} block.
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Applies a single action from the assistant's response to EventStore.
 * @param {object} a - Action object with op, and relevant fields.
 * @param {object|null} link - Detected Threads link, or null if none found.
 * @returns {object|null} Result object with changed, kind, label (and optional event), or null.
 */
function applyAction(a, link) {
  if (!a || !a.op) return null;

  if (a.op === 'add') {
    // Backfill url/org from a pasted Threads link if the model omitted them.
    if (link) {
      if (!a.url) a.url = link.url;
      if (!a.org) a.org = link.handle;
    }
    const validUrl = /^https?:\/\/(www\.)?threads\.(com|net)\//i.test(String(a.url ?? '').trim());
    if (!validUrl) {
      return {
        changed: false,
        kind: 'error',
        label: 'Threads-postauslinkki puuttuu — miittiä ei lisätty',
      };
    }
    const ev = EventStore.add(a);
    return { changed: true, kind: 'add', event: ev, label: `Lisätty #${ev.id}` };
  }

  if (a.op === 'edit' && a.id) {
    const ev = EventStore.edit(String(a.id).replace('#', ''), a);
    return ev
      ? { changed: true, kind: 'edit', event: ev, label: `Päivitetty #${ev.id}` }
      : { changed: false, kind: 'error', label: `Tunnistetta #${a.id} ei löytynyt` };
  }

  if (a.op === 'remove' && a.id) {
    const id = String(a.id).replace('#', '');
    const ev = EventStore.find(id);
    const ok = EventStore.remove(id);
    return ok
      ? { changed: true, kind: 'remove', event: ev, label: `Poistettu #${id}` }
      : { changed: false, kind: 'error', label: `Tunnistetta #${id} ei löytynyt` };
  }

  return null;
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** Animated three-dot typing indicator. */
function Typing({ color }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, padding: '2px 0' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: color,
            animation: `tmblink 1s ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes tmblink{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:.9;transform:translateY(-3px)}}`}</style>
    </span>
  );
}

/**
 * Renders message text with minimal markdown: **bold** and *italic*.
 * @param {string} text
 * @returns {React.ReactNode}
 */
function renderText(text) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/**
 * Confirmation chip shown after an action (add/edit/remove/error).
 * @param {object} props
 */
function ResultChip({ r, t, ct }) {
  const err = r.kind === 'error';
  const color = err ? '#C2483F' : r.kind === 'remove' ? ct.inkSoft : t.brand;
  return (
    <div
      style={{
        marginTop: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '10px 12px',
        borderRadius: 14,
        background: ct.surface,
        border: `1px solid ${ct.line}`,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: hexA(color, 0.14),
          color,
        }}
      >
        {err || r.kind === 'remove' ? <IconClose size={16} /> : <IconCheck size={16} sw={2.4} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: ct.ink }}>{r.label}</div>
        {r.event && r.kind !== 'remove' && (
          <div
            style={{
              fontSize: 12,
              color: ct.inkSoft,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {r.event.title} · {DH.fmtShort(r.event.date)} · {cityName(r.event.city)}
          </div>
        )}
      </div>
      {r.event && r.kind !== 'remove' && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            fontFamily: 'ui-monospace, monospace',
            color,
            background: hexA(color, 0.12),
            padding: '3px 7px',
            borderRadius: 6,
            flexShrink: 0,
          }}
        >
          #{r.event.id}
        </span>
      )}
    </div>
  );
}

/**
 * A single chat message bubble (user or assistant).
 * @param {object} props
 */
function Bubble({ m, t, ct }) {
  const isUser = m.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '84%' }}>
        <div
          style={{
            padding: '11px 14px',
            borderRadius: 18,
            borderBottomRightRadius: isUser ? 5 : 18,
            borderBottomLeftRadius: isUser ? 18 : 5,
            background: isUser ? t.brand : ct.surface,
            color: isUser ? t.brandInk : ct.ink,
            border: isUser ? 'none' : `1px solid ${ct.line}`,
            fontSize: 14.5,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {m.typing ? <Typing color={ct.inkSoft} /> : renderText(m.text)}
        </div>
        {m.cards && m.cards.map((c, i) => <ResultChip key={i} r={c} t={t} ct={ct} />)}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  'Liitä Threads-linkki',
  'Lisää uusi miitti',
  'Näytä omat miittini',
  'Miten tämä toimii?',
];

const GREETING =
  'Moi! 👋 Olen Miitti-apuri. Voin lisätä, muokata tai poistaa sinun omia miittejäsi.\n\n**Helpoin tapa:** liitä tähän miittisi **Threads-postauksen linkki** — poimin siitä järjestäjän ja linkin valmiiksi, ja kysyn vain loput (nimi, päivä, kaupunki).\n\nVoit myös kirjoittaa vapaasti, esim. *"Lisää lautapelimiitti Tampereelle 12.4.2026"*.';

/**
 * AI chat assistant bottom sheet.
 *
 * @param {object} props
 */
export function ChatAssistant({ t, open, onClose, refresh }) {
  const ct = t.card;
  const [msgs, setMsgs] = useState([{ role: 'assistant', text: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user', text }];
    setMsgs(next);
    setBusy(true);

    try {
      const link = parseThreadsLink(text);
      const history = next
        .slice(-8)
        .map((m) => `${m.role === 'user' ? 'Käyttäjä' : 'Apuri'}: ${m.text}`)
        .join('\n');
      const linkNote = link
        ? `\n\nKäyttäjä liitti Threads-linkin. Poimi siitä AUTOMAATTISESTI nämä äläkä kysy niitä uudelleen:\n- url: ${link.url}\n- järjestäjä (org): ${link.handle}\nKäytä näitä suoraan add-toiminnossa. Et voi nähdä postauksen sisältöä, joten kysy ystävällisesti loput pakolliset tiedot joita ei vielä ole (nimi, päivämäärä, kaupunki). Jos jokin niistä tuli jo aiemmin viesteissä, käytä sitä.`
        : '';
      const prompt = `${systemContext()}${linkNote}\n\nKeskustelu tähän asti:\n${history}\n\nVastaa nyt JSON-objektina.`;
      const raw = await complete(prompt);
      const parsed = parseJSON(raw);

      const reply = parsed && parsed.reply ? parsed.reply : raw || 'Hmm, en saanut vastausta.';
      const results = [];

      if (parsed && Array.isArray(parsed.actions)) {
        for (const a of parsed.actions) {
          results.push(applyAction(a, link));
        }
      }

      if (results.some((r) => r && r.changed)) {
        refresh?.();
      }

      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          text: reply,
          cards: results.filter((r) => r && r.event).map((r) => ({ ...r })),
        },
      ]);
    } catch (e) {
      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          text: e.message?.includes('ANTHROPIC_API_KEY')
            ? 'Miitti-apuri ei ole käytössä — ANTHROPIC_API_KEY puuttuu palvelimelta.'
            : 'Voi ei — yhteys apuriin katkesi. Yritä hetken päästä uudelleen.',
        },
      ]);
    }

    setBusy(false);
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 300,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10,8,6,0.5)',
          opacity: open ? 1 : 0,
          transition: 'opacity .28s ease',
          backdropFilter: open ? 'blur(2px)' : 'none',
          WebkitBackdropFilter: open ? 'blur(2px)' : 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '90%',
          background: ct.bg,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform .34s cubic-bezier(.32,.72,0,1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '16px 18px 12px',
            borderBottom: `1px solid ${ct.line}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: t.brand,
              color: t.brandInk,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IconSpark size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: t.fontHead,
                fontWeight: t.headWeight,
                fontSize: 16,
                color: ct.ink,
                letterSpacing: t.headSpacing,
              }}
            >
              Miitti-apuri
            </div>
            <div style={{ fontSize: 11.5, color: ct.inkSoft }}>
              Lisää, muokkaa tai poista omia miittejäsi
            </div>
          </div>
          <button
            aria-label="Sulje apuri"
            onClick={onClose}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 34,
              height: 34,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: ct.inkSoft,
              background: ct.surfaceAlt,
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {msgs.map((m, i) => (
            <Bubble key={i} m={m} t={t} ct={ct} />
          ))}
          {busy && <Bubble t={t} ct={ct} m={{ role: 'assistant', typing: true }} />}
        </div>

        {/* Quick-reply chips — shown only until the user sends the first message */}
        {msgs.length <= 1 && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '0 16px 10px',
              flexShrink: 0,
              scrollbarWidth: 'none',
            }}
          >
            {QUICK_CHIPS.map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: `1px solid ${ct.line}`,
                  color: ct.ink,
                  background: ct.surface,
                  fontFamily: 'inherit',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 14px',
            paddingBottom: 18,
            borderTop: `1px solid ${ct.line}`,
            background: ct.bg,
            flexShrink: 0,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder="Kirjoita viesti…"
            disabled={busy}
            style={{
              flex: 1,
              boxSizing: 'border-box',
              padding: '13px 16px',
              fontSize: 15,
              borderRadius: 999,
              border: `1px solid ${ct.line}`,
              background: ct.surface,
              color: ct.ink,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            aria-label="Lähetä viesti"
            onClick={send}
            disabled={busy || !input.trim()}
            style={{
              all: 'unset',
              cursor: busy || !input.trim() ? 'default' : 'pointer',
              width: 48,
              height: 48,
              borderRadius: 999,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: input.trim() ? t.brand : ct.surfaceAlt,
              color: input.trim() ? t.brandInk : ct.inkSoft,
            }}
          >
            <IconArrowUpRight size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
