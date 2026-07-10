/*
 * Regression guard for the top-nav "more" dropdown (#nav-others) hover background.
 *
 * Two bugs were fixed here; both must stay fixed:
 *
 * 1. OVERFLOW — `#nav-others a { width: 100% }` with content-box box-sizing made
 *    each anchor (width:100% + 2×14px padding) wider than its container, so the
 *    hover background painted past the dropdown's right border and rounded corner.
 *    #user-hidden sets no width on its anchors, so they fit.
 *
 * 2. SHORTFALL — `#nav-others { padding-right: 16px }` left a 16px strip on the
 *    container's right that the block-level anchor (width:auto) fills up to but
 *    not into, so the hover background stopped 16px short of the border.
 *    #user-hidden puts the padding on the *anchor* (`padding-right: 28px`) instead
 *    of the container, so the anchor's border box spans the full width while text
 *    keeps its inset.
 *
 * The correct model (mirroring #user-hidden): NO width and NO padding-right on the
 * container; the anchor carries padding-right so its hover bg spans full width.
 *
 * The harness is jsdom-only (no layout), so we read the real style.css via CSSOM
 * and guard the declarations that cause each failure mode.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./setup');

const CSS_PATH = path.resolve(__dirname, '..', 'style.css');

function loadStyleSheets(window) {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const style = window.document.createElement('style');
    style.textContent = css;
    window.document.head.appendChild(style);
    return window.document.styleSheets;
}

function collectDecls(sheets, selector) {
    const decls = {};
    for (const sheet of sheets) {
        for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.trim() === selector) {
                for (let i = 0; i < rule.style.length; i++) {
                    const prop = rule.style[i];
                    decls[prop] = rule.style.getPropertyValue(prop);
                }
            }
        }
    }
    return decls;
}

test('#nav-others a must not set width:100% (causes hover-bg overflow)', () => {
    const window = createEnv('<!DOCTYPE html><html><body></body></html>');
    const sheets = loadStyleSheets(window);
    const decls = collectDecls(sheets, '#nav-others a');

    assert.ok(!('width' in decls) || decls.width !== '100%',
        '#nav-others a { width: 100% } reintroduces the hover-overflow bug ' +
        '(content-box width:100% + padding makes anchors wider than the container)');
});

test('#nav-others must not set padding-right (causes hover-bg shortfall)', () => {
    const window = createEnv('<!DOCTYPE html><html><body></body></html>');
    const sheets = loadStyleSheets(window);
    const decls = collectDecls(sheets, '#nav-others');

    assert.ok(!('padding-right' in decls) && !('padding' in decls),
        '#nav-others { padding-right } leaves a strip the hover background cannot ' +
        'reach — move the padding onto #nav-others a so the anchor border box spans ' +
        'the full width (mirrors #user-hidden)');
});
