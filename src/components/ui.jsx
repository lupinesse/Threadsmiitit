/**
 * @fileoverview Shared UI primitives: MeetupCard, DateLeaf, CatTag, Pill, Sheet,
 * and colour helper utilities used across all screens.
 */

import { useState } from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y.js';
import { CATEGORIES, CITIES, MONTHS_FI, DH } from '../data.js';
import {
  IconChevron,
  IconCalendar,
  IconPin,
  IconUsers,
  IconHeart,
  IconArrowUpRight,
  IconSpark,
  IconThreads,
  IconClose,
  IconCheck,
  IconCopy,
} from './icons.jsx';

// ── Colour utilities ────────────────────────────────────────────────────────

/**
 * Converts a 6-digit hex colour to `rgba(r,g,b,alpha)`.
 * @param {string} hex  - e.g. '#C7507A'
 * @param {number} alpha - 0–1
 * @returns {string}
 */
export function hexA(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Returns the display colour for a meetup category, lightened by ~34% toward
 * white when rendered on a dark surface.
 * @param {string} cat - Category key.
 * @param {object} t   - Theme token object.
 * @returns {string} CSS colour value.
 */
export function catColor(cat, t) {
  const base = CATEGORIES[cat]?.color ?? CATEGORIES.yleinen.color;
  if (!t?.dark) return base;
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.34);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/**
 * Returns the short display name for a city key.
 * @param {string} key
 * @returns {string}
 */
export function cityName(key) {
  return CITIES.find((c) => c.key === key)?.short ?? key;
}

// ── Atoms ───────────────────────────────────────────────────────────────────

/**
 * Small colour-coded category tag / badge.
 * @param {object} props - Props: cat (category key), t (theme), size ('sm'|'lg').
 */
export function CatTag({ cat, t, size = 'sm' }) {
  const color = catColor(cat, t);
  const label = CATEGORIES[cat]?.label ?? CATEGORIES.yleinen.label;
  const big = size === 'lg';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: big ? 13 : 11.5,
        fontWeight: 700,
        lineHeight: 1,
        color,
        background: hexA(color, 0.12),
        padding: big ? '5px 10px' : '4px 8px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: big ? 7 : 5.5,
          height: big ? 7 : 5.5,
          borderRadius: 999,
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

/**
 * Horizontal filter pill, styled as active (filled brand) or inactive.
 * @param {object} props
 */
export function Pill({ t, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        padding: '8px 14px',
        borderRadius: t.radiusPill ?? 999,
        fontSize: 13.5,
        fontWeight: active ? 700 : 600,
        background: active ? t.brand : t.surface,
        color: active ? t.brandInk : t.inkSoft,
        border: `1px solid ${active ? t.brand : t.line}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        flexShrink: 0,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

/**
 * 48×~60px calendar leaf showing weekday, day number and 3-letter month.
 * The weekday cap uses the category colour for visual rhythm.
 * @param {object} props
 */
export function DateLeaf({ date, cat, t }) {
  const d = DH.parse(date);
  const weekday = DH.weekdayFi(date);
  const day = d.getDate();
  const month = MONTHS_FI[d.getMonth()].slice(0, 3).toUpperCase();
  const color = catColor(cat, t);

  return (
    <div
      style={{
        width: 48,
        flexShrink: 0,
        borderRadius: 10,
        overflow: 'hidden',
        border: `1px solid ${t.line}`,
      }}
    >
      <div
        style={{
          background: color,
          padding: '3px 0',
          textAlign: 'center',
          fontSize: 9,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '0.05em',
        }}
      >
        {weekday}
      </div>
      <div style={{ textAlign: 'center', padding: '2px 0 4px', background: t.surface }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            lineHeight: 1.1,
            color: t.ink,
            fontFamily: t.fontHead,
          }}
        >
          {day}
        </div>
        <div
          style={{
            fontSize: 8,
            fontWeight: 700,
            color: t.inkSoft,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {month}
        </div>
      </div>
    </div>
  );
}

/**
 * Core meetup card — a tappable row with DateLeaf, category tag, city,
 * title, organizer line, and a chevron. Shows a heart badge when the
 * meetup is in the user's favourites, and a dashed border + "Odottaa
 * hyväksyntää" pill when `m.status === 'pending'`.
 *
 * @param {object} props
 * @param {object} props.m - Meetup data object.
 * @param {object} props.t - Theme token object.
 * @param {Function} props.onClick - Click handler.
 * @param {boolean} [props.dim] - Reduces opacity (e.g. for past events).
 * @param {boolean} [props.fav] - Whether this meetup is favourited.
 */
export function MeetupCard({ m, t, onClick, dim = false, fav = false }) {
  const pending = m.status === 'pending';
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: t.radius,
        background: t.bg ?? t.surface,
        border: pending ? `1px dashed ${t.line}` : `1px solid ${t.line}`,
        boxShadow: t.cardShadow,
        opacity: dim ? 0.55 : pending ? 0.8 : 1,
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <DateLeaf date={m.date} cat={m.cat} t={t} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 5,
            flexWrap: 'wrap',
          }}
        >
          <CatTag cat={m.cat} t={t} />
          <span style={{ fontSize: 12, color: t.inkSoft, fontWeight: 500 }}>
            {cityName(m.city)}
          </span>
          {m.user && m.id && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                fontFamily: 'ui-monospace, monospace',
                color: t.brand,
                background: hexA(t.brand, 0.1),
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              #{m.id}
            </span>
          )}
          {fav && (
            <span
              aria-label="Suosikki"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: '#e0546a',
                flexShrink: 0,
              }}
            >
              <IconHeart size={13} />
            </span>
          )}
          {pending && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: t.inkSoft,
                background: t.surfaceAlt,
                padding: '2px 7px',
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              Odottaa hyväksyntää
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: t.fontHead,
            fontWeight: t.headWeight ?? 700,
            fontSize: 15.5,
            color: t.ink,
            lineHeight: 1.25,
            letterSpacing: t.headSpacing,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {m.title}
        </div>
        {m.org && m.org.length > 0 && (
          <div style={{ fontSize: 12, color: t.inkSoft, marginTop: 3 }}>{m.org.join(', ')}</div>
        )}
        {m.addedBy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            {m.addedBy.avatarUrl ? (
              <img
                src={m.addedBy.avatarUrl}
                alt=""
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: t.brand,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 8,
                  fontWeight: 800,
                  color: t.brandInk,
                }}
              >
                {m.addedBy.username[0].toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: 11, color: t.inkSoft }}>@{m.addedBy.username}</span>
          </div>
        )}
      </div>
      <IconChevron size={18} style={{ color: t.inkSoft, flexShrink: 0 }} />
    </button>
  );
}

// ── Meetup detail content (used inside a Sheet from App) ────────────────────

/**
 * Icon button that copies a URL to the clipboard.
 * Shows a check icon for 2 seconds after a successful copy.
 * @param {object} props - Props: url (string), t (theme).
 */
function CopyButton({ url, t }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard access denied — silently ignore; the button stays in its default state
      });
  }

  return (
    <button
      aria-label={copied ? 'Linkki kopioitu' : 'Kopioi Threads-postauksen linkki'}
      onClick={handleCopy}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        width: 52,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radiusPill,
        border: `1px solid ${copied ? t.brand : t.line}`,
        color: copied ? t.brand : t.ink,
        background: copied ? hexA(t.brand, 0.1) : t.surface,
        transition: 'color 0.18s, border-color 0.18s',
        flexShrink: 0,
      }}
    >
      {copied ? <IconCheck size={20} sw={2.4} /> : <IconCopy size={18} />}
    </button>
  );
}

/**
 * A labelled detail row with an icon, primary text, and optional subtitle.
 * @param {object} props - Props: icon (ReactNode), label (string), sub (string, optional), t (theme).
 */
export function DetailRow({ icon, label, sub, t }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 13,
        alignItems: 'flex-start',
        padding: '9px 0',
        borderBottom: `1px solid ${t.line}`,
      }}
    >
      <div style={{ color: t.brand, marginTop: 1, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: t.ink, lineHeight: 1.25 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 12.5, color: t.inkSoft, marginTop: 2, lineHeight: 1.3 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full meetup detail view, rendered inside a Sheet.
 * @param {object} props - Props: m (meetup or null), t (theme), fav (boolean), onFav, onClose (optional).
 */
export function MeetupDetail({ m, t, fav, onFav, onClose }) {
  if (!m) return null;
  const days = DH.daysBetween(DH.todayStr(), m.date);
  const when =
    days === 0 ? 'Tänään' : days === 1 ? 'Huomenna' : days > 0 ? `${days} päivän päästä` : 'Mennyt';
  const city = CITIES.find((x) => x.key === m.city);
  const profile = (h) => 'https://www.threads.com/' + (String(h).startsWith('@') ? h : '@' + h);
  const hasPost = !!(m.url && /^https?:\/\//.test(m.url));
  const firstHandle = m.org && m.org[0] ? m.org[0] : null;
  const linkHref = hasPost ? m.url : firstHandle ? profile(firstHandle) : null;

  return (
    <div style={{ padding: '4px 20px 28px' }}>
      <div style={{ height: 5 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <CatTag cat={m.cat} t={t} size="lg" />
        {DH.isThisWeek(m.date) && (
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: t.glow,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <IconSpark size={13} /> {when.toUpperCase()}
          </span>
        )}
        {onClose && (
          <button
            aria-label="Sulje"
            onClick={onClose}
            style={{
              all: 'unset',
              cursor: 'pointer',
              marginLeft: 'auto',
              width: 34,
              height: 34,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: t.inkSoft,
              background: t.surface,
              border: `1px solid ${t.line}`,
              flexShrink: 0,
            }}
          >
            <IconClose size={18} />
          </button>
        )}
      </div>
      <h2
        style={{
          margin: 0,
          fontFamily: t.fontHead,
          fontWeight: t.headWeight,
          fontSize: 27,
          lineHeight: 1.12,
          color: t.ink,
          letterSpacing: t.headSpacing,
        }}
      >
        {m.title}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '18px 0 4px' }}>
        <DetailRow
          t={t}
          icon={<IconCalendar size={19} />}
          label={DH.fmtLong(m.date)}
          sub={`${m.date.split('-').reverse().join('.')} · ${when}`}
        />
        <DetailRow
          t={t}
          icon={<IconPin size={19} />}
          label={city ? city.short : cityName(m.city)}
          sub={
            m.area
              ? m.area
              : city && city.note
                ? 'Katso tarkka paikka Threads-postauksesta'
                : 'Tarkka paikka Threads-postauksessa'
          }
        />
        <div
          style={{
            display: 'flex',
            gap: 13,
            alignItems: 'flex-start',
            padding: '9px 0',
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div style={{ color: t.brand, marginTop: 1, flexShrink: 0 }}>
            <IconUsers size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.ink, lineHeight: 1.25 }}>
              {m.org.length > 1 ? 'Järjestäjät' : 'Järjestäjä'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
              {m.org.map((h) => (
                <a
                  key={h}
                  href={profile(h)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    textDecoration: 'none',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: t.brand,
                    background: hexA(t.brand, 0.1),
                    padding: '4px 9px',
                    borderRadius: 999,
                  }}
                >
                  {h} <IconArrowUpRight size={12} sw={2.2} />
                </a>
              ))}
            </div>
          </div>
        </div>
        {m.addedBy && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '9px 0',
              borderBottom: `1px solid ${t.line}`,
            }}
          >
            {m.addedBy.avatarUrl ? (
              <img
                src={m.addedBy.avatarUrl}
                alt=""
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: t.brand,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 15,
                  fontWeight: 800,
                  color: t.brandInk,
                }}
              >
                {m.addedBy.username[0].toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: t.inkSoft, fontWeight: 500, marginBottom: 2 }}>
                Lisätty sovelluksessa
              </div>
              <a
                href={m.addedBy.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 14, fontWeight: 600, color: t.brand, textDecoration: 'none' }}
              >
                @{m.addedBy.username}
              </a>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: '14px 16px',
          borderRadius: t.radius,
          background: t.surfaceAlt,
          border: `1px solid ${t.line}`,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: t.inkSoft,
        }}
      >
        {hasPost
          ? 'Ilmoittautuminen ja kaikki yksityiskohdat löytyvät järjestäjän Threads-postauksesta. Käy kommentoimassa että pääset mukaan! 👋'
          : 'Tälle miitille ei ole vielä suoraa postauslinkkiä. Pääset järjestäjän Threads-profiiliin alta — kysy häneltä lisätiedot ja ilmoittautuminen. 👋'}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {linkHref ? (
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              textDecoration: 'none',
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '15px 16px',
              borderRadius: t.radiusPill,
              background: t.brand,
              color: t.brandInk,
              fontWeight: 700,
              fontSize: 15,
              fontFamily: t.fontBody,
            }}
          >
            <IconThreads size={18} />{' '}
            {hasPost ? 'Avaa Threads-postaus' : 'Avaa järjestäjän Threads'}
          </a>
        ) : (
          <div
            style={{
              flex: 1,
              boxSizing: 'border-box',
              textAlign: 'center',
              padding: '15px 16px',
              borderRadius: t.radiusPill,
              background: t.surfaceAlt,
              color: t.inkSoft,
              fontWeight: 700,
              fontSize: 14,
              fontFamily: t.fontBody,
              border: `1px solid ${t.line}`,
            }}
          >
            Ei Threads-linkkiä
          </div>
        )}
        {hasPost && <CopyButton url={m.url} t={t} />}
        <button
          aria-label={fav ? 'Poista suosikeista' : 'Lisää suosikiksi'}
          aria-pressed={fav}
          onClick={onFav}
          style={{
            all: 'unset',
            cursor: 'pointer',
            boxSizing: 'border-box',
            width: 52,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: t.radiusPill,
            border: `1px solid ${fav ? t.brand : t.line}`,
            color: fav ? t.brand : t.ink,
            background: fav ? hexA(t.brand, 0.1) : t.surface,
          }}
        >
          <IconHeart size={20} fill={fav ? t.brand : 'none'} />
        </button>
      </div>
    </div>
  );
}

/**
 * Bottom sheet overlay. Slides up from the bottom with a scrim behind it.
 *
 * The panel carries `role="dialog"`, `aria-modal`, and `aria-label` so
 * screen readers announce it correctly. Escape closes the sheet; Tab/Shift+Tab
 * stay trapped inside; focus is restored to the triggering element on close.
 *
 * @param {object} props
 * @param {boolean} props.open - Whether the sheet is visible.
 * @param {Function} props.onClose - Callback to close the sheet.
 * @param {object} props.t - Theme token object.
 * @param {string} props.label - Accessible name for the dialog (aria-label).
 * @param {React.ReactNode} props.children
 */
export function Sheet({ open, onClose, t, label, children }) {
  const { panelRef } = useDialogA11y({ open, onClose });
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '92%',
          background: t.bg,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform .34s cubic-bezier(.32,.72,0,1)',
          overflowY: 'auto',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
          outline: 'none',
        }}
      >
        <div
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            background: t.line,
            margin: '12px auto 0',
          }}
        />
        {children}
      </div>
    </div>
  );
}
