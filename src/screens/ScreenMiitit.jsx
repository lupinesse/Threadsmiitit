/**
 * @fileoverview Miitit screen — the home list view.
 * Shows a "this week" highlight rail, city filter pills, group-by toggle,
 * and the full upcoming meetup list grouped by date or city.
 */

import { CITIES, DH } from '../data.js';
import EventStore from '../store/EventStore.js';
import { catColor, cityName, MeetupCard, CatTag, Pill } from '../components/ui.jsx';
import { IconCalendar, IconPin, IconSpark } from '../components/icons.jsx';

/**
 * Wide horizontal card for the "Tällä viikolla" rail.
 * @param {object} props
 */
function WeekCard({ m, t, onClick }) {
  const accent = catColor(m.cat, t);
  const days = DH.daysBetween(DH.todayStr(), m.date);
  const when = days === 0 ? 'Tänään' : days === 1 ? 'Huomenna' : DH.weekdayFi(m.date);
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        flexShrink: 0,
        width: 220,
        borderRadius: t.radius,
        overflow: 'hidden',
        background: t.surface,
        border: `1px solid ${t.line}`,
        boxShadow: t.cardShadow,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ height: 6, background: accent }} />
      <div style={{ padding: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 800,
              color: t.glow,
              fontFamily: t.fontHead,
              letterSpacing: '0.02em',
            }}
          >
            {when} · {DH.fmtShort(m.date)}
          </span>
          <CatTag cat={m.cat} t={t} />
        </div>
        <div
          style={{
            fontFamily: t.fontHead,
            fontWeight: t.headWeight,
            fontSize: 17,
            color: t.ink,
            lineHeight: 1.15,
            letterSpacing: t.headSpacing,
            marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 39,
          }}
        >
          {m.title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: t.inkSoft,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <IconPin size={13} sw={2} /> {cityName(m.city)}
        </div>
      </div>
    </button>
  );
}

/**
 * Miitit (home) screen. Renders city filters, group-by toggle, optional
 * "this week" rail, and the grouped upcoming meetup list.
 *
 * @param {object} props
 * @param {Function} [props.onClearSearch] - Called when the user wants to clear an active search.
 */
export function ScreenMiitit({
  t,
  onOpen,
  favs,
  cityFilter,
  setCityFilter,
  groupBy,
  setGroupBy,
  query,
  onClearSearch,
  showThisWeek = true,
  events,
}) {
  const upcoming = events
    .filter((m) => DH.isUpcoming(m.date))
    .filter((m) => cityFilter === 'all' || m.city === cityFilter)
    .filter(
      (m) =>
        !query ||
        (m.title + ' ' + m.org.join(' ') + ' ' + cityName(m.city))
          .toLowerCase()
          .includes(query.toLowerCase())
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const thisWeek = upcoming.filter((m) => DH.isThisWeek(m.date));

  const groups =
    groupBy === 'date'
      ? (() => {
          const byMonth = {};
          upcoming.forEach((m) => {
            (byMonth[DH.monthKey(m.date)] ||= []).push(m);
          });
          return Object.keys(byMonth)
            .sort()
            .map((k) => ({ label: DH.monthLabel(byMonth[k][0].date), items: byMonth[k] }));
        })()
      : (() => {
          const byCity = {};
          upcoming.forEach((m) => {
            (byCity[m.city] ||= []).push(m);
          });
          return CITIES.filter((c) => byCity[c.key]).map((c) => ({
            label: c.short,
            items: byCity[c.key],
          }));
        })();

  const activeCities = new Set(events.filter((m) => DH.isUpcoming(m.date)).map((m) => m.city));

  return (
    <div>
      {/* Tällä viikolla rail */}
      {showThisWeek && cityFilter === 'all' && !query && thisWeek.length > 0 && (
        <div style={{ padding: '4px 0 18px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '0 20px 10px',
            }}
          >
            <span style={{ color: t.glow }}>
              <IconSpark size={17} />
            </span>
            <span
              style={{
                fontFamily: t.fontHead,
                fontWeight: t.headWeight,
                fontSize: 16,
                color: t.ink,
                letterSpacing: t.headSpacing,
                textTransform: t.headTransform,
              }}
            >
              Tällä viikolla
            </span>
            <span style={{ fontSize: 12, color: t.inkSoft, fontWeight: 600 }}>
              {thisWeek.length} miittiä
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              padding: '2px 20px 4px',
              scrollbarWidth: 'none',
            }}
          >
            {thisWeek.map((m, i) => (
              <WeekCard key={i} m={m} t={t.card} onClick={() => onOpen(m)} />
            ))}
          </div>
        </div>
      )}

      {/* City filter */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          padding: '0 20px 14px',
          scrollbarWidth: 'none',
        }}
      >
        <Pill t={t} active={cityFilter === 'all'} onClick={() => setCityFilter('all')}>
          Kaikki kaupungit
        </Pill>
        {CITIES.filter((c) => activeCities.has(c.key)).map((c) => (
          <Pill
            key={c.key}
            t={t}
            active={cityFilter === c.key}
            onClick={() => setCityFilter(c.key)}
          >
            {c.short}
          </Pill>
        ))}
      </div>

      {/* Group-by toggle + count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 12px',
        }}
      >
        <span style={{ fontSize: 12.5, color: t.inkSoft, fontWeight: 600 }}>
          {query
            ? `${upcoming.length} ${upcoming.length === 1 ? 'tulos' : 'tulosta'}`
            : `${upcoming.length} tulevaa miittiä`}
        </span>
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: 3,
            borderRadius: t.radiusPill,
            background: t.surfaceAlt,
            border: `1px solid ${t.line}`,
          }}
        >
          {[
            ['date', 'Päivämäärä'],
            ['city', 'Kaupunki'],
          ].map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setGroupBy(k)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: t.radiusPill,
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                background: groupBy === k ? t.surface : 'transparent',
                color: groupBy === k ? t.ink : t.inkSoft,
                boxShadow: groupBy === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped list */}
      <div style={{ padding: '0 20px' }}>
        {groups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: t.inkSoft }}>
            <div
              style={{
                marginBottom: 8,
                opacity: 0.5,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <IconCalendar size={36} />
            </div>
            {query ? (
              <>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: t.ink }}>
                  Ei tuloksia haulle &ldquo;{query}&rdquo;
                </div>
                {onClearSearch && (
                  <button
                    onClick={onClearSearch}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      marginTop: 12,
                      display: 'inline-block',
                      fontSize: 13,
                      fontWeight: 600,
                      color: t.brand,
                      fontFamily: 'inherit',
                    }}
                  >
                    Tyhjennä haku
                  </button>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: t.ink }}>
                  Ei tulevia miittejä
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {cityFilter !== 'all'
                    ? 'Kokeile toista kaupunkia tai lisää oma miittisi.'
                    : 'Lisää oma miittisi Lisää-välilehdeltä.'}
                </div>
              </>
            )}
          </div>
        )}
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 22 }}>
            <div
              style={{
                fontFamily: t.fontHead,
                fontWeight: t.headWeight,
                fontSize: 14,
                color: t.inkSoft,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 10,
                paddingLeft: 2,
              }}
            >
              {g.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.items.map((m, i) => (
                <MeetupCard
                  key={i}
                  m={m}
                  t={t.card}
                  onClick={() => onOpen(m)}
                  dim={!DH.isUpcoming(m.date)}
                  fav={favs.has(EventStore.favKey(m))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}
