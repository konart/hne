/*
 * Tests for the vanilla linkify port — verifies URL, email, and Twitter
 * @username/#hashtag detection matches the original jQuery plugin behavior.
 */
const test = require('node:test');
const assert = require('node:assert');
const { createEnv, loadScript } = require('./setup');

function linkifyText(text) {
    const window = createEnv();
    loadScript(window, 'js/linkify.js');

    const div = window.document.createElement('div');
    div.textContent = text;
    window.linkify(div);
    return div.innerHTML;
}

test('linkify wraps bare URLs in anchor tags', () => {
    const result = linkifyText('Visit http://example.com today');
    assert.ok(result.includes('<a href="http://example.com">http://example.com</a>'),
        `expected anchor in: ${result}`);
});

test('linkify wraps www URLs with implicit http', () => {
    const result = linkifyText('Check www.example.com out');
    assert.ok(result.includes('<a href="http://www.example.com">www.example.com</a>'),
        `expected http-prefixed anchor in: ${result}`);
});

test('linkify wraps mailto addresses', () => {
    const result = linkifyText('Email me@example.com please');
    assert.ok(result.includes('<a href="mailto:me@example.com">me@example.com</a>'),
        `expected mailto anchor in: ${result}`);
});

test('linkify wraps Twitter @usernames', () => {
    const result = linkifyText('Follow @elonmusk on twitter');
    assert.ok(result.includes('<a href="https://www.twitter.com/elonmusk">@elonmusk</a>'),
        `expected twitter anchor in: ${result}`);
});

test('linkify wraps Twitter #hashtags', () => {
    const result = linkifyText('Trending #javascript now');
    assert.ok(result.includes('href="https://www.twitter.com/search?q=%23javascript"'),
        `expected hashtag anchor in: ${result}`);
    assert.ok(result.includes('>#javascript</a>'),
        `expected hashtag text in: ${result}`);
});

test('linkify handles multiple URLs in one text', () => {
    const result = linkifyText('First http://a.com and second http://b.com');
    const anchors = result.match(/<a /g);
    assert.ok(anchors && anchors.length === 2, `expected 2 anchors, got: ${result}`);
});

test('linkify does not modify plain text without URLs', () => {
    const result = linkifyText('Just plain text here');
    assert.strictEqual(result, 'Just plain text here');
});

test('linkify skips existing anchor elements', () => {
    const window = createEnv();
    loadScript(window, 'js/linkify.js');

    const div = window.document.createElement('div');
    div.innerHTML = '<a href="http://existing.com">http://existing.com</a> and http://new.com';
    window.linkify(div);

    const anchors = div.querySelectorAll('a');
    assert.strictEqual(anchors.length, 2, 'should have exactly 2 anchors (existing + new)');
    assert.strictEqual(anchors[0].href, 'http://existing.com/');
    assert.ok(anchors[1].href.includes('new.com'));
});

test('linkify handles URL at start of text', () => {
    const result = linkifyText('http://example.com is first');
    assert.ok(result.startsWith('<a href="http://example.com">'),
        `expected URL at start to be linked: ${result}`);
});

test('linkify handles URL at end of text', () => {
    const result = linkifyText('see http://example.com');
    assert.ok(result.endsWith('</a>'),
        `expected URL at end to be linked: ${result}`);
});

test('linkify processes nested elements', () => {
    const window = createEnv();
    loadScript(window, 'js/linkify.js');

    const div = window.document.createElement('div');
    div.innerHTML = '<p>Link http://nested.com here</p>';
    window.linkify(div);

    const anchor = div.querySelector('p a');
    assert.ok(anchor, 'expected anchor inside <p>');
    assert.ok(anchor.href.includes('nested.com'));
});
