/**
 * @fileoverview Self-service moderator roster management — lets a root
 * admin grant or revoke moderator status by Threads handle. Only ever
 * rendered for a root admin (see `AuthContext.isRootAdmin`) as a UX
 * convenience that hides the button from everyone else, including
 * self-service moderators; the real security boundary is server-side —
 * POST/DELETE /api/moderators both require a root admin session via
 * `requireAdmin` (see netlify/functions/lib/session.mjs).
 */

import { useState, useEffect } from 'react';
import ModeratorStore from '../store/ModeratorStore.js';
import { Sheet, ConfirmSheet, hexA } from './ui.jsx';
import { IconUsers, IconClose } from './icons.jsx';

/**
 * Formats a millisecond timestamp as a short Finnish relative-time string.
 * Mirrors AdminInbox.jsx's relTime — kept local rather than shared since
 * it's a single three-line pure function, not worth a new module for.
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
 * A single self-service moderator row: handle, who added them, when, and a
 * remove button.
 * @param {object} props - Props: m (moderator entry), t (card theme), onRemove, busy.
 */
function ModeratorRow({ m, t, onRemove, busy }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderRadius: t.radius,
        border: `1px solid ${t.line}`,
        background: t.surfaceAlt,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: t.ink }}>@{m.username}</div>
        <div style={{ fontSize: 12, color: t.inkSoft }}>
          Lisäsi @{m.addedBy}
          {relTime(m.addedAt) ? ` · ${relTime(m.addedAt)}` : ''}
        </div>
      </div>
      <button
        onClick={onRemove}
        disabled={busy}
        aria-label={`Poista @${m.username} moderaattoreista`}
        style={{
          all: 'unset',
          cursor: busy ? 'default' : 'pointer',
          padding: '8px 14px',
          borderRadius: t.radiusPill,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontWeight: 600,
          fontSize: 13,
          fontFamily: 'inherit',
          opacity: busy ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        Poista
      </button>
    </div>
  );
}

/**
 * Root-admin-only moderator roster management sheet: lists self-service
 * moderators and lets a root admin add or remove one by Threads handle.
 * @param {object} props - Props: t (theme), open, onClose.
 * @returns {React.ReactElement}
 */
export function ModeratorManager({ t, open, onClose }) {
  const tc = t.card;
  const [moderators, setModerators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(null);

  const [handleInput, setHandleInput] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState(null);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  // Refetch the roster whenever the sheet opens — a grant/revoke by another
  // root admin elsewhere is now visible here too, since it's server-side.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);
    ModeratorStore.list().then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.ok) {
        setModerators(r.moderators);
      } else {
        setModerators([]);
        setListError(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleAdd() {
    const username = handleInput.trim();
    if (!username) return;
    setAddBusy(true);
    setAddError(null);
    const result = await ModeratorStore.add(username);
    setAddBusy(false);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setModerators(result.moderators);
    setHandleInput('');
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    setRemoveError(null);
    const result = await ModeratorStore.remove(removeTarget);
    setRemoveBusy(false);
    if (!result.ok) {
      setRemoveError(result.error);
      return;
    }
    setModerators(result.moderators);
    setRemoveTarget(null);
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} t={tc} label="Ylläpito · Moderaattorit">
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
              <IconUsers size={20} />
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
                Ylläpito · Moderaattorit
              </div>
              <div style={{ fontSize: 11.5, color: tc.inkSoft }}>
                {loading
                  ? 'Ladataan…'
                  : moderators.length
                    ? `${moderators.length} moderaattoria`
                    : 'Ei moderaattoreita vielä'}
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

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <input
              type="text"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="@kayttajatunnus"
              disabled={addBusy}
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '11px 14px',
                borderRadius: tc.radiusPill,
                border: `1px solid ${tc.line}`,
                background: tc.surface,
                color: tc.ink,
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={addBusy || !handleInput.trim()}
              aria-label="Lisää moderaattori"
              style={{
                all: 'unset',
                cursor: addBusy ? 'default' : 'pointer',
                padding: '11px 20px',
                borderRadius: tc.radiusPill,
                background: t.brand,
                color: t.brandInk,
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'inherit',
                opacity: addBusy || !handleInput.trim() ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              Lisää
            </button>
          </div>

          {(addError || listError) && (
            <div
              role="alert"
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: tc.radius,
                background: hexA('#C2483F', 0.1),
                border: `1px solid ${hexA('#C2483F', 0.28)}`,
                fontSize: 13,
                fontWeight: 600,
                color: '#C2483F',
              }}
            >
              {addError || listError}
            </div>
          )}

          {!loading && moderators.length > 0 && (
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {moderators.map((m) => (
                <ModeratorRow
                  key={m.username}
                  m={m}
                  t={tc}
                  busy={removeTarget === m.username && removeBusy}
                  onRemove={() => {
                    setRemoveError(null);
                    setRemoveTarget(m.username);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
        t={tc}
        label="Vahvista moderaattorin poisto"
        title={`Poista @${removeTarget} moderaattoreista?`}
        message="Henkilö menettää oikeuden julkaista, hylätä ja peruuttaa miittejä välittömästi."
        error={removeError}
        confirmLabel="Poista"
        busy={removeBusy}
      />
    </>
  );
}
