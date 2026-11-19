/*
 * Fixture-driven tests: each test loads real HN markup (fetched from
 * news.ycombinator.com and trimmed) and runs the full HN.init() pipeline,
 * which the old suite never did (setup.js used a hckrnews.com URL).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { createHNEnv } = require('./setup');

function awaitReady(window) {
    // let jsdom finish DOMContentLoaded so onReady runs
    return new Promise(resolve => {
        window.document.addEventListener('DOMContentLoaded', () => {
            // our onReady listener was registered first; give it a microtask
            Promise.resolve().then(() => resolve(window));
        });
    });
}

function loadFixture(name, url) {
    return loadFixtureHtml(fs.readFileSync(`${__dirname}/fixtures/${name}.html`, 'utf8'), url);
}

function loadFixtureHtml(html, url) {
    return awaitReady(createHNEnv(html, url));
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
    assert.ok(rendered.length === 4, `expected 4 comments, got ${rendered.length}`);

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

test('item page: [flagged] comment author is marked dead', async () => {
    // live HN emits the marker inside span.comhead:
    // ...<span id="unv_N"></span> [flagged] <span class="navs">...
    const w = await loadFixture('item', `${HN_URL}/item?id=50552424`);
    const d = w.document;
    const flagged = d.querySelector('[id="50557200"] .author a');
    assert.ok(flagged, 'flagged comment rendered');
    assert.ok(flagged.classList.contains('dead'),
        '[flagged] comment author must carry the .dead class');
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

    // job rows: age + actions inlined into the title cell (single-line rows,
    // same layout as transformed story rows); native subtext rows removed
    const ages = d.querySelectorAll('.hnes-age');
    assert.ok(ages.length >= 3, `job ages inlined, got ${ages.length}`);
    assert.strictEqual(d.querySelectorAll('td.subtext').length, 0,
        'native subtext rows must be consumed, not left as second lines');

    // P0 #3 regression: no score parsed from "1 hour ago", no href="" comments link
    assert.strictEqual(d.querySelectorAll('td .score').length, 0,
        'job rows must not get a fabricated score');
    const comments = [...d.querySelectorAll('a.comments')];
    assert.strictEqual(comments.length, 0,
        'job rows must not get a comments link pointing at the current page');
});

test('news feed: job-posting row keeps natural cell widths', async () => {
    // job posts appear in /news without score/comments; the row's native
    // td.subtext must not be squeezed by the score/comments column rules
    const storyRow = '<tr class="athing" id="1"><td align="right" valign="top" class="title"><span class="rank">1.</span></td><td class="votelinks"></td><td class="title"><span class="titleline"><a href="x">Story</a></span></td></tr>' +
        '<tr><td colspan="2"></td><td class="subtext"><span class="score">10 points</span> by <a href="user?id=a">a</a> <span class="age"><a href="item?id=1">2 hours ago</a></span> | <a href="hide?id=1">hide</a> | <a href="item?id=1">3 comments</a></td></tr>' +
        '<tr class="spacer" style="height:5px"></tr>';
    const jobRow = '<tr class="athing submission" id="50545238"><td align="right" valign="top" class="title"><span class="rank">44.</span></td><td><img src="s.gif" height="1" width="14"></td><td class="title"><span class="titleline"><a href="https://www.ycombinator.com/companies/evidence/jobs/x">Evidence (YC S21) Is Hiring</a></span></td></tr>' +
        '<tr><td colspan="2"></td><td class="subtext"><span class="age" title="2026-11-18T12:00:16"><a href="item?id=50545238">1 day ago</a></span> | <a href="hide?id=50545238">hide</a></td></tr>' +
        '<tr class="spacer" style="height:5px"></tr>';
    const nextStory = '<tr class="athing" id="2"><td align="right" valign="top" class="title"><span class="rank">45.</span></td><td class="votelinks"></td><td class="title"><span class="titleline"><a href="y">Next Story</a></span></td></tr>' +
        '<tr><td colspan="2"></td><td class="subtext"><span class="score">5 points</span> by <a href="user?id=b">b</a> <span class="age"><a href="item?id=2">1 hour ago</a></span> | <a href="hide?id=2">hide</a> | <a href="item?id=2">2 comments</a></td></tr>';
    const html = `<!DOCTYPE html><html><body><center><table><tbody>
        <tr><td><table><tbody><tr><td class="pagetop"></td></tr></tbody></table></td></tr>
        <tr></tr>
        <tr><td><table><tbody>${storyRow}${jobRow}${nextStory}</tbody></table></td></tr>
        </tbody></table></center></body></html>`;

    const w = await loadFixtureHtml(html, `${HN_URL}/news?p=2`);
    const d = w.document;

    const colPos = (td) => {
        let c = 1, el = td;
        while ((el = el.previousElementSibling)) c += Number(el.colSpan || 1);
        return c;
    };

    // transformed story row: [comments, score, votelinks, title] — title in col 4
    const storyRowEl = d.querySelector('#index-body tr.athing');
    assert.strictEqual(storyRowEl.children[0].className, 'hnes-comments-col');
    assert.strictEqual(storyRowEl.children[1].className, 'hnes-score-col');
    const storyTitle = storyRowEl.querySelector('td.title');
    assert.strictEqual(colPos(storyTitle), 4, 'story title must sit in column 4');

    // job row: padded to the same 4-column grid, title in column 4 too
    const jobRowEl = d.querySelector('[id="50545238"]');
    const jobTitle = jobRowEl.querySelector('td.title');
    assert.strictEqual(colPos(jobTitle), 4,
        'job title must align with the story title column, not wrap in a narrow one');

    // age + action links are inlined into the title cell, single line like
    // every transformed row — the native subtext row is gone
    assert.ok(![...d.querySelectorAll('td.subtext')]
        .some(td => td.querySelector('a[href^="item?id=50545238"]') ||
                    td.querySelector('a[href*="50545238"]')),
        'job subtext row must be removed');
    const jobAge = jobTitle.querySelector('.hnes-age');
    assert.ok(jobAge && jobAge.textContent.includes('1 day ago'),
        'job age inlined into title cell');
    const jobHide = jobTitle.querySelector('.hnes-actions a[href^="hide"]');
    assert.ok(jobHide, 'job hide link moved into hnes-actions in title cell');

    // spacer removal must not eat the row after a job row
    assert.ok(d.querySelector('[id="2"]'),
        'story row following a job row must not be removed with its spacer');
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

test('index page: keyboard shortcuts ignore modifier keys and focused inputs', async () => {
    const w = await loadFixture('index', `${HN_URL}/news`);
    const d = w.document;

    // first 'j' selects the first story row
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    assert.ok(d.querySelector('.on_story'), 'bare j selects a story');
    d.querySelector('.on_story').classList.remove('on_story');

    // ⌘C must NOT open comments in a new tab (regression: metaKey was ignored)
    let opened = null;
    w.window.open = (url) => { opened = url; return {}; };
    d.body.dispatchEvent(new w.KeyboardEvent('keydown',
        { key: 'c', metaKey: true, bubbles: true }));
    assert.strictEqual(opened, null, '⌘C must not trigger window.open');

    // alt+c likewise
    d.body.dispatchEvent(new w.KeyboardEvent('keydown',
        { key: 'c', altKey: true, bubbles: true }));
    assert.strictEqual(opened, null, 'alt+C must not trigger window.open');

    // typing in any focused input must not navigate (event targets the input)
    const input = d.querySelector('input[name="q"]');
    input.focus();
    input.dispatchEvent(new w.KeyboardEvent('keydown',
        { key: 'j', bubbles: true }));
    assert.strictEqual(d.querySelector('.on_story'), null,
        'shortcuts disabled while an input is focused');
});

test('item page: failed vote request falls back instead of crashing', async () => {
    const w = await loadFixture('item', `${HN_URL}/item?id=50552424`);
    const d = w.document;

    const c = w.HN.hnComments.nodeMap['50556084'];
    assert.ok(c, 'comment node present');
    c.el = d.getElementById('50556084');

    const origXHR = w.XMLHttpRequest;
    const xhrResponse = { text: '' };
    w.XMLHttpRequest = function () {
        return {
            open() {},
            send() {
                this.status = 200;
                this.responseText = xhrResponse.text;
                this.onload && this.onload({});
            }
        };
    };

    // login-expired style reply: no unvote url in the response body.
    // Before the fix this path did match(...)[0] on null → TypeError and a
    // permanently stale arrow.
    xhrResponse.text = '<html><body>Login required.</body></html>';
    c.upVoteUrl = '#vote?id=50556084&how=up'; // hash navigation is observable in jsdom
    assert.doesNotThrow(() => w.HN.hnComments.voteRequest(c, 1),
        'non-success vote response must not throw');
    assert.strictEqual(w.location.hash, '#vote?id=50556084&how=up',
        'falls back to HN navigation when no unvote url is extractable');
    assert.ok(!c.el.querySelector('.voteblock').classList.contains('voted'),
        'arrow must not be marked voted on failure');

    // success reply: unvote url extracted, arrow marked, vote stored
    xhrResponse.text = "<html><a id='un_50556084' href='vote?id=50556084&amp;how=un&amp;goto=item%3Fid%3D50552424%2350556084'>unvote</a></html>";
    w.HN.hnComments.voteRequest(c, 1);
    assert.strictEqual(c.myVote, 1);
    assert.ok(c.el.querySelector('.voteblock').classList.contains('voted'));
    assert.ok(c.el.querySelector('a.unvote').getAttribute('href').includes('how=un'));
    assert.strictEqual(JSON.parse(w.chrome.storage.local._storage['HJain13']).votes, 1);

    w.XMLHttpRequest = origXHR;
});
