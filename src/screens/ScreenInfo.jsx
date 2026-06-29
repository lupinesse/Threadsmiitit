/**
 * @fileoverview Info screen — hub with four sub-pages:
 * Miten järjestän miitin, Karaokehaaste 2026, Kaupungit & alueet, Menneet miitit.
 */

import { CITIES, ADMINS, DH } from '../data.js';
import { hexA, MeetupCard, cityName } from '../components/ui.jsx';
import {
  IconThreads,
  IconUsers,
  IconSpark,
  IconMic,
  IconPin,
  IconClock,
  IconArrowLeft,
} from '../components/icons.jsx';

/**
 * Shared back-arrow header for sub-pages.
 * @param {object} props
 */
function SubHeader({ t, title, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '2px 20px 16px' }}>
      <button
        onClick={onBack}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: 36,
          height: 36,
          borderRadius: 999,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: t.surface,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontFamily: 'inherit',
        }}
      >
        <IconArrowLeft size={18} />
      </button>
      <h2
        style={{
          margin: 0,
          fontFamily: t.fontHead,
          fontWeight: t.headWeight,
          fontSize: 20,
          color: t.ink,
          letterSpacing: t.headSpacing,
          textTransform: t.headTransform,
        }}
      >
        {title}
      </h2>
    </div>
  );
}

/** Empty-state message for sub-pages. */
function Empty({ t, text }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '36px 20px',
        color: t.inkSoft,
        fontSize: 13.5,
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

/** Menneet miitit sub-page. */
function SubMenneet({ t, onOpen, onBack, events }) {
  const past = events
    .filter((m) => !DH.isUpcoming(m.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div style={{ padding: '4px 0 24px' }}>
      <SubHeader t={t} title="Menneet miitit" onBack={onBack} />
      <div style={{ padding: '0 20px' }}>
        {past.length === 0 ? (
          <Empty t={t} text="Ei vielä mennyttä — kausi on vasta alussa!" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {past.map((m) => (
              <MeetupCard key={m.id} m={m} t={t.card} onClick={() => onOpen(m)} dim fav={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Kaupungit & alueet sub-page. */
function SubKaupungit({ t, onBack, events }) {
  return (
    <div style={{ padding: '4px 0 24px' }}>
      <SubHeader t={t} title="Kaupungit & alueet" onBack={onBack} />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CITIES.map((c) => {
          const count = events.filter((m) => m.city === c.key && DH.isUpcoming(m.date)).length;
          return (
            <div
              key={c.key}
              style={{
                padding: 14,
                borderRadius: t.radius,
                background: t.surface,
                border: `1px solid ${t.line}`,
                boxShadow: t.cardShadow,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ color: t.brand, flexShrink: 0 }}>
                    <IconPin size={18} />
                  </span>
                  <span
                    style={{
                      fontFamily: t.fontHead,
                      fontWeight: t.headWeight,
                      fontSize: 15.5,
                      color: t.ink,
                      letterSpacing: t.headSpacing,
                    }}
                  >
                    {c.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: count ? t.brand : t.inkSoft,
                    background: count ? hexA(t.brand, 0.1) : t.surfaceAlt,
                    padding: '4px 9px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {count || '–'}
                </span>
              </div>
              {c.note && (
                <div
                  style={{
                    fontSize: 12,
                    color: t.inkSoft,
                    marginTop: 8,
                    lineHeight: 1.45,
                    paddingLeft: 28,
                  }}
                >
                  {c.note}
                </div>
              )}
              {c.account && (
                <div
                  style={{
                    fontSize: 12,
                    color: t.brand,
                    marginTop: 6,
                    fontWeight: 600,
                    paddingLeft: 28,
                  }}
                >
                  {c.account}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Miten järjestän miitin? sub-page. */
function SubJarjesta({ t, onBack }) {
  const steps = [
    {
      n: 1,
      title: 'Keksi idea ja paikka',
      body: 'Lautapelejä, kävelylenkki, karaoke, saunailta — mikä vain. Valitse rento julkinen paikka johon on helppo tulla.',
    },
    {
      n: 2,
      title: 'Päätä päivä ja kellonaika',
      body: 'Arki-illat ja viikonloput toimivat parhaiten. Anna ihmisille viikko tai pari aikaa nähdä postaus.',
    },
    {
      n: 3,
      title: 'Tee postaus Threadsiin',
      body: 'Kerro mitä, missä ja milloin. Lisää #threadsmiitit ja oman kaupunkisi tagi, niin löydämme sen.',
    },
    {
      n: 4,
      title: 'Ilmoita meille',
      body: 'Lisää miitti tästä sovelluksesta "Lisää miitti" -napilla tai tägää ylläpito. Lisäämme sen kalenteriin.',
    },
    {
      n: 5,
      title: 'Ole paikalla & toivota tervetulleeksi',
      body: 'Tunnistautukaa vaikka sovitulla värillä tai esineellä. Pieni porukka riittää — laatu ennen määrää!',
    },
  ];
  return (
    <div style={{ padding: '4px 0 24px' }}>
      <SubHeader t={t} title="Miten järjestän miitin?" onBack={onBack} />
      <div style={{ padding: '0 20px' }}>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.55, color: t.inkSoft }}>
          Kuka tahansa voi järjestää miitin — sinun ei tarvitse olla &ldquo;virallinen&rdquo;
          mitään. Näin pääset alkuun:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {steps.map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: 14 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  flexShrink: 0,
                  background: t.brand,
                  color: t.brandInk,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 15,
                  fontFamily: t.fontHead,
                }}
              >
                {s.n}
              </div>
              <div style={{ paddingTop: 2 }}>
                <div
                  style={{
                    fontFamily: t.fontHead,
                    fontWeight: t.headWeight,
                    fontSize: 16,
                    color: t.ink,
                    letterSpacing: t.headSpacing,
                    marginBottom: 3,
                  }}
                >
                  {s.title}
                </div>
                <div style={{ fontSize: 13.5, color: t.inkSoft, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 22,
            padding: '14px 16px',
            borderRadius: t.radius,
            background: hexA(t.brand, 0.08),
            border: `1px solid ${hexA(t.brand, 0.2)}`,
            fontSize: 13,
            lineHeight: 1.5,
            color: t.ink,
          }}
        >
          <strong>Turvallisuus ensin:</strong> tapaa julkisilla paikoilla, kuuntele fiilistä ja
          muistakaa hyvä meininki. Kaikki ovat tervetulleita. 💜
        </div>
      </div>
    </div>
  );
}

/** Karaokehaaste 2026 sub-page. */
function SubKaraoke({ t, onBack, events }) {
  const upcoming = events
    .filter((m) => m.cat === 'karaoke' && DH.isUpcoming(m.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div style={{ padding: '4px 0 24px' }}>
      <SubHeader t={t} title="Karaokehaaste 2026" onBack={onBack} />
      <div style={{ padding: '0 20px' }}>
        <div
          style={{
            padding: 20,
            borderRadius: t.radius,
            color: '#fff',
            marginBottom: 18,
            background: 'linear-gradient(135deg, #C7507A, #8E3A8E)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <IconMic size={28} />
            <h2
              style={{
                margin: '10px 0 6px',
                fontFamily: t.fontHead,
                fontWeight: t.headWeight,
                fontSize: 23,
                lineHeight: 1.1,
              }}
            >
              Sama biisi, koko Suomi
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, opacity: 0.92 }}>
              Vuoden 2026 yhteishaaste: jokaisessa karaokemiitissä lauletaan kuukauden yhteinen
              kappale. Kuvatkaa hetki ja jakakaa #karaokehaaste2026.
            </p>
          </div>
          <div style={{ position: 'absolute', right: -20, top: -10, opacity: 0.15 }}>
            <IconMic size={120} sw={1} />
          </div>
        </div>

        <div
          style={{
            fontFamily: t.fontHead,
            fontWeight: t.headWeight,
            fontSize: 15,
            color: t.ink,
            marginBottom: 12,
            letterSpacing: t.headSpacing,
          }}
        >
          Tulevat karaokemiitit
        </div>
        {upcoming.length === 0 ? (
          <Empty t={t} text="Ei tulevia karaokemiittejä juuri nyt." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: 14,
                  borderRadius: t.radius,
                  background: t.surface,
                  border: `1px solid ${t.line}`,
                  boxShadow: t.cardShadow,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 5,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: '#C7507A',
                      fontFamily: t.fontHead,
                    }}
                  >
                    {DH.weekdayFi(m.date)} {DH.fmtShort(m.date)}
                  </span>
                  <span style={{ fontSize: 12, color: t.inkSoft, fontWeight: 600 }}>
                    · {cityName(m.city)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: t.fontHead,
                    fontWeight: t.headWeight,
                    fontSize: 15.5,
                    color: t.ink,
                    letterSpacing: t.headSpacing,
                  }}
                >
                  {m.title}
                </div>
                <div style={{ fontSize: 12, color: t.inkSoft, marginTop: 3 }}>
                  {m.org.join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Info hub root — hero card + 2×2 tile grid + admin credits.
 * Sub-pages slide in by setting `sub`.
 *
 * @param {object} props - Props: t (theme), onOpen, sub (current sub-page key or null), setSub, events.
 */
export function ScreenInfo({ t, onOpen, sub, setSub, events }) {
  if (sub === 'menneet')
    return <SubMenneet t={t} onOpen={onOpen} onBack={() => setSub(null)} events={events} />;
  if (sub === 'jarjesta') return <SubJarjesta t={t} onBack={() => setSub(null)} />;
  if (sub === 'karaoke') return <SubKaraoke t={t} onBack={() => setSub(null)} events={events} />;
  if (sub === 'kaupungit')
    return <SubKaupungit t={t} onBack={() => setSub(null)} events={events} />;

  const past = events.filter((m) => !DH.isUpcoming(m.date));
  const tiles = [
    {
      k: 'jarjesta',
      icon: <IconSpark size={22} />,
      title: 'Miten järjestän miitin?',
      sub: 'Vinkit ensimmäiseen omaan miittiin',
      color: t.brand,
    },
    {
      k: 'karaoke',
      icon: <IconMic size={22} />,
      title: 'Karaokehaaste 2026',
      sub: 'Yhteinen biisihaaste ympäri Suomen',
      color: '#C7507A',
    },
    {
      k: 'kaupungit',
      icon: <IconPin size={22} />,
      title: 'Kaupungit & alueet',
      sub: `${CITIES.length} paikkakuntaa mukana`,
      color: '#4E7FA8',
    },
    {
      k: 'menneet',
      icon: <IconClock size={22} />,
      title: 'Menneet miitit',
      sub: `${past.length} jo pidettyä tapaamista`,
      color: '#7A776F',
    },
  ];

  return (
    <div style={{ padding: '4px 20px 24px' }}>
      {/* Hero */}
      <div
        style={{
          padding: 20,
          borderRadius: t.radius,
          background: t.brand,
          color: t.brandInk,
          marginBottom: 20,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              opacity: 0.85,
              marginBottom: 8,
            }}
          >
            <IconThreads size={16} /> THREADSMIITIT
          </div>
          <h2
            style={{
              margin: '0 0 8px',
              fontFamily: t.fontHead,
              fontWeight: t.headWeight,
              fontSize: 22,
              lineHeight: 1.15,
              letterSpacing: t.headSpacing,
            }}
          >
            Threadsista tutuksi — oikeasti
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, opacity: 0.92 }}>
            Vapaaehtoisten ylläpitämä kokoontumiskalenteri. Kaikki miitit järjestetään Threadsissä,
            täällä ne löytyvät yhdestä paikasta.
          </p>
        </div>
        <div style={{ position: 'absolute', right: -30, bottom: -30, opacity: 0.12 }}>
          <IconUsers size={150} sw={1} />
        </div>
      </div>

      {/* Tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {tiles.map((tile) => (
          <button
            key={tile.k}
            onClick={() => setSub(tile.k)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              padding: 16,
              minHeight: 130,
              borderRadius: t.radius,
              background: t.surface,
              border: `1px solid ${t.line}`,
              boxShadow: t.cardShadow,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: t.radiusSm,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: hexA(tile.color, 0.12),
                color: tile.color,
                marginBottom: 14,
              }}
            >
              {tile.icon}
            </div>
            <div>
              <div
                style={{
                  fontFamily: t.fontHead,
                  fontWeight: t.headWeight,
                  fontSize: 15,
                  color: t.ink,
                  lineHeight: 1.2,
                  letterSpacing: t.headSpacing,
                }}
              >
                {tile.title}
              </div>
              <div style={{ fontSize: 12, color: t.inkSoft, marginTop: 4, lineHeight: 1.3 }}>
                {tile.sub}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Admin credits */}
      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: t.radius,
          background: t.surfaceAlt,
          border: `1px solid ${t.line}`,
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, marginBottom: 6 }}>
          Ylläpito
        </div>
        <div style={{ fontSize: 13, color: t.inkSoft, lineHeight: 1.5 }}>
          Sivua ylläpitää vapaaehtoistiimi: {ADMINS.join(', ')}. Ota yhteyttä Threadsissä jos haluat
          mukaan tekemään.
        </div>
      </div>
    </div>
  );
}
