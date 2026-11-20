/*
 * Tests for vote state accounting — the logic that had the unvote bug
 * (unvote always subtracted 1 regardless of vote direction).
 *
 * Verifies that upvote/downvote/unvote sequences produce a net-zero score,
 * and that the myVote int inversion (-c.myVote) passes the correct delta.
 */
const test = require('node:test');
const assert = require('node:assert');
const { createHNEnv } = require('./setup');

function makeAuthorEl(window, name) {
    const html = `
        <span class="author">
            <a href="user?id=${name}">${name}</a>
            <span class="hnes-user-score-cont noscore" title="User score">
                (<span class="hnes-user-score"></span>)
            </span>
        </span>`;
    const wrapper = window.document.createElement('div');
    wrapper.innerHTML = html.trim();
    return wrapper.firstElementChild;
}

function setupVoteEnv(names) {
    const html = '<!DOCTYPE html><html><body><div id="authors"></div></body></html>';
    const window = createHNEnv(html);

    const container = window.document.getElementById('authors');
    for (const name of names) {
        container.appendChild(makeAuthorEl(window, name));
    }
    return window;
}

function getStoredVotes(window, author) {
    const s = window.chrome.storage.local._storage[author];
    if (!s) return undefined;
    return JSON.parse(s).votes;
}

function getDisplayedScore(window, author) {
    const el = window.document.querySelector(`#authors .author a[href="user?id=${author}"]`);
    const scoreEl = el.parentElement.querySelector('.hnes-user-score');
    return scoreEl.textContent;
}

function isScoreVisible(window, author) {
    const el = window.document.querySelector(`#authors .author a[href="user?id=${author}"]`);
    return !el.parentElement.querySelector('.hnes-user-score-cont').classList.contains('noscore');
}


// --- upvoteUserData accounting ---

test('upvote from scratch stores votes: 1', async () => {
    const w = setupVoteEnv(['alice']);
    await w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(getStoredVotes(w, 'alice'), 1);
});

test('upvote again accumulates to votes: 2', async () => {
    const w = setupVoteEnv(['alice']);
    await w.HN.upvoteUserData('alice', 1);
    await w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(getStoredVotes(w, 'alice'), 2);
});

test('downvote from scratch stores votes: -1', async () => {
    const w = setupVoteEnv(['bob']);
    await w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getStoredVotes(w, 'bob'), -1);
});

test('downvote again accumulates to votes: -2', async () => {
    const w = setupVoteEnv(['bob']);
    await w.HN.upvoteUserData('bob', -1);
    await w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getStoredVotes(w, 'bob'), -2);
});


// --- unvote sequences (the bug scenario) ---

test('upvote then unvote (undo) → net zero, votes deleted', async () => {
    const w = setupVoteEnv(['alice']);
    await w.HN.upvoteUserData('alice', 1);       // upvote
    await w.HN.upvoteUserData('alice', -1);      // unvote: -myVote = -1
    assert.strictEqual(getStoredVotes(w, 'alice'), undefined,
        'votes should be deleted when net is 0');
    assert.strictEqual(isScoreVisible(w, 'alice'), false,
        'score should be hidden when net is 0');
});

test('downvote then unvote (undo) → net zero, votes deleted', async () => {
    const w = setupVoteEnv(['bob']);
    await w.HN.upvoteUserData('bob', -1);        // downvote
    await w.HN.upvoteUserData('bob', 1);         // unvote: -myVote = -(-1) = +1
    assert.strictEqual(getStoredVotes(w, 'bob'), undefined,
        'votes should be deleted when net is 0');
    assert.strictEqual(isScoreVisible(w, 'bob'), false,
        'score should be hidden when net is 0');
});

test('downvote then unvote does NOT subtract again (the bug)', async () => {
    const w = setupVoteEnv(['bob']);
    await w.HN.upvoteUserData('bob', -1);        // downvote: votes = -1
    await w.HN.upvoteUserData('bob', 1);         // unvote: should be +1, NOT -1
    // If the bug were present (always -1), votes would be -2 here
    assert.strictEqual(getStoredVotes(w, 'bob'), undefined,
        'downvote→unvote must restore to 0, not -2');
});


// --- legacy migration + exact author matching ---

test('legacy string vote count migrates and accumulates', async () => {
    const w = setupVoteEnv(['alice']);
    // old format: bare JSON number string, not {"votes": N}
    w.chrome.storage.local._storage['alice'] = '1';
    await w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(getStoredVotes(w, 'alice'), 2,
        'stored "1" must be read as votes: 1 and accumulate to 2, not overwrite to 1');
});

test('upvote display only touches the exact author (arc vs arcfour)', async () => {
    const w = setupVoteEnv(['arc', 'arcfour']);
    await w.HN.upvoteUserData('arc', 1);
    assert.strictEqual(getDisplayedScore(w, 'arc'), '1');
    assert.strictEqual(isScoreVisible(w, 'arcfour'), false,
        'substring author match must not write arcfour score');
});

// --- myVote direction inversion (through the storage round-trip) ---

test('myVote=1 (upvote) undone by -myVote: net zero (storage round-trip)', async () => {
    const w = setupVoteEnv(['alice']);
    await w.HN.upvoteUserData('alice', +1);   // upvote applies +1
    await w.HN.upvoteUserData('alice', -1);   // unvote applies -(-1) = -1
    assert.strictEqual(getStoredVotes(w, 'alice'), undefined);
});

test('myVote=-1 (downvote) undone by -myVote: net zero (storage round-trip)', async () => {
    const w = setupVoteEnv(['bob']);
    await w.HN.upvoteUserData('bob', -1);     // downvote applies -1
    await w.HN.upvoteUserData('bob', +1);     // unvote applies -(-1) = +1
    assert.strictEqual(getStoredVotes(w, 'bob'), undefined);
});


// --- display updates ---

test('upvote updates displayed score', async () => {
    const w = setupVoteEnv(['alice']);
    await w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(getDisplayedScore(w, 'alice'), '1');
    assert.strictEqual(isScoreVisible(w, 'alice'), true);
});

test('downvote updates displayed score with negative', async () => {
    const w = setupVoteEnv(['bob']);
    await w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getDisplayedScore(w, 'bob'), '-1');
    assert.strictEqual(isScoreVisible(w, 'bob'), true);
});

test('unvote to zero hides score', async () => {
    const w = setupVoteEnv(['alice']);
    await w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(isScoreVisible(w, 'alice'), true);
    await w.HN.upvoteUserData('alice', -1);      // unvote
    assert.strictEqual(isScoreVisible(w, 'alice'), false);
});


// --- multiple users are independent ---

test('voting on alice does not affect bob', async () => {
    const w = setupVoteEnv(['alice', 'bob']);
    await w.HN.upvoteUserData('alice', 1);
    await w.HN.upvoteUserData('alice', 1);
    await w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getStoredVotes(w, 'alice'), 2);
    assert.strictEqual(getStoredVotes(w, 'bob'), -1);
});


// --- new-comment highlight uses numeric ids ---

test('new-comment highlight compares ids numerically, not as strings', () => {
    const w = createHNEnv('<!DOCTYPE html><html><body></body></html>',
        'https://news.ycombinator.com/item?id=1');
    const d = w.document;

    // two comment shells: an old 7-digit id and a new 8-digit id
    const make = (id) => {
        const el = d.createElement('div');
        el.className = 'hnes-comment';
        el.id = id;
        d.body.appendChild(el);
        return el;
    };
    const oldEl = make('9999999');
    const newEl = make('10000000');

    // node map mirroring what renderComment builds (highlightNewComments
    // only reads HN.hnComments.nodeMap[id].el/.parent/.level)
    w.HN.hnComments = {
        nodeMap: {
            '9999999': { el: oldEl, parent: null, level: 1 },
            '10000000': { el: newEl, parent: null, level: 1 }
        }
    };

    // regression: string comparison '10000000' > '9999999' is FALSE,
    // so with the bug the genuinely new 8-digit comment was never highlighted
    w.CommentTracker.highlightNewComments(9999999);
    assert.ok(newEl.classList.contains('hnes-new'),
        '8-digit id must be recognized as newer than stored 7-digit id');
    assert.ok(!oldEl.classList.contains('hnes-new'));
});


// --- comment-count parsing tolerates &nbsp; (live HN markup) ---

test('getInfo parses "N&nbsp;comments" count, not NaN', () => {
    const w = createHNEnv('<!DOCTYPE html><html><body></body></html>',
        'https://news.ycombinator.com/item?id=42');
    const d = w.document;
    const subtext = d.createElement('td');
    subtext.className = 'subtext';
    const a = d.createElement('a');
    a.setAttribute('href', 'item?id=42');
    a.textContent = '191\u00a0comments'; // live HN uses &nbsp; before the label
    subtext.appendChild(a);
    d.body.appendChild(subtext);

    const info = w.CommentTracker.getInfo();
    assert.strictEqual(info.num, 191,
        'count split on plain space produced NaN for &nbsp;-separated markup');
});

test('index new-comments counter shows the diff, never NaN', async () => {
    const w = createHNEnv('<!DOCTYPE html><html><body></body></html>',
        'https://news.ycombinator.com/news');
    const d = w.document;
    const a = d.createElement('a');
    a.className = 'comments';
    a.setAttribute('href', 'item?id=42');
    a.textContent = '191'; // formatScore already reduced the label to digits
    d.body.appendChild(a);

    // stored baseline from a previous visit
    w.chrome.storage.local._storage['42'] = JSON.stringify({ id: 42, num: 180 });
    w.CommentTracker.checkIndexPage();
    await new Promise(r => setTimeout(r, 0));

    const newcomm = a.querySelector('.newcomments');
    assert.ok(newcomm, 'new-comments span rendered');
    assert.strictEqual(newcomm.textContent, '11 / ');
    assert.ok(!a.textContent.includes('NaN'));
});

test('index counter skips legacy entries whose stored num is NaN (null)', async () => {
    const w = createHNEnv('<!DOCTYPE html><html><body></body></html>',
        'https://news.ycombinator.com/news');
    const d = w.document;
    const a = d.createElement('a');
    a.className = 'comments';
    a.setAttribute('href', 'item?id=42');
    a.textContent = '191';
    d.body.appendChild(a);

    // JSON.stringify(NaN) → null: entries written while parsing was broken
    w.chrome.storage.local._storage['42'] = JSON.stringify({ id: 42, num: NaN });
    w.CommentTracker.checkIndexPage();
    await new Promise(r => setTimeout(r, 0));

    assert.strictEqual(a.querySelector('.newcomments'), null,
        'no diff possible against a corrupt baseline — leave the count alone');
    assert.ok(!a.textContent.includes('NaN'));
});
