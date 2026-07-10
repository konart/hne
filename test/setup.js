/*
 * Test environment factory — creates a jsdom window with mocked chrome APIs
 * and loads source files into it.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function createEnv(html) {
    const dom = new JSDOM(html || '<!DOCTYPE html><html><body></body></html>', {
        url: 'https://hckrnews.com/',  // triggers the hckrnews branch (harmless with empty DOM)
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
                    const keys = typeof key === 'string'
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
 * The hckrnews.com branch runs harmlessly (empty DOM) so HN.init() is not called,
 * but the HN object is available for testing.
 */
function createHNEnv(html) {
    const window = createEnv(html);
    loadScript(window, 'js/util.js');
    loadScript(window, 'js/linkify.js');
    loadScript(window, 'js/hn.js');
    return window;
}

module.exports = { createEnv, loadScript, createHNEnv };
