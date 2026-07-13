/**
 * @fileoverview App shell — top-level state, navigation, and layout.
 *
 * Production theme is hard-coded to social + monodark.
 * The app renders as a centred 440px column with `position: fixed; inset: 0`
 * so it fills the viewport on mobile and stays centred on desktop.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { makeTheme } from './theme.js';
import { useAuth } from './contexts/AuthContext.jsx';
import EventStore from './store/EventStore.js';
import NotificationStore from './store/NotificationStore.js';
import { MeetupDetail, Sheet, hexA } from './components/ui.jsx';
import { ProfileSheet } from './components/ProfileSheet.jsx';
import { AdminInbox } from './components/AdminInbox.jsx';
import { ChatAssistant } from './components/ChatAssistant.jsx';
import { ScreenMiitit } from './screens/ScreenMiitit.jsx';
import { ScreenKalenteri } from './screens/ScreenKalenteri.jsx';
import { ScreenLisaa } from './screens/ScreenLisaa.jsx';
import { ScreenInfo } from './screens/ScreenInfo.jsx';
import {
  IconList,
  IconCalendar,
  IconPlus,
  IconInfo,
  IconSearch,
  IconClose,
  IconSpark,
  IconThreads,
  IconShield,
} from './components/icons.jsx';

const THEME = makeTheme('social', 'monodark');

/** Tabs available in the bottom nav bar. */
const TABS = [
  { k: 'miitit', label: 'Miitit', Icon: IconList },
  { k: 'kalenteri', label: 'Kalenteri', Icon: IconCalendar },
  { k: 'lisaa', label: 'Lisää', Icon: IconPlus },
  { k: 'info', label: 'Info', Icon: IconInfo },
];

/**
 * Root application component.
 * Owns all navigation state; passes data and callbacks down to screens.
 * @returns {React.ReactElement}
 */
export default function App() {
  const t = THEME;
  const { user, login, authError, clearAuthError, isAdmin, loading: authLoading } = useAuth();

  // ── Navigation state ───────────────────────────────────────────────────
  const [tab, setTab] = useState('miitit');
  const [infoSub, setInfoSub] = useState(null);

  // ── Data state ─────────────────────────────────────────────────────────
  /** Triggers a refetch from the server after the assistant mutates events. */
  const [bump, setBump] = useState(0);
  const refresh = useCallback(() => setBump((n) => n + 1), []);
  const [events, setEvents] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Refetch the visible event list whenever bump changes (i.e. after AI
  // assistant mutations or moderation actions). Includes the current user's
  // own pending submissions.
  useEffect(() => {
    let cancelled = false;
    EventStore.all().then((r) => {
      if (cancelled) return;
      if (r.ok) setEvents(r.events);
      // On failure, deliberately leave `events` as-is rather than clearing
      // it to [] — a transient fetch error shouldn't blank out an
      // already-loaded feed. Logged so a broken fetch isn't silent.
      else console.warn('[App] Failed to load events:', r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [bump, user?.username]);

  useEffect(() => {
    if (!isAdmin) {
      setPendingCount(0);
      return;
    }
    let cancelled = false;
    EventStore.pending().then((r) => {
      if (cancelled) return;
      if (r.ok) setPendingCount(r.events.length);
      else console.warn('[App] Failed to load pending count:', r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [bump, isAdmin]);

  // ── Interaction state ─────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);
  const [favs, setFavs] = useState(() => {
    try {
      const raw = localStorage.getItem('threadsmiitit_favs_v1');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      // localStorage unavailable or corrupted — start with an empty favourites set
      return new Set();
    }
  });
  const [cityFilter, setCityFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('date');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);

  // ── City notifications ─────────────────────────────────────────────
  const [notifPref, setNotifPref] = useState(() => NotificationStore.getPreference());
  const newMeetups = useMemo(
    () => NotificationStore.getNewMeetups(events, notifPref),
    [events, notifPref]
  );

  function subscribeCity(cityKey) {
    NotificationStore.setPreference(cityKey, events);
    setNotifPref(NotificationStore.getPreference());
  }

  function unsubscribeCity() {
    NotificationStore.clearPreference();
    setNotifPref(null);
  }

  function dismissNotification() {
    NotificationStore.markSeen(events);
    setNotifPref(NotificationStore.getPreference());
  }

  function viewNotificationCity() {
    if (notifPref) setCityFilter(notifPref.cityKey);
    dismissNotification();
  }

  function toggleFav(m) {
    const key = EventStore.favKey(m);
    setFavs((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      try {
        localStorage.setItem('threadsmiitit_favs_v1', JSON.stringify([...n]));
      } catch {
        // localStorage unavailable — favs remain in-memory only
      }
      return n;
    });
  }

  function openMeetup(m) {
    setSelected(m);
  }

  // Header label for the current screen.
  const headerTitle =
    tab === 'miitit'
      ? 'Miitit'
      : tab === 'kalenteri'
        ? 'Kalenteri'
        : tab === 'lisaa'
          ? 'Lisää miitti'
          : 'Info';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        background: t.bg,
        fontFamily: t.fontBody,
      }}
    >
      {/* App column */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: t.bg,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <header
          style={{
            flexShrink: 0,
            background: t.bg,
            borderBottom: `1px solid ${t.line}`,
            padding: '14px 16px 10px',
          }}
        >
          {searchOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hae miittejä…"
                style={{
                  flex: 1,
                  fontSize: 16,
                  padding: '9px 14px',
                  borderRadius: 999,
                  border: `1px solid ${t.line}`,
                  background: t.surface,
                  color: t.ink,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                aria-label="Sulje haku"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery('');
                }}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: t.inkSoft,
                  background: t.surface,
                  border: `1px solid ${t.line}`,
                }}
              >
                <IconClose size={20} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span style={{ color: t.inkSoft, flexShrink: 0 }}>
                  <IconThreads size={20} sw={1.5} />
                </span>
                <span
                  style={{
                    fontFamily: t.fontHead,
                    fontWeight: t.headWeight,
                    fontSize: 20,
                    color: t.ink,
                    letterSpacing: t.headSpacing,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headerTitle}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                {authLoading ? null : user ? (
                  <button
                    aria-label={`Kirjautuneena: @${user.username}. Avaa oma profiili.`}
                    onClick={() => setProfileOpen(true)}
                    title={`@${user.username} — oma profiili`}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      flexShrink: 0,
                      overflow: 'hidden',
                      border: `2px solid ${t.brand}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: t.surface,
                      color: t.brandInk,
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ color: t.brand }}>{user.username[0].toUpperCase()}</span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={login}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      height: 34,
                      padding: '0 12px',
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      border: `1px solid ${t.line}`,
                      color: t.inkSoft,
                      fontFamily: 'inherit',
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    <IconThreads size={14} sw={1.5} /> Kirjaudu
                  </button>
                )}
                {isAdmin && (
                  <button
                    aria-label={
                      pendingCount > 0 ? `Ylläpito, ${pendingCount} miittiä odottaa` : 'Ylläpito'
                    }
                    title="Ylläpito"
                    onClick={() => setAdminOpen(true)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      flexShrink: 0,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: t.ink,
                      background: t.surface,
                      border: `1px solid ${t.line}`,
                    }}
                  >
                    <IconShield size={19} />
                    {pendingCount > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -3,
                          right: -3,
                          minWidth: 18,
                          height: 18,
                          padding: '0 5px',
                          borderRadius: 999,
                          background: '#C2483F',
                          color: '#fff',
                          fontSize: 10.5,
                          fontWeight: 800,
                          lineHeight: '18px',
                          textAlign: 'center',
                          border: `2px solid ${t.bg}`,
                          boxSizing: 'content-box',
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </button>
                )}
                {tab === 'miitit' && (
                  <button
                    aria-label="Hae miittejä"
                    onClick={() => setSearchOpen(true)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: t.ink,
                      background: t.surface,
                      border: `1px solid ${t.line}`,
                    }}
                  >
                    <IconSearch size={19} />
                  </button>
                )}
                <button
                  onClick={() => setChatOpen(true)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    height: 38,
                    padding: '0 13px',
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: t.brand,
                    color: t.brandInk,
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: 13.5,
                  }}
                >
                  <IconSpark size={16} /> Apuri
                </button>
              </div>
            </div>
          )}
        </header>

        {/* ── Auth error banner ─────────────────────────────────────── */}
        {authError && (
          <div
            role="alert"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              background: hexA('#C2483F', 0.1),
              borderBottom: `1px solid ${hexA('#C2483F', 0.28)}`,
              fontSize: 13.5,
              fontWeight: 600,
              color: '#C2483F',
            }}
          >
            <span style={{ flex: 1 }}>Kirjautuminen epäonnistui. Yritä uudelleen.</span>
            <button
              aria-label="Sulje ilmoitus"
              onClick={clearAuthError}
              style={{
                all: 'unset',
                cursor: 'pointer',
                color: '#C2483F',
                opacity: 0.7,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <IconClose size={18} />
            </button>
          </div>
        )}

        {/* ── Screen content ────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {tab === 'miitit' && (
            <ScreenMiitit
              t={t}
              onOpen={openMeetup}
              favs={favs}
              cityFilter={cityFilter}
              setCityFilter={setCityFilter}
              groupBy={groupBy}
              setGroupBy={setGroupBy}
              query={query}
              onClearSearch={() => {
                setSearchOpen(false);
                setQuery('');
              }}
              showThisWeek
              events={events}
              notification={
                newMeetups.length > 0 && notifPref
                  ? { count: newMeetups.length, cityKey: notifPref.cityKey }
                  : null
              }
              onDismissNotification={dismissNotification}
              onViewNotificationCity={viewNotificationCity}
            />
          )}
          {tab === 'kalenteri' && (
            <ScreenKalenteri
              t={t}
              onOpen={openMeetup}
              cityFilter={cityFilter}
              setCityFilter={setCityFilter}
              events={events}
            />
          )}
          {tab === 'lisaa' && (
            <ScreenLisaa
              t={t}
              user={user}
              onDone={() => {
                refresh();
                setTab('miitit');
              }}
              onOpenChat={() => {
                setChatOpen(true);
                setTab('miitit');
              }}
              refresh={refresh}
            />
          )}
          {tab === 'info' && (
            <ScreenInfo
              t={t}
              onOpen={openMeetup}
              sub={infoSub}
              setSub={setInfoSub}
              events={events}
            />
          )}
        </main>

        {/* ── Bottom nav ─────────────────────────────────────────────── */}
        <nav
          style={{
            flexShrink: 0,
            background: t.surface,
            borderTop: `1px solid ${t.line}`,
            display: 'flex',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          }}
        >
          {TABS.map(({ k, label, Icon }) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => {
                  setTab(k);
                  if (k !== 'info') setInfoSub(null);
                }}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '10px 0 12px',
                  gap: 3,
                  color: active ? t.navActive : t.inkSoft,
                  fontFamily: 'inherit',
                }}
              >
                <Icon size={24} sw={active ? 2.2 : 1.8} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    letterSpacing: '0.01em',
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── Meetup detail sheet ────────────────────────────────────── */}
        <Sheet open={!!selected} onClose={() => setSelected(null)} t={t.card} label="Miitin tiedot">
          <MeetupDetail
            m={selected}
            t={t.card}
            fav={selected ? favs.has(EventStore.favKey(selected)) : false}
            onFav={() => selected && toggleFav(selected)}
            onClose={() => setSelected(null)}
            showAddedBy={isAdmin}
          />
        </Sheet>

        {/* ── Profile sheet ─────────────────────────────────────────── */}
        <ProfileSheet
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          t={t}
          favs={favs}
          events={events}
          bump={bump}
          onOpen={(m) => {
            setProfileOpen(false);
            setSelected(m);
          }}
          onDelete={refresh}
          onOpenChat={() => {
            setProfileOpen(false);
            setChatOpen(true);
          }}
          onEditInForm={(m) => setEditTarget(m)}
          notifPref={notifPref}
          onSubscribeCity={subscribeCity}
          onUnsubscribeCity={unsubscribeCity}
        />

        {/* ── Edit meetup sheet ──────────────────────────────────────── */}
        <Sheet
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          t={t.card}
          label="Muokkaa miittiä"
        >
          <ScreenLisaa
            key={editTarget?.id}
            t={t}
            user={user}
            editTarget={editTarget}
            onDone={() => {
              refresh();
              setEditTarget(null);
            }}
            onCancel={() => setEditTarget(null)}
            refresh={refresh}
          />
        </Sheet>

        {/* ── Admin moderation inbox ────────────────────────────────── */}
        {isAdmin && (
          <AdminInbox
            t={t}
            open={adminOpen}
            onClose={() => setAdminOpen(false)}
            refresh={refresh}
          />
        )}

        {/* ── Chat assistant sheet ───────────────────────────────────── */}
        <ChatAssistant t={t} open={chatOpen} onClose={() => setChatOpen(false)} refresh={refresh} />
      </div>
    </div>
  );
}
