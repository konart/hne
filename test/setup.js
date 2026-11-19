/*
 * Test environment factory — creates a jsdom window with mocked chrome APIs
 * and loads source files into it.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function createEnv(html, url) {
    const dom = new JSDOM(html || '<!DOCTYPE html><html><body></body></html>', {
        // default to a neutral URL so HN.init() runs; tests that want the
        // hckrnews branch pass its url explicitly
        url: url || 'https://example.com/blank',
        runScripts: 'dangerously',
        pretendToBeVisual: true
    });

    const { window } = dom;
    const storage = {};

    // --- Chrome extension API mock (MV3 promise-based storage) ---
    window.chrome = {
        storage: {
            local: {
                get: async (key) => {
                    const keys = key === null
                        ? Object.keys(storage)
                        : typeof key === 'string'
                            ? [key]
                            : Array.isArray(key) ? key : Object.keys(key);
                    const result = {};
                    for (const k of keys) {
                        if (storage[k] !== undefined) result[k] = storage[k];
                    }
                    return result;
                },
                set: async (obj) => {
                    Object.assign(storage, obj);
                },
                remove: async (keys) => {
                    for (const k of Array.isArray(keys) ? keys : [keys]) {
                        delete storage[k];
                    }
                },
                _storage: storage
            }
        },
        runtime: {
            getURL: (p) => 'chrome-extension://fake/' + p.replace(/^\//, '')
        }
    };

    // Suppress console noise from source files during load
    window.console = { ...console, log: () => {}, warn: () => {}, error: () => {} };

    return window;
}

function loadScript(window, srcPath) {
    const src = fs.readFileSync(path.resolve(srcPath), 'utf8');
    // top-level const/let live in the eval's lexical scope, not on window;
    // re-export the globals the tests reach for (content scripts share them
    // across files in the browser, so window access is test-only plumbing)
    window.eval(`${src}
;if (typeof HN !== 'undefined') window.HN = HN;
if (typeof CommentTracker !== 'undefined') window.CommentTracker = CommentTracker;
if (typeof HNComments !== 'undefined') window.HNComments = HNComments;`);
}

/**
 * Full HNES environment: util.js + linkify.js + hn.js loaded.
 * Pass a real HN URL (e.g. https://news.ycombinator.com/item?id=1) to run
 * HN.init() against the given markup.
 */
function createHNEnv(html, url) {
    const window = createEnv(html, url);
    loadScript(window, 'js/util.js');
    loadScript(window, 'js/linkify.js');
    loadScript(window, 'js/hn.js');
    return window;
}

module.exports = { createEnv, loadScript, createHNEnv };
