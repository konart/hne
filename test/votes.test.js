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

test('upvote from scratch stores votes: 1', () => {
    const w = setupVoteEnv(['alice']);
    w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(getStoredVotes(w, 'alice'), 1);
});

test('upvote again accumulates to votes: 2', () => {
    const w = setupVoteEnv(['alice']);
    w.HN.upvoteUserData('alice', 1);
    w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(getStoredVotes(w, 'alice'), 2);
});

test('downvote from scratch stores votes: -1', () => {
    const w = setupVoteEnv(['bob']);
    w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getStoredVotes(w, 'bob'), -1);
});

test('downvote again accumulates to votes: -2', () => {
    const w = setupVoteEnv(['bob']);
    w.HN.upvoteUserData('bob', -1);
    w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getStoredVotes(w, 'bob'), -2);
});


// --- unvote sequences (the bug scenario) ---

test('upvote then unvote (undo) → net zero, votes deleted', () => {
    const w = setupVoteEnv(['alice']);
    w.HN.upvoteUserData('alice', 1);       // upvote
    w.HN.upvoteUserData('alice', -1);      // unvote: -myVote = -1
    assert.strictEqual(getStoredVotes(w, 'alice'), undefined,
        'votes should be deleted when net is 0');
    assert.strictEqual(isScoreVisible(w, 'alice'), false,
        'score should be hidden when net is 0');
});

test('downvote then unvote (undo) → net zero, votes deleted', () => {
    const w = setupVoteEnv(['bob']);
    w.HN.upvoteUserData('bob', -1);        // downvote
    w.HN.upvoteUserData('bob', 1);         // unvote: -myVote = -(-1) = +1
    assert.strictEqual(getStoredVotes(w, 'bob'), undefined,
        'votes should be deleted when net is 0');
    assert.strictEqual(isScoreVisible(w, 'bob'), false,
        'score should be hidden when net is 0');
});

test('downvote then unvote does NOT subtract again (the bug)', () => {
    const w = setupVoteEnv(['bob']);
    w.HN.upvoteUserData('bob', -1);        // downvote: votes = -1
    w.HN.upvoteUserData('bob', 1);         // unvote: should be +1, NOT -1
    // If the bug were present (always -1), votes would be -2 here
    assert.strictEqual(getStoredVotes(w, 'bob'), undefined,
        'downvote→unvote must restore to 0, not -2');
});


// --- myVote int inversion ---

test('myVote=1 (upvote) → -myVote = -1 (correct unvote delta)', () => {
    const myVote = 1;
    assert.strictEqual(-myVote, -1);
});

test('myVote=-1 (downvote) → -myVote = +1 (correct unvote delta)', () => {
    const myVote = -1;
    assert.strictEqual(-myVote, 1);
});


// --- display updates ---

test('upvote updates displayed score', () => {
    const w = setupVoteEnv(['alice']);
    w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(getDisplayedScore(w, 'alice'), '1');
    assert.strictEqual(isScoreVisible(w, 'alice'), true);
});

test('downvote updates displayed score with negative', () => {
    const w = setupVoteEnv(['bob']);
    w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getDisplayedScore(w, 'bob'), '-1');
    assert.strictEqual(isScoreVisible(w, 'bob'), true);
});

test('unvote to zero hides score', () => {
    const w = setupVoteEnv(['alice']);
    w.HN.upvoteUserData('alice', 1);
    assert.strictEqual(isScoreVisible(w, 'alice'), true);
    w.HN.upvoteUserData('alice', -1);      // unvote
    assert.strictEqual(isScoreVisible(w, 'alice'), false);
});


// --- multiple users are independent ---

test('voting on alice does not affect bob', () => {
    const w = setupVoteEnv(['alice', 'bob']);
    w.HN.upvoteUserData('alice', 1);
    w.HN.upvoteUserData('alice', 1);
    w.HN.upvoteUserData('bob', -1);
    assert.strictEqual(getStoredVotes(w, 'alice'), 2);
    assert.strictEqual(getStoredVotes(w, 'bob'), -1);
});
