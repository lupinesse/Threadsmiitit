/**
 * @fileoverview Profile sheet — shown when the logged-in user taps their avatar.
 *
 * Displays:
 *  - User identity (avatar + @username + link to Threads profile)
 *  - Suosikit: meetups the user has favourited
 *  - Miittini: meetups the user added while logged in (addedBy.username match),
 *    each with a delete button
 *  - Kirjaudu ulos button
 */

import EventStore from '../store/EventStore.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { MeetupCard, Sheet, hexA } from './ui.jsx';
import { IconArrowUpRight, IconClose } from './icons.jsx';

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t: object,
 *   favs: Set<string>,
 *   events: object[],
 *   onOpen: (m: object) => void,
 *   onDelete: () => void,
 *   onOpenChat: () => void,
 * }} props
 * @returns {React.ReactElement}
 */
export function ProfileSheet({ open, onClose, t, favs, events, onOpen, onDelete, onOpenChat }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const tc = t.card;
  const favourited = events.filter((m) => favs.has(EventStore.favKey(m)));
  const mine = events.filter((m) => m.addedBy?.username === user.username);

  function handleDelete(id) {
    EventStore.remove(id);
    onDelete(id);
  }

  return (
    <Sheet open={open} onClose={onClose} t={tc}>
      <div style={{ padding: '4px 20px 36px' }}>
        {/* ── User header ────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '12px 0 20px',
            borderBottom: `1px solid ${tc.line}`,
          }}
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                background: tc.brand,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 22,
                fontWeight: 800,
                color: tc.brandInk,
              }}
            >
              {user.username[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: tc.fontHead,
                fontWeight: tc.headWeight,
                fontSize: 18,
                color: tc.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              @{user.username}
            </div>
            <a
              href={user.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 12.5,
                color: tc.brand,
                textDecoration: 'none',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              Avaa Threads-profiili <IconArrowUpRight size={12} sw={2.2} />
            </a>
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

        {/* ── Suosikit ───────────────────────────────────────────── */}
        <Section label={`Suosikit${favourited.length ? ` (${favourited.length})` : ''}`} tc={tc}>
          {favourited.length === 0 ? (
            <Empty tc={tc}>Ei suosikkeja vielä — merkitse ❤️ avaamalla miitti</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {favourited.map((m) => (
                <MeetupCard
                  key={m.url}
                  m={m}
                  t={tc}
                  fav
                  onClick={() => {
                    onClose();
                    onOpen(m);
                  }}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── Miittini ───────────────────────────────────────────── */}
        <Section label={`Miittini${mine.length ? ` (${mine.length})` : ''}`} tc={tc}>
          {mine.length === 0 ? (
            <Empty tc={tc}>Et ole vielä lisännyt miittejä kirjautuneena</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mine.map((m) => (
                <div key={m.id ?? m.url}>
                  <MeetupCard
                    m={m}
                    t={tc}
                    onClick={() => {
                      onClose();
                      onOpen(m);
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenChat();
                      }}
                      style={actionBtn(tc, false)}
                    >
                      Muokkaa apurilla
                    </button>
                    <button onClick={() => handleDelete(m.id)} style={actionBtn(tc, true)}>
                      Poista
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Logout ─────────────────────────────────────────────── */}
        <button
          onClick={() => {
            logout();
            onClose();
          }}
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            width: '100%',
            textAlign: 'center',
            padding: '13px 16px',
            borderRadius: tc.radiusPill,
            border: `1px solid ${tc.line}`,
            color: tc.inkSoft,
            fontWeight: 600,
            fontSize: 14.5,
            fontFamily: 'inherit',
            marginTop: 8,
          }}
        >
          Kirjaudu ulos
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Section with a heading label.
 * @param {{label: string, tc: object, children: React.ReactNode}} props
 */
function Section({ label, tc, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: tc.inkSoft,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Empty state message.
 * @param {{tc: object, children: React.ReactNode}} props
 */
function Empty({ tc, children }) {
  return (
    <div
      style={{
        fontSize: 13.5,
        color: tc.inkSoft,
        padding: '14px 16px',
        borderRadius: tc.radius,
        background: hexA(tc.brand, 0.05),
        border: `1px solid ${tc.line}`,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Returns inline styles for a small action button.
 * @param {object} tc
 * @param {boolean} destructive
 * @returns {object}
 */
function actionBtn(tc, destructive) {
  return {
    all: 'unset',
    cursor: 'pointer',
    boxSizing: 'border-box',
    padding: '7px 14px',
    borderRadius: tc.radiusPill,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    border: `1px solid ${destructive ? hexA('#C2483F', 0.4) : tc.line}`,
    color: destructive ? '#C2483F' : tc.ink,
    background: destructive ? hexA('#C2483F', 0.06) : tc.surface,
  };
}
