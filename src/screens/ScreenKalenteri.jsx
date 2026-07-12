/**
 * @fileoverview Kalenteri screen — monthly calendar with dot indicators
 * and a selected-day meetup list.
 */

import { useState, useEffect } from 'react';
import { CITIES, MONTHS_FI, DH } from '../data.js';
import EventStore from '../store/EventStore.js';
import { catColor, MeetupCard, Pill } from '../components/ui.jsx';
import { IconArrowLeft, IconChevron } from '../components/icons.jsx';

/**
 * Small round navigation button (prev/next month).
 * @param {object} props
 */
function RoundBtn({ t, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        width: 38,
        height: 38,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: t.surface,
        border: `1px solid ${t.line}`,
        color: t.ink,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Kalenteri screen — month grid with colour-coded dots per meetup.
 * Tapping a day with meetups selects it and shows its meetups below the grid.
 *
 * @param {object} props
 */
export function ScreenKalenteri({ t, onOpen, cityFilter, setCityFilter, events }) {
  const todayD = DH.today();
  const [ym, setYm] = useState({ y: todayD.getFullYear(), m: todayD.getMonth() });
  const [selDay, setSelDay] = useState(null);

  const meetups = events.filter((m) => cityFilter === 'all' || m.city === cityFilter);

  // Map day-of-month → meetups for the currently viewed month.
  const byDay = {};
  meetups.forEach((m) => {
    const d = DH.parse(m.date);
    if (d.getFullYear() === ym.y && d.getMonth() === ym.m) {
      (byDay[d.getDate()] ||= []).push(m);
    }
  });

  // Build the calendar cell array (nulls for empty leading cells).
  const first = new Date(ym.y, ym.m, 1);
  const startCol = (first.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isToday = (d) =>
    d === todayD.getDate() && ym.m === todayD.getMonth() && ym.y === todayD.getFullYear();

  const shift = (dir) =>
    setYm((s) => {
      let m = s.m + dir;
      let y = s.y;
      if (m < 0) {
        m = 11;
        y--;
      }
      if (m > 11) {
        m = 0;
        y++;
      }
      return { y, m };
    });

  // Clear selection when the month changes.
  useEffect(() => {
    setSelDay(null);
  }, [ym.y, ym.m]);

  const selMeetups = selDay && byDay[selDay] ? byDay[selDay] : [];
  const activeCities = new Set(events.map((m) => m.city));

  return (
    <div style={{ padding: '4px 0 12px' }}>
      {/* City filter */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          // Top padding reserves room for the :focus-visible ring so overflow-x:auto doesn't clip it.
          padding: '4px 20px 16px',
          scrollbarWidth: 'none',
        }}
      >
        <Pill t={t} active={cityFilter === 'all'} onClick={() => setCityFilter('all')}>
          Kaikki
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

      {/* Month header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 14px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: t.fontHead,
            fontWeight: t.headWeight,
            fontSize: 22,
            color: t.ink,
            letterSpacing: t.headSpacing,
            textTransform: t.headTransform,
          }}
        >
          {MONTHS_FI[ym.m]} <span style={{ color: t.inkSoft, fontWeight: 500 }}>{ym.y}</span>
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <RoundBtn t={t} onClick={() => shift(-1)}>
            <IconArrowLeft size={18} />
          </RoundBtn>
          <RoundBtn t={t} onClick={() => shift(1)}>
            <IconChevron size={18} />
          </RoundBtn>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
          {['MA', 'TI', 'KE', 'TO', 'PE', 'LA', 'SU'].map((d) => (
            <div
              key={d}
              style={{
                textAlign: 'center',
                fontSize: 10.5,
                fontWeight: 700,
                color: t.inkSoft,
                padding: '4px 0',
                letterSpacing: '0.04em',
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const has = byDay[d];
            const today = isToday(d);
            const sel = selDay === d;
            const cellDate = new Date(ym.y, ym.m, d);
            const todayPlain = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
            const past = cellDate < todayPlain;
            return (
              <button
                key={d}
                onClick={() => has && setSelDay(sel ? null : d)}
                style={{
                  all: 'unset',
                  cursor: has ? 'pointer' : 'default',
                  boxSizing: 'border-box',
                  aspectRatio: '1',
                  borderRadius: t.radiusSm,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  background: sel
                    ? t.brand
                    : today
                      ? `${t.brand}1a`
                      : has
                        ? t.surface
                        : 'transparent',
                  border: `1px solid ${sel ? t.brand : has ? t.line : 'transparent'}`,
                  opacity: past && !today ? 0.5 : 1,
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: today || has ? 700 : 500,
                    color: sel ? t.brandInk : today ? t.brand : t.ink,
                    fontFamily: t.fontBody,
                  }}
                >
                  {d}
                </span>
                {has && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 2,
                      marginTop: 3,
                      position: 'absolute',
                      bottom: 6,
                    }}
                  >
                    {has.slice(0, 3).map((m, k) => (
                      <span
                        key={k}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 999,
                          background: sel ? t.brandInk : catColor(m.cat, t),
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day meetups */}
      <div style={{ padding: '20px 20px 0' }}>
        {selDay && selMeetups.length > 0 ? (
          <div>
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
              {selDay}. {MONTHS_FI[ym.m]} · {selMeetups.length} miitti
              {selMeetups.length > 1 ? 'ä' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selMeetups.map((m) => (
                <MeetupCard
                  key={EventStore.favKey(m)}
                  m={m}
                  t={t.card}
                  onClick={() => onOpen(m)}
                  fav={false}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              color: t.inkSoft,
              fontSize: 13.5,
              padding: '8px 20px 0',
              lineHeight: 1.5,
            }}
          >
            {Object.keys(byDay).length === 0
              ? 'Ei miittejä tässä kuussa. Selaa eteenpäin →'
              : 'Valitse päivä jolla on pisteitä nähdäksesi miitit.'}
          </div>
        )}
      </div>
    </div>
  );
}
