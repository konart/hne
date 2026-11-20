/*
 * linkify — vanilla JS port of jquery.linkify-1.0 + twitter plugin.
 *
 * Finds URLs, email addresses, and Twitter @usernames/#hashtags in text
 * nodes and wraps them in <a> tags. Walks child nodes recursively, skipping
 * <a>, <button>, and <textarea> elements (whose content should not be linked).
 *
 * Usage:  linkify(element)   — linkifies all descendant text nodes in-place
 *
 * Regexes are carried over from the original jQuery plugins
 * (copyright Már Örlygsson / Hugsmiðjan ehf., MIT/GPL dual license).
 *
 * Text is HTML-escaped (including quotes) before any plugin runs, and each
 * plugin runs only on segments outside anchors inserted by earlier plugins,
 * so matched text can never break out of the generated href attributes and
 * anchor content is never re-matched (e.g. the @ inside a URL no longer
 * triggers the mailto plugin).
 */

(() => {
    // Entity-aware boundary: quotes are escaped to &quot; / &#39; first,
    // so delimiters must match the escaped forms as well as raw ones.
    const pre = '(^|["\'(\\s]|&lt;|&quot;|&#39;)';
    const post = '((?:[:?]|\\.+)?(?=(?:\\s|$)|&gt;|[)"\',]|&quot;|&#39;))';

    const noProtocolUrl = new RegExp(`${pre}(www\\..+?\\..+?)${post}`, 'g');
    const httpOrMailtoUrl = new RegExp(`${pre}((?:(?:https?|ftp):\\/\\/|mailto:).+?)${post}`, 'g');

    const SKIP_TAGS = /^(a|button|textarea)$/i;

    // splits on complete <a ...>...</a> spans produced by earlier plugins;
    // captured group keeps the anchors at odd indices
    const ANCHOR_SPLIT = /(<a\s[^>]*>[\s\S]*?<\/a>)/;

    const plugins = [
        // default URL linkifier (built-in)
        (html) => html
            .replace(noProtocolUrl, '$1<a href="<``>://$2">$2</a>$3')
            .replace(httpOrMailtoUrl, '$1<a href="$2">$2</a>$3')
            .replace(/"<``>/g, '"http'),
        // mailto plugin
        {
            re: new RegExp(`${pre}([^"'(\\s&]+?@.+\\.[a-z]{2,7})${post}`, 'gi'),
            tmpl: '$1<a href="mailto:$2">$2</a>$3'
        },
        // twitter @usernames
        {
            re: /(^|["'(]|&lt;|&quot;|&#39;|\s)@([a-z0-9_-]+)((?:[:?]|\.+)?(?:\s|$)|&gt;|[)"',]|&quot;|&#39;)/gi,
            tmpl: '$1<a href="https://www.twitter.com/$2">@$2</a>$3'
        },
        // twitter #hashtags
        {
            re: /(^|["'(]|&lt;|&quot;|&#39;|\s)(#.+?)((?:[:?]|\.+)?(?:\s|$)|&gt;|[)"',]|&quot;|&#39;)/gi,
            tmpl: (match, pre, hashTag, post) =>
                `${pre}<a href="https://www.twitter.com/search?q=${encodeURIComponent(hashTag)}">${hashTag}</a>${post}`
        }
    ];

    const escapeHtml = (s) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function applyPlugin(html, plugin) {
        const fn = typeof plugin === 'function'
            ? plugin
            : (s) => s.replace(plugin.re, plugin.tmpl);
        // never touch anchor markup inserted by earlier plugins
        return html.split(ANCHOR_SPLIT)
            .map((part, i) => (i % 2 === 1 ? part : fn(part)))
            .join('');
    }

    function processNode(node) {
        const children = node.childNodes;
        for (let i = 0; i < children.length; i++) {
            const n = children[i];

            if (n.nodeType === 3) {  // text node
                const text = n.nodeValue;
                if (text.length <= 1 || !/\S/.test(text)) continue;

                let html = escapeHtml(text);
                const prev = html;
                for (const plugin of plugins) {
                    html = applyPlugin(html, plugin);
                }

                if (html !== prev) {
                    const container = document.createElement('div');
                    container.innerHTML = html;
                    while (container.firstChild) {
                        node.insertBefore(container.firstChild, n);
                    }
                    node.removeChild(n);
                }
            } else if (n.nodeType === 1 && !SKIP_TAGS.test(n.tagName)) {
                processNode(n);
            }
        }
    }

    window.linkify = (element) => {
        processNode(element);
        return element;
    };
})();
