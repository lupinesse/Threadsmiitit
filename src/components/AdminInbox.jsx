/**
 * @fileoverview Admin moderation queue — lists user-submitted meetups awaiting
 * review and lets an admin publish (approve) or reject each one before it
 * reaches the public feed. Only rendered for signed-in admins (see
 * `AuthContext.isAdmin`); this is a UX gate, not a security boundary.
 */

import EventStore from '../store/EventStore.js';
import { MeetupCard, Sheet, hexA } from './ui.jsx';
import { IconCheck, IconClose, IconClock, IconShield } from './icons.jsx';

const URL_RE = /^https?:\/\/(www\.)?threads\.(com|net)\//i;

/**
 * Formats a millisecond timestamp as a short Finnish relative-time string.
 * @param {number} [ts]
 * @returns {string|null}
 */
function relTime(ts) {
  if (!ts) return null;
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'juuri nyt';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min sitten`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h sitten`;
  const d = Math.floor(h / 24);
  return `${d} pv sitten`;
}

/**
 * A single pending submission: read-only card preview + link validity check
 * + relative submitted-time + Julkaise/Hylkää actions.
 * @param {object} props - Props: m (meetup), t (card theme), onApprove, onReject.
 */
function AdminCard({ m, t, onApprove, onReject }) {
  const validUrl = URL_RE.test(String(m.url ?? ''));
  const ago = relTime(m.submitted);

  return (
    <div
      style={{
        borderRadius: t.radius,
        border: `1px solid ${t.line}`,
        background: t.surfaceAlt,
        overflow: 'hidden',
      }}
    >
      <div style={{ pointerEvents: 'none', padding: 6 }}>
        <MeetupCard t={t} m={{ ...m, status: 'approved' }} fav={false} onClick={() => {}} />
      </div>
      <div
        style={{
          padding: '2px 14px 13px',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: validUrl ? '#1f8a5b' : '#C2483F',
            }}
          >
            {validUrl ? <IconCheck size={14} sw={2.4} /> : <IconClose size={14} sw={2.4} />}
            {validUrl ? 'Threads-linkki OK' : 'Linkki puuttuu / virheellinen'}
          </span>
          {ago && (
            <span
              style={{
                fontSize: 12,
                color: t.inkSoft,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <IconClock size={13} sw={2} /> {ago}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onReject}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              padding: '11px 18px',
              borderRadius: t.radiusPill,
              border: `1px solid ${t.line}`,
              color: t.ink,
              fontWeight: 600,
              fontSize: 13.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <IconClose size={15} sw={2.2} /> Hylkää
          </button>
          <button
            onClick={onApprove}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              flex: 1,
              textAlign: 'center',
              padding: '11px 18px',
              borderRadius: t.radiusPill,
              background: t.brand,
              color: t.brandInk,
              fontWeight: 700,
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <IconCheck size={16} sw={2.4} /> Julkaise
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Admin review inbox sheet. Lists every pending submission oldest-first.
 * @param {object} props - Props: t (theme), open, onClose, refresh.
 * @returns {React.ReactElement}
 */
export function AdminInbox({ t, open, onClose, refresh }) {
  const tc = t.card;
  const pending = EventStore.pending();

  function handleApprove(id) {
    EventStore.approve(id);
    refresh?.();
  }

  function handleReject(id) {
    EventStore.reject(id);
    refresh?.();
  }

  return (
    <Sheet open={open} onClose={onClose} t={tc} label="Ylläpito · Tarkistus">
      <div style={{ padding: '4px 20px 36px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '12px 0 20px',
            borderBottom: `1px solid ${tc.line}`,
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
            <IconShield size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: tc.fontHead,
                fontWeight: tc.headWeight,
                fontSize: 16,
                color: tc.ink,
                letterSpacing: tc.headSpacing,
              }}
            >
              Ylläpito · Tarkistus
            </div>
            <div style={{ fontSize: 11.5, color: tc.inkSoft }}>
              {pending.length
                ? `${pending.length} miittiä odottaa julkaisua`
                : 'Ei tarkistettavia miittejä'}
            </div>
          </div>
          <button
            aria-label="Sulje"
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
              color: tc.inkSoft,
              background: tc.surface,
              border: `1px solid ${tc.line}`,
              flexShrink: 0,
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {pending.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '52px 24px',
              color: tc.inkSoft,
            }}
          >
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 999,
                background: hexA(t.brand, 0.1),
                color: t.brand,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <IconCheck size={30} sw={2.2} />
            </div>
            <div
              style={{
                fontFamily: tc.fontHead,
                fontWeight: tc.headWeight,
                fontSize: 18,
                color: tc.ink,
                marginBottom: 4,
                letterSpacing: tc.headSpacing,
              }}
            >
              Kaikki tarkistettu 🎉
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Käyttäjien ilmoittamat uudet miitit ilmestyvät tänne odottamaan julkaisua.
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {pending.map((m) => (
              <AdminCard
                key={m.id}
                m={m}
                t={tc}
                onApprove={() => handleApprove(m.id)}
                onReject={() => handleReject(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
