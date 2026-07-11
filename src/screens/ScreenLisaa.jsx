/**
 * @fileoverview Lisää / Muokkaa miitti screen — 4-step guided form.
 * Step 0: title + date.
 * Step 1: city (pills or municipality autocomplete) + category.
 * Step 2: organizer handle + Threads post URL (validated).
 * Step 3: live preview card → submit.
 *
 * When `editTarget` is supplied the form pre-fills from the existing meetup and
 * calls EventStore.edit() instead of EventStore.add() on submit.
 */

import { useState, useId } from 'react';
import { CITIES, CATEGORIES, DH } from '../data.js';
import { FI_KUNNAT } from '../cities.js';
import EventStore from '../store/EventStore.js';
import { hexA, cityName, MeetupCard, Pill } from '../components/ui.jsx';
import {
  IconSpark,
  IconCheck,
  IconPlus,
  IconChevron,
  IconPin,
  IconSearch,
} from '../components/icons.jsx';

const STEPS = ['Perustiedot', 'Laji & paikka', 'Linkki', 'Valmis'];
const URL_RE = /^https?:\/\/(www\.)?threads\.(com|net)\//i;

/**
 * Field wrapper with a label and optional hint.
 *
 * For single-input fields, pass `inputId` and set the same value as the
 * child `<input>`'s `id` so the `<label htmlFor>` association is explicit.
 * For button/pill groups, pass `isGroup` — the wrapper becomes a `<div
 * role="group">` labelled by the visible label text via `aria-labelledby`.
 *
 * @param {object} props
 * @param {string} props.label - Visible label text.
 * @param {string} [props.hint] - Secondary hint shown below the label.
 * @param {object} props.t - Theme token object.
 * @param {React.ReactNode} props.children - Form control(s).
 * @param {string} [props.inputId] - `id` of the associated `<input>`. Omit for group fields.
 * @param {boolean} [props.isGroup] - True when children are a button/pill group (not a single input).
 */
function Field({ label, hint, t, children, inputId, isGroup }) {
  const labelId = useId();
  return (
    <div role={isGroup ? 'group' : undefined} aria-labelledby={isGroup ? labelId : undefined}>
      <label
        id={isGroup ? labelId : undefined}
        htmlFor={!isGroup && inputId ? inputId : undefined}
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 700,
          color: t.ink,
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {hint && (
        <div style={{ fontSize: 11.5, color: t.inkSoft, marginTop: -4, marginBottom: 8 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Returns inline styles for a standard text / date input.
 * @param {object} t - Theme token object.
 * @returns {object}
 */
function inputStyle(t) {
  return {
    boxSizing: 'border-box',
    width: '100%',
    padding: '13px 14px',
    fontSize: 15,
    borderRadius: t.radiusSm,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    fontFamily: 'inherit',
    outline: 'none',
  };
}

/**
 * Municipality autocomplete input backed by the official Finnish kunta list.
 * Shows up to 8 matching suggestions; accepts only valid Finnish municipalities.
 *
 * @param {object} props
 */
function CityAutocomplete({ t, value, onChange }) {
  const [open, setOpen] = useState(true);
  const q = (value ?? '').trim().toLowerCase();
  const matches =
    q.length >= 1
      ? FI_KUNNAT.filter((k) => k.toLowerCase().includes(q))
          .sort(
            (a, b) =>
              (a.toLowerCase().startsWith(q) ? -1 : 0) - (b.toLowerCase().startsWith(q) ? -1 : 0)
          )
          .slice(0, 8)
      : [];
  const exact = FI_KUNNAT.some((k) => k.toLowerCase() === q);
  const alreadyListed = CITIES.find((c) => !c.custom && c.short.toLowerCase() === q);

  return (
    <div style={{ position: 'relative', marginTop: 10 }}>
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 13,
            top: '50%',
            transform: 'translateY(-50%)',
            color: t.inkSoft,
          }}
        >
          <IconSearch size={16} />
        </span>
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          placeholder="Hae kuntaa, esim. Rovaniemi"
          style={{ ...inputStyle(t), paddingLeft: 38 }}
        />
      </div>

      {open && matches.length > 0 && !exact && (
        <div
          style={{
            marginTop: 6,
            borderRadius: t.radiusSm,
            border: `1px solid ${t.line}`,
            background: t.surface,
            overflow: 'hidden',
            boxShadow: '0 8px 24px -10px rgba(0,0,0,0.5)',
          }}
        >
          {matches.map((m) => (
            <button
              key={m}
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '11px 14px',
                borderBottom: `1px solid ${t.line}`,
                color: t.ink,
                fontSize: 14.5,
                fontFamily: 'inherit',
              }}
            >
              <IconPin size={15} sw={2} style={{ color: t.inkSoft, flexShrink: 0 }} />
              {m}
            </button>
          ))}
        </div>
      )}

      {exact && (
        <div
          style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 600,
            color: t.brand,
          }}
        >
          <IconCheck size={15} sw={2.4} /> {value}
          {alreadyListed ? ' — jo listalla' : ' — uusi kaupunki'}
        </div>
      )}

      {q.length >= 2 && matches.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: t.inkSoft, lineHeight: 1.4 }}>
          Ei löytynyt kuntaa &ldquo;{value}&rdquo;. Tarkista kirjoitusasu — lista perustuu
          Tilastokeskuksen virallisiin kuntiin.
        </div>
      )}
    </div>
  );
}

/**
 * Lisää / Muokkaa miitti screen — guided 4-step form.
 *
 * @param {object} props
 * @param {object} [props.editTarget] - Existing meetup to pre-fill and edit. When supplied the
 *   form calls EventStore.edit() on submit instead of EventStore.add().
 * @param {Function} [props.onCancel] - Called when the user cancels without saving (edit mode).
 */
export function ScreenLisaa({ t, user, onDone, onOpenChat, refresh, editTarget, onCancel }) {
  const isEdit = !!editTarget;

  // Determine whether editTarget's city is a built-in (non-custom) entry so we
  // can decide whether to show pills (built-in) or the autocomplete (custom).
  const editCityIsBuiltIn = isEdit
    ? !!CITIES.find((c) => !c.custom && c.key === editTarget.city)
    : false;

  const [step, setStep] = useState(0);
  const [f, setF] = useState(() => {
    if (!editTarget) return { title: '', city: '', cat: '', date: '', org: '', url: '' };
    return {
      title: editTarget.title ?? '',
      city: editCityIsBuiltIn
        ? (editTarget.city ?? '')
        : cityName(editTarget.city) || editTarget.city || '',
      cat: editTarget.cat ?? '',
      date: editTarget.date ?? '',
      org: (editTarget.org ?? []).join(', '),
      url: editTarget.url ?? '',
    };
  });
  const [saved, setSaved] = useState(null);
  const [customCity, setCustomCity] = useState(isEdit && !editCityIsBuiltIn);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const cityOk = customCity ? !!EventStore.canonicalKunta(f.city) : !!f.city.trim();
  const urlOk = URL_RE.test(f.url.trim());

  const canNext =
    step === 0
      ? f.title.trim() && f.date
      : step === 1
        ? cityOk && f.cat
        : step === 2
          ? f.org.trim() && urlOk
          : true;

  function submit() {
    if (isEdit) {
      const ev = EventStore.edit(editTarget.id, f);
      if (ev) {
        setSaved(ev);
        refresh?.();
      }
      return;
    }
    const payload = user
      ? {
          ...f,
          addedBy: {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            profileUrl: user.profileUrl,
          },
        }
      : f;
    const ev = EventStore.add(payload);
    setSaved(ev);
    refresh?.();
  }

  // ── Success view ────────────────────────────────────────────────────────────
  if (saved) {
    // A fresh submission is always 'pending'; an edit stays 'pending' if it
    // was resubmitted after a rejection, or keeps its prior approved status.
    const pendingReview = saved.status === 'pending';
    return (
      <div style={{ padding: '12px 20px 28px' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              background: hexA(t.brand, 0.12),
              color: t.brand,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <IconCheck size={32} sw={2.4} />
          </div>
          <h2
            style={{
              margin: '0 0 4px',
              fontFamily: t.fontHead,
              fontWeight: t.headWeight,
              fontSize: 23,
              color: t.ink,
              letterSpacing: t.headSpacing,
            }}
          >
            {isEdit
              ? pendingReview
                ? 'Muutokset lähetetty tarkistukseen! 🔍'
                : 'Miitti päivitetty! ✅'
              : 'Miitti lähetetty tarkistukseen! 🎉'}
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, color: t.inkSoft, lineHeight: 1.5 }}>
            {isEdit
              ? pendingReview
                ? 'Ylläpito tarkistaa muutokset ja julkaisee ne pian.'
                : 'Muutokset tallennettu.'
              : 'Ylläpito tarkistaa ja julkaisee sen pian — näet sen jo nyt merkinnällä "odottaa hyväksyntää".'}
          </p>
        </div>

        {!isEdit && (
          <div
            style={{
              padding: 16,
              borderRadius: t.radius,
              background: hexA(t.brand, 0.07),
              border: `1px solid ${hexA(t.brand, 0.22)}`,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12, color: t.inkSoft, fontWeight: 600, marginBottom: 6 }}>
              Miittisi tunniste
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                fontFamily: 'ui-monospace, monospace',
                color: t.brand,
                letterSpacing: '0.08em',
              }}
            >
              #{saved.id}
            </div>
            <div style={{ fontSize: 12.5, color: t.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
              Säilytä tämä — sillä voit{' '}
              <strong style={{ color: t.ink }}>muokata tai poistaa</strong> miitin apurin kautta.
              Esim. &ldquo;poista #{saved.id}&rdquo;.
            </div>
          </div>
        )}

        <div style={{ pointerEvents: 'none', marginBottom: 18 }}>
          <MeetupCard t={t.card} fav={false} m={saved} onClick={() => {}} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {!isEdit && (
            <button
              onClick={() => onOpenChat?.()}
              style={{
                all: 'unset',
                cursor: 'pointer',
                boxSizing: 'border-box',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '14px 18px',
                borderRadius: t.radiusPill,
                border: `1px solid ${t.line}`,
                color: t.ink,
                fontWeight: 600,
                fontSize: 14.5,
                fontFamily: 'inherit',
              }}
            >
              <IconSpark size={18} /> Hallitse apurilla
            </button>
          )}
          <button
            onClick={() => onDone()}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              flex: 1,
              textAlign: 'center',
              padding: '14px 18px',
              borderRadius: t.radiusPill,
              background: t.brand,
              color: t.brandInk,
              fontWeight: 700,
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          >
            Valmis
          </button>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '4px 20px 28px' }}>
      {/* Chat shortcut — shown only on step 0 in add mode */}
      {step === 0 && !isEdit && (
        <>
          <button
            onClick={() => onOpenChat?.()}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              borderRadius: t.radius,
              background: t.brand,
              color: t.brandInk,
              marginBottom: 14,
              boxShadow: `0 6px 18px -8px ${hexA(t.brand, 0.7)}`,
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: hexA('#ffffff', 0.18),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconSpark size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, fontFamily: t.fontHead }}>
                Lisää keskustelemalla
              </div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                Kerro miitistä apurille omin sanoin — se täyttää loput
              </div>
            </div>
            <IconChevron size={20} />
          </button>
          <div
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: t.inkSoft,
              marginBottom: 14,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            — TAI TÄYTÄ LOMAKE —
          </div>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: t.radius,
              background: hexA(t.brand, 0.08),
              border: `1px solid ${hexA(t.brand, 0.2)}`,
              marginBottom: 18,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: t.ink,
            }}
          >
            <strong>Järjestätkö miitin?</strong> Täytä tiedot tähän — saat tunnisteen jolla voit
            muokata sitä myöhemmin. Itse ilmoittautuminen hoituu aina sinun Threads-postauksessasi.
            💜
          </div>
        </>
      )}

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div
              style={{
                height: 4,
                borderRadius: 999,
                background: i <= step ? t.brand : t.line,
              }}
            />
            <div
              style={{
                fontSize: 10,
                color: i === step ? t.ink : t.inkSoft,
                marginTop: 5,
                fontWeight: i === step ? 700 : 500,
                textAlign: 'center',
              }}
            >
              {s}
            </div>
          </div>
        ))}
      </div>

      {/* Step 0 — basic info */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field t={t} label="Miitin nimi" inputId="field-title">
            <input
              id="field-title"
              value={f.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="esim. Lautapelimiitti"
              style={inputStyle(t)}
            />
          </Field>
          <Field t={t} label="Päivämäärä" inputId="field-date">
            <input
              id="field-date"
              type="date"
              value={f.date}
              onChange={(e) => set('date', e.target.value)}
              style={inputStyle(t)}
            />
          </Field>
        </div>
      )}

      {/* Step 1 — city + category */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field t={t} label="Kaupunki" isGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CITIES.map((c) => (
                <Pill
                  key={c.key}
                  t={t}
                  active={!customCity && f.city === c.key}
                  onClick={() => {
                    setCustomCity(false);
                    set('city', c.key);
                  }}
                >
                  {c.short}
                </Pill>
              ))}
              <Pill
                t={t}
                active={customCity}
                onClick={() => {
                  setCustomCity(true);
                  set('city', '');
                }}
              >
                <IconPlus size={14} sw={2.4} /> Muu kaupunki
              </Pill>
            </div>
            {customCity && (
              <CityAutocomplete t={t} value={f.city} onChange={(v) => set('city', v)} />
            )}
          </Field>
          <Field t={t} label="Laji" isGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.keys(CATEGORIES).map((k) => {
                const c = CATEGORIES[k];
                const on = f.cat === k;
                return (
                  <button
                    key={k}
                    onClick={() => set('cat', k)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: t.radiusPill,
                      fontSize: 13,
                      fontWeight: 600,
                      color: on ? '#fff' : c.color,
                      background: on ? c.color : hexA(c.color, 0.12),
                      border: `1px solid ${on ? c.color : 'transparent'}`,
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: on ? '#fff' : c.color,
                      }}
                    />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      )}

      {/* Step 2 — link + organizer */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field t={t} label="Threads-käyttäjänimesi" inputId="field-org">
            <input
              id="field-org"
              value={f.org}
              onChange={(e) =>
                set(
                  'org',
                  e.target.value.startsWith('@') || !e.target.value
                    ? e.target.value
                    : '@' + e.target.value
                )
              }
              placeholder="@kayttajanimi"
              style={inputStyle(t)}
            />
          </Field>
          <Field
            t={t}
            label="Linkki Threads-postaukseen"
            hint="Pakollinen — jokaisella miitillä on oltava postaus"
            inputId="field-url"
          >
            <input
              id="field-url"
              value={f.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://www.threads.com/..."
              style={{
                ...inputStyle(t),
                borderColor: f.url && !urlOk ? '#C2483F' : t.line,
              }}
            />
            {f.url && !urlOk && (
              <div style={{ fontSize: 12, color: '#C2483F', marginTop: 7, lineHeight: 1.4 }}>
                Tarkista linkki — sen pitää olla Threads-postauksen osoite (alkaa
                https://www.threads.com/…).
              </div>
            )}
          </Field>
          <div style={{ fontSize: 12.5, color: t.inkSoft, lineHeight: 1.5 }}>
            Tee ensin postaus Threadsiin, liitä sen linkki tähän — ilmoittautuminen ja kaikki tiedot
            hoituvat siellä.
          </div>
        </div>
      )}

      {/* Step 3 — preview */}
      {step === 3 && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 999,
                background: hexA(t.brand, 0.12),
                color: t.brand,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <IconCheck size={30} sw={2.4} />
            </div>
            <h2
              style={{
                margin: '0 0 4px',
                fontFamily: t.fontHead,
                fontWeight: t.headWeight,
                fontSize: 22,
                color: t.ink,
                letterSpacing: t.headSpacing,
              }}
            >
              Näin se näyttää!
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: t.inkSoft, lineHeight: 1.5 }}>
              {isEdit ? 'Tarkista muutokset ja tallenna.' : 'Tarkista esikatselu ja lähetä.'}
            </p>
          </div>
          <div style={{ pointerEvents: 'none', marginBottom: 18 }}>
            <MeetupCard
              t={t.card}
              fav={false}
              m={{
                title: f.title || 'Miitin nimi',
                city: f.city || 'helsinki',
                cat: f.cat || 'yleinen',
                date: f.date || DH.todayStr(),
                org: [f.org || '@sinä'],
                url: '#',
              }}
              onClick={() => {}}
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        {step > 0 ? (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              padding: '14px 20px',
              borderRadius: t.radiusPill,
              border: `1px solid ${t.line}`,
              color: t.ink,
              fontWeight: 600,
              fontSize: 14.5,
              fontFamily: 'inherit',
            }}
          >
            Takaisin
          </button>
        ) : isEdit && onCancel ? (
          <button
            onClick={onCancel}
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              padding: '14px 20px',
              borderRadius: t.radiusPill,
              border: `1px solid ${t.line}`,
              color: t.inkSoft,
              fontWeight: 600,
              fontSize: 14.5,
              fontFamily: 'inherit',
            }}
          >
            Peruuta
          </button>
        ) : null}
        <button
          disabled={!canNext}
          onClick={() => (step < 3 ? setStep(step + 1) : submit())}
          style={{
            all: 'unset',
            cursor: canNext ? 'pointer' : 'not-allowed',
            boxSizing: 'border-box',
            flex: 1,
            textAlign: 'center',
            padding: '14px 20px',
            borderRadius: t.radiusPill,
            background: canNext ? t.brand : t.line,
            color: canNext ? t.brandInk : t.inkSoft,
            fontWeight: 700,
            fontSize: 15,
            fontFamily: 'inherit',
          }}
        >
          {step < 3 ? 'Jatka' : isEdit ? 'Tallenna muutokset' : 'Lähetä miitti'}
        </button>
      </div>
    </div>
  );
}
