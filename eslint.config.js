const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    { ignores: ['node_modules/**'] },
    js.configs.recommended,
    {
        files: ['eslint.config.js'],
        languageOptions: { sourceType: 'commonjs', globals: globals.node }
    },
    {
        // MV3 content scripts: classic scripts sharing one isolated-world
        // global scope via manifest load order (util.js → linkify.js → hn.js)
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                chrome: 'readonly',
                // cross-file globals from sibling content scripts; writable
                // so the defining file's declaration doesn't trip no-redeclare
                $: 'writable',
                $$: 'writable',
                $contains: 'writable',
                createEl: 'writable',
                el: 'writable',
                on: 'writable',
                linkify: 'writable',
                HN: 'writable',
                HNComments: 'writable',
                CommentTracker: 'writable',
                preorder: 'writable'
            }
        },
        rules: {
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'smart'],
            'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^\\$|^createEl$|^el$|^on$' }],
            // classic-script shared scope: sibling files legitimately
            // declare/assign the same global names
            'no-redeclare': 'off'
        }
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'smart'],
            'no-unused-vars': ['error', { args: 'none' }]
        }
    }
];
