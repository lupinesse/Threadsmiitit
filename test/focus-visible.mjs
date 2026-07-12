/**
 * Regression tests for the global keyboard-focus outline — run with Node's
 * built-in test runner: `npm test`.
 *
 * Interactive elements across the app reset their focus outline via inline
 * `style={{ all: 'unset' }}` / `outline: 'none'`, which previously left
 * keyboard users with no visible focus indicator anywhere (WCAG 2.4.7).
 * These tests compile the real src/css/_base.scss with `sass` and load it
 * into a simulated DOM (happy-dom) so they exercise the actual CSS cascade,
 * not a hand-copied assertion of the rule's source text.
 */

import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as sass from 'sass';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const compiledCss = sass.compile('src/css/_base.scss').css;

GlobalRegistrator.register();

const { cleanup, render, screen } = await import('@testing-library/react');
const React = await import('react');

/** Renders `children` inside the compiled stylesheet so real cascade rules apply. */
function renderWithStylesheet(children) {
  const style = document.createElement('style');
  style.textContent = compiledCss;
  document.head.appendChild(style);
  return render(children);
}

describe('Keyboard-focus outline (src/css/_base.scss)', () => {
  afterEach(cleanup);
  after(() => {
    GlobalRegistrator.unregister();
  });

  it('restores a visible outline on a button reset with all: unset', () => {
    renderWithStylesheet(
      React.createElement(
        'button',
        { 'data-testid': 'btn', style: { all: 'unset', color: 'red' } },
        'Click me'
      )
    );
    const btn = screen.getByTestId('btn');
    btn.focus();
    const computed = getComputedStyle(btn);

    assert.notEqual(computed.outlineStyle, 'none');
    assert.equal(computed.outlineWidth, '2px');
  });

  it('uses a fixed halo colour, not currentcolor', () => {
    // Regression case: the header profile button sets its text colour equal
    // to its own themed background (dark palette ink-on-ink), which made an
    // earlier `outline: currentcolor` version of this rule paint an
    // invisible ring. happy-dom reports an unresolved `outline-color:
    // currentcolor` verbatim (it does not resolve it per element the way a
    // real browser would), so asserting the computed value is a concrete
    // colour — not the literal keyword — is what catches a regression back
    // to `currentcolor`. The paired box-shadow supplies the second,
    // opposite-toned ring that guarantees contrast against any background.
    renderWithStylesheet(
      React.createElement(
        'button',
        { 'data-testid': 'btn', style: { all: 'unset', color: '#0a0a0a' } },
        'Click me'
      )
    );
    const btn = screen.getByTestId('btn');
    btn.focus();
    const computed = getComputedStyle(btn);

    assert.notEqual(computed.outlineColor, 'currentcolor');
    assert.notEqual(computed.boxShadow, 'none');
  });

  it('does not draw a ring on an off-tab-order focus-sink element', () => {
    // Sheet/ChatAssistant dialog panels are tabIndex={-1} focus sinks that
    // intentionally keep outline: none — they are never a real tab stop.
    renderWithStylesheet(
      React.createElement(
        'div',
        { 'data-testid': 'sink', tabIndex: -1, style: { outline: 'none' } },
        'Dialog panel'
      )
    );
    const sink = screen.getByTestId('sink');
    sink.focus();
    const computed = getComputedStyle(sink);

    assert.equal(computed.outlineStyle, 'none');
  });
});
