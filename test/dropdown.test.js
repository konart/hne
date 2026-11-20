/*
 * Smoke test for top-navigation "more" dropdowns (nav-more-link, my-more-link).
 *
 * Regression: the jQuery→vanilla JS port toggled visibility with
 *   el.style.display = (el.style.display === 'none') ? '' : 'none';
 * Setting display to '' clears the inline style and falls back to the CSS rule
 * `.nav-drop-down { display: none; }`, so the dropdown never appeared.
 * Fix sets 'block' when showing so the CSS rule is overridden.
 */
const test = require('node:test');
const assert = require('node:assert');
const { createEnv, loadScript } = require('./setup');

// HTML scaffold matching HN's nav structure.
// `td:nth-child(2) .pagetop` is the right-side nav cell; `.topsel` is absent
// so rewriteNavigation builds a fresh .nav-links span.
const NAV_HTML = `<!DOCTYPE html><html><head>
<style>
  /* mirror style.css:280 — the rule that hid the dropdowns */
  .nav-drop-down { display: none; position: absolute; }
</style>
</head><body>
<table id="header"><tbody>
  <tr>
    <td class="left"></td>
    <td><span class="pagetop"></span></td>
    <td class="right"></td>
  </tr>
</tbody></table>
</body></html>`;

function click(el) {
    el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true, cancelable: true }));
}

test('nav-more-link toggle shows and hides #nav-others', () => {
    const window = createEnv(NAV_HTML);
    loadScript(window, 'js/util.js');
    loadScript(window, 'js/hn.js');

    const { document, HN } = window;
    HN.rewriteNavigation();

    const moreLink = document.getElementById('nav-more-link');
    const others = document.getElementById('nav-others');
    assert.ok(moreLink, 'nav-more-link created');
    assert.ok(others, 'nav-others created');

    // starts hidden
    assert.strictEqual(others.style.display, 'none');

    // first click -> shown (block, overriding CSS display:none)
    click(moreLink);
    assert.strictEqual(others.style.display, 'block',
        'clicking more should set display:block, not "" (CSS would keep it hidden)');

    // computed style must not be none — the actual user-visible contract
    assert.notStrictEqual(window.getComputedStyle(others).display, 'none',
        'dropdown must be visibly rendered after click');

    // second click -> hidden again
    click(moreLink);
    assert.strictEqual(others.style.display, 'none');
});

test('my-more-link toggle shows and hides #user-hidden', () => {
    const window = createEnv(NAV_HTML);
    loadScript(window, 'js/util.js');
    loadScript(window, 'js/hn.js');

    const { document, HN } = window;

    // pagetop with user profile link + logout link + karma text, as HN renders it
    const pagetop = document.querySelector('td:nth-child(2) .pagetop');
    const profile = document.createElement('a');
    profile.href = '/user?id=alice';
    profile.textContent = 'alice';
    const logout = document.createElement('a');
    logout.href = '/logout';
    logout.textContent = 'logout';
    pagetop.appendChild(profile);
    pagetop.appendChild(document.createTextNode(' (42) | '));
    pagetop.appendChild(logout);

    HN.rewriteUserNav(pagetop);

    const myMore = document.getElementById('my-more-link');
    const hidden = document.getElementById('user-hidden');
    assert.ok(myMore, 'my-more-link created');
    assert.ok(hidden, 'user-hidden created');

    assert.strictEqual(hidden.style.display, 'none');

    click(myMore);
    assert.strictEqual(hidden.style.display, 'block',
        'clicking my-more-link should set display:block');
    assert.notStrictEqual(window.getComputedStyle(hidden).display, 'none');

    click(myMore);
    assert.strictEqual(hidden.style.display, 'none');
});

test('active user-nav link is prefixed "Your" only for the logged-in user', () => {
    // regression: `pathname != '/upvoted' || pathname != '/favorites'` was a
    // tautology; the prefix logic ran even where it shouldn't. It must only
    // fire when an active link exists and reflect the id match.
    // real HN header shape: td2 = nav .pagetop, td3 = user .pagetop
    const html = `<!DOCTYPE html><html><body><table id="header"><tbody><tr>
        <td class="logo"></td>
        <td><span class="pagetop"></span></td>
        <td><span class="pagetop" id="usercell"></span></td>
    </tr></tbody></table></body></html>`;
    const window = createEnv(html, 'https://example.com/user?id=alice');
    loadScript(window, 'js/util.js');
    loadScript(window, 'js/hn.js');

    const { document, HN } = window;
    const pagetop = document.getElementById('usercell');
    const profile = document.createElement('a');
    profile.href = '/user?id=alice';
    profile.textContent = 'alice';
    const logout = document.createElement('a');
    logout.href = '/logout';
    logout.textContent = 'logout';
    pagetop.append(profile, document.createTextNode(' (42) | '), logout);

    HN.rewriteUserNav(pagetop);

    const active = document.querySelector('#top-navigation .new-active-link');
    assert.ok(active, 'active link created for current page');
    assert.strictEqual(active.textContent, 'Your profile',
        'own page gets the "Your" prefix, not "alice\'s"');
});
