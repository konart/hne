/*
 * Tests for the util.js helper functions — the jQuery replacement layer.
 */
const test = require('node:test');
const assert = require('node:assert');
const { createEnv, loadScript } = require('./setup');

function setup() {
    const window = createEnv(`
        <!DOCTYPE html><html><body>
            <div id="root">
                <p class="item">first</p>
                <p class="item">second</p>
                <p class="item">third</p>
                <span class="other">other</span>
            </div>
        </body></html>
    `);
    loadScript(window, 'js/util.js');
    return window;
}

test('$ returns first match', () => {
    const { $ } = setup();
    const el = $('.item');
    assert.strictEqual(el.textContent, 'first');
});

test('$ returns null for no match', () => {
    const { $ } = setup();
    assert.strictEqual($('.nonexistent'), null);
});

test('$$ returns array of all matches', () => {
    const { $$ } = setup();
    const els = $$('.item');
    assert.ok(Array.isArray(els));
    assert.strictEqual(els.length, 3);
    assert.strictEqual(els[2].textContent, 'third');
});

test('$$ returns empty array for no matches', () => {
    const { $$ } = setup();
    const els = $$('.nonexistent');
    assert.ok(Array.isArray(els));
    assert.strictEqual(els.length, 0);
});

test('$$ accepts a root element', () => {
    const { $, $$ } = setup();
    const root = $('#root');
    const els = $$('.item', root);
    assert.strictEqual(els.length, 3);
});

test('createEl parses HTML string', () => {
    const { createEl } = setup();
    const el = createEl('<p class="test">hello</p>');
    assert.strictEqual(el.firstChild.tagName, 'P');
    assert.strictEqual(el.firstChild.className, 'test');
    assert.strictEqual(el.firstChild.textContent, 'hello');
});

test('createEl parses multiple top-level nodes', () => {
    const { createEl } = setup();
    const el = createEl('<span>a</span><span>b</span>');
    assert.strictEqual(el.children.length, 2);
});

test('createEl passes through existing DOM element', () => {
    const { createEl, $ } = setup();
    const existing = $('.item');
    assert.strictEqual(createEl(existing), existing);
});

test('createEl parses <td> table elements (not dropped by parser)', () => {
    const { createEl } = setup();
    const el = createEl('<td class="score">42</td>');
    assert.ok(el.firstElementChild, 'firstElementChild should not be null for <td>');
    assert.strictEqual(el.firstElementChild.tagName, 'TD');
    assert.strictEqual(el.firstElementChild.textContent, '42');
});

test('createEl parses <tr> table elements with children', () => {
    const { createEl } = setup();
    const el = createEl('<tr><td></td><td><div class="poll-graph"></div></td></tr>');
    assert.ok(el.firstElementChild, 'firstElementChild should not be null for <tr>');
    assert.strictEqual(el.firstElementChild.tagName, 'TR');
    assert.strictEqual(el.firstElementChild.children.length, 2);
    assert.ok(el.firstElementChild.querySelector('.poll-graph'));
});

test('createEl with <td> supports appendChild (the original crash)', () => {
    const { createEl } = setup();
    const td = createEl('<td></td>').firstElementChild;
    assert.ok(td, 'td should not be null');
    const span = createEl('<span>5</span>').firstElementChild;
    td.appendChild(span);
    assert.strictEqual(td.children.length, 1);
    assert.strictEqual(td.textContent, '5');
});

test('on delegates events to matching selector', () => {
    const { document, on } = setup();
    let clicked = null;
    on(document, 'click', '.item', function (e) {
        clicked = this.textContent;
    });

    const items = document.querySelectorAll('.item');
    items[1].dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
    assert.strictEqual(clicked, 'second');
});

test('on ignores clicks on non-matching elements', () => {
    const { document, on } = setup();
    let clicked = false;
    on(document, 'click', '.item', function (e) {
        clicked = true;
    });

    document.querySelector('.other').dispatchEvent(
        new document.defaultView.Event('click', { bubbles: true })
    );
    assert.strictEqual(clicked, false);
});
