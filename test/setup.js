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

    // --- Chrome extension API mock ---
    window.chrome = {
        storage: {
            local: {
                get: function (key, cb) {
                    const keys = key === null
                        ? Object.keys(storage)
                        : typeof key === 'string'
                            ? [key]
                            : Array.isArray(key) ? key : Object.keys(key);
                    const result = {};
                    for (const k of keys) {
                        result[k] = storage[k] !== undefined ? storage[k] : undefined;
                    }
                    if (cb) cb(result);
                },
                set: function (obj, cb) {
                    Object.assign(storage, obj);
                    if (cb) cb();
                },
                remove: function (keys, cb) {
                    (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
                        delete storage[k];
                    });
                    if (cb) cb();
                },
                _storage: storage
            }
        },
        runtime: {
            getURL: function (p) {
                return 'chrome-extension://fake/' + p.replace(/^\//, '');
            }
        }
    };

    // Suppress console noise from source files during load
    window.console = { ...console, log: () => {}, warn: () => {}, error: () => {} };

    return window;
}

function loadScript(window, srcPath) {
    const src = fs.readFileSync(path.resolve(srcPath), 'utf8');
    window.eval(src);
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
