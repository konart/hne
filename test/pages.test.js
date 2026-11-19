/*
 * Fixture-driven tests: each test loads real HN markup (fetched from
 * news.ycombinator.com and trimmed) and runs the full HN.init() pipeline,
 * which the old suite never did (setup.js used a hckrnews.com URL).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { createHNEnv } = require('./setup');

function loadFixture(name, url) {
    const html = fs.readFileSync(`${__dirname}/fixtures/${name}.html`, 'utf8');
    const window = createHNEnv(html, url);
    // let jsdom finish DOMContentLoaded so onReady runs
    return new Promise(resolve => {
        window.document.addEventListener('DOMContentLoaded', () => {
            // our onReady listener was registered first; give it a microtask
            Promise.resolve().then(() => resolve(window));
        });
    });
}

const HN_URL = 'https://news.ycombinator.com';

test('index page: formatScore keeps hide links and parses scores', async () => {
    const w = await loadFixture('index', `${HN_URL}/news`);
    const d = w.document;

    // body id assigned
    assert.strictEqual(d.body.id, 'index-body');

    // P0 #1 regression: subtext destruction. Hide links must survive.
    const hideLinks = d.querySelectorAll('.hnes-actions a[href^="hide"]');
    assert.ok(hideLinks.length >= 3, `expected hide links preserved, got ${hideLinks.length}`);

    // scores parsed to integers
    const scores = [...d.querySelectorAll('td .score')].map(e => e.textContent);
    assert.ok(scores.length >= 3, `expected >= 3 scores, got ${scores.length}`);
    for (const s of scores) assert.ok(/^\d+$/.test(s), `score not an int: "${s}"`);

    // comments counts extracted
    const comments = [...d.querySelectorAll('a.comments')].map(e => e.textContent);
    assert.ok(comments.length >= 3);
    for (const c of comments) assert.ok(/^\d+$/.test(c) || c === '-', `comments not a count: "${c}"`);

    // visibility restored — never a blank page
    assert.strictEqual(d.body.style.visibility, 'visible');
});

test('item page: comments render, collapser is keyboard-accessible', async () => {
    const w = await loadFixture('item', `${HN_URL}/item?id=50552424`);
    const d = w.document;

    assert.strictEqual(d.body.id, 'item-body');

    // comments were rendered from native markup
    const rendered = d.querySelectorAll('#hnes-comments .hnes-comment');
    assert.ok(rendered.length === 3, `expected 3 comments, got ${rendered.length}`);

    // nested levels preserved
    assert.ok(d.querySelector('#hnes-comments .hnes-comment .hnes-comment .hnes-comment'),
        'expected 3-deep nesting');

    // collapser a11y
    const collapser = d.querySelector('.collapser');
    assert.strictEqual(collapser.getAttribute('tabindex'), '0');
    assert.strictEqual(collapser.getAttribute('role'), 'button');
    assert.strictEqual(collapser.getAttribute('aria-expanded'), 'true');

    // parent link is rendered, not display:none (CSS would hide it before)
    assert.ok(d.querySelector('#hnes-comments a.parent'));

    // OP highlighted
    assert.ok(d.querySelector('.original_poster'), 'story submitter should be marked');

    // native tree replaced
    assert.strictEqual(d.querySelectorAll('#hnmain table.comment-tree tr.athing').length, 0);

    // loading indicator hidden
    const loading = d.getElementById('loading_comments');
    assert.ok(!loading || loading.classList.contains('hidden'));
});

test('item page: collapsing persists with a timestamp and stale entries are pruned', async () => {
    const w = await loadFixture('item', `${HN_URL}/item?id=50552424`);
    const d = w.document;
    const collapser = d.querySelector('.collapser');
    collapser.dispatchEvent(new w.Event('click', { bubbles: true, cancelable: true }));

    const comment = collapser.closest('.hnes-comment');
    assert.ok(comment.classList.contains('collapsed'));
    assert.strictEqual(collapser.getAttribute('aria-expanded'), 'false');

    // stored with a timestamp (TTL)
    const stored = w.chrome.storage.local._storage[comment.id];
    assert.ok(stored, 'collapse state stored');
    assert.strictEqual(stored.isCollapsed, true);
    assert.strictEqual(typeof stored.t, 'number');

    // stale entry (no timestamp) is pruned by pruneStorage
    const w2 = await loadFixture('item', `${HN_URL}/item?id=50552424`);
    w2.chrome.storage.local._storage['999999'] = { isCollapsed: true };
    w2.HN.pruneStorage();
    assert.strictEqual(w2.chrome.storage.local._storage['999999'], undefined,
        'legacy timestamp-less collapse entry must be pruned');
});

test('jobs page: no fake score, no self-referential comments link, blurb extracted', async () => {
    const w = await loadFixture('jobs', `${HN_URL}/jobs`);
    const d = w.document;

    assert.strictEqual(d.body.id, 'jobs-body');

    // blurb moved out of the story table
    const blurb = d.querySelector('.blurb');
    assert.ok(blurb, 'blurb should be extracted');
    assert.ok(!/More/.test(blurb.textContent), `blurb must not contain 'More': "${blurb.textContent}"`);

    // job rows keep their native age subtext
    const ages = d.querySelectorAll('td.subtext .age a');
    assert.ok(ages.length >= 3, `job ages preserved, got ${ages.length}`);

    // P0 #3 regression: no score parsed from "1 hour ago", no href="" comments link
    assert.strictEqual(d.querySelectorAll('td .score').length, 0,
        'job rows must not get a fabricated score');
    const comments = [...d.querySelectorAll('a.comments')];
    assert.strictEqual(comments.length, 0,
        'job rows must not get a comments link pointing at the current page');
});

test('user page: profile enhancement runs (the .tr selector bug)', async () => {
    const w = await loadFixture('user', `${HN_URL}/user?id=pg`);
    const d = w.document;

    // P2 regression: $$('.tr > ...') matched 0 elements; with 'tr' it works
    assert.ok(d.getElementById('user-profile'), 'content td gets user-profile id');
    assert.ok(d.getElementById('others-profile-submitted'),
        'submitted link parent gets its id — the whole branch was inert before');
});

test('linkified about text cannot inject attributes', async () => {
    const w = await loadFixture('user', `${HN_URL}/user?id=pg`);
    const d = w.document;
    const about = d.querySelector('#user-profile td[style]');
    assert.ok(about, 'about cell present');
    about.textContent = 'reach me at x@"onmouseover="window.__PWNED=1//.com';
    w.linkify(about);
    const a = about.querySelector('a');
    assert.ok(a, 'email linkified');
    assert.strictEqual(a.getAttributeNames().join(','), 'href',
        'no injected attributes');
    assert.ok(!a.hasAttribute('onmouseover'));
});
