/**
 * @fileoverview Profile sheet — shown when the logged-in user taps their avatar.
 *
 * Displays:
 *  - User identity (avatar + @username + link to Threads profile)
 *  - Kaupunki-ilmoitukset: city notification subscription picker
 *  - Suosikit: meetups the user has favourited
 *  - Miittini: meetups the user added while logged in (addedBy.username match),
 *    each with a delete button
 *  - Kirjaudu ulos button
 */

import { useState } from 'react';
import { CITIES } from '../data.js';
import EventStore from '../store/EventStore.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { MeetupCard, Sheet, hexA } from './ui.jsx';
import { IconArrowUpRight, IconClose } from './icons.jsx';

/**
 * @param {object} props - Props: open, onClose, t (theme), favs (Set), events, onOpen, onDelete,
 *   onOpenChat, onEditInForm, notifPref, onSubscribeCity, onUnsubscribeCity.
 * @returns {React.ReactElement}
 */
export function ProfileSheet({
  open,
  onClose,
  t,
  favs,
  events,
  onOpen,
  onDelete,
  onOpenChat,
  onEditInForm,
  notifPref,
  onSubscribeCity,
  onUnsubscribeCity,
}) {
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

        {/* ── Kaupunki-ilmoitukset ───────────────────────────────── */}
        <Section label="Kaupunki-ilmoitukset" tc={tc}>
          <CityNotifPicker
            key={notifPref?.cityKey ?? 'none'}
            notifPref={notifPref}
            onSubscribe={onSubscribeCity}
            onUnsubscribe={onUnsubscribeCity}
            tc={tc}
          />
        </Section>

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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {onEditInForm && (
                      <button
                        onClick={() => {
                          onClose();
                          onEditInForm(m);
                        }}
                        style={actionBtn(tc, false)}
                      >
                        Muokkaa lomakkeella
                      </button>
                    )}
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
 * City notification subscription picker.
 * Shows the subscribed city when one is active, or a selector to choose one.
 * @param {object} props
 * @param {{ cityKey: string, seenKeys: string[] } | null} props.notifPref
 * @param {Function} props.onSubscribe - Called with cityKey when user saves.
 * @param {Function} props.onUnsubscribe - Called when user removes the subscription.
 * @param {object} props.tc - Card theme tokens.
 * @returns {React.ReactElement}
 */
function CityNotifPicker({ notifPref, onSubscribe, onUnsubscribe, tc }) {
  const [selectedKey, setSelectedKey] = useState('');

  if (notifPref) {
    const cityRecord = CITIES.find((c) => c.key === notifPref.cityKey);
    const displayName = cityRecord?.short ?? notifPref.cityKey;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13.5, color: tc.ink, lineHeight: 1.5 }}>
          Ilmoitukset kaupungista: <strong>{displayName}</strong>
        </div>
        <p style={{ fontSize: 12.5, color: tc.inkSoft, margin: 0, lineHeight: 1.5 }}>
          Näet ilmoituksen sovelluksessa, kun kaupunkiisi lisätään uusia miittejä.
        </p>
        <button onClick={onUnsubscribe} style={actionBtn(tc, true)}>
          Poista ilmoitus
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12.5, color: tc.inkSoft, margin: 0, lineHeight: 1.5 }}>
        Valitse kaupunkisi saadaksesi ilmoituksen, kun sinne lisätään uusia miittejä.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          aria-label="Valitse kaupunki ilmoituksille"
          style={{
            flex: 1,
            padding: '9px 10px',
            borderRadius: 8,
            border: `1px solid ${tc.line}`,
            background: tc.surface,
            color: selectedKey ? tc.ink : tc.inkSoft,
            fontSize: 14,
            fontFamily: 'inherit',
            fontWeight: 500,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">Valitse kaupunki…</option>
          {CITIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.short}
            </option>
          ))}
        </select>
        <button
          onClick={() => selectedKey && onSubscribe(selectedKey)}
          disabled={!selectedKey}
          style={{
            ...actionBtn(tc, false),
            opacity: selectedKey ? 1 : 0.45,
            cursor: selectedKey ? 'pointer' : 'default',
          }}
        >
          Tallenna
        </button>
      </div>
    </div>
  );
}

/**
 * Section with a heading label.
 * @param {object} props
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
 * @param {object} props
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
