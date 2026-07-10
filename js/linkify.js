/*
 * linkify — vanilla JS port of jquery.linkify-1.0 + twitter plugin.
 *
 * Finds URLs, email addresses, and Twitter @usernames/#hashtags in text
 * nodes and wraps them in <a> tags. Walks child nodes recursively, skipping
 * <a>, <button>, and <textarea> elements (whose content should not be linked).
 *
 * Usage:  linkify(element)   — linkifies all descendant text nodes in-place
 *
 * Regexes are carried over verbatim from the original jQuery plugins
 * (copyright Már Örlygsson / Hugsmiðjan ehf., MIT/GPL dual license).
 */

(function () {
    var noProtocolUrl = /(^|["'(\s]|&lt;)(www\..+?\..+?)((?:[:?]|\.+)?(?=(?:\s|$)|&gt;|[)"',]))/g;
    var httpOrMailtoUrl = /(^|["'(\s]|&lt;)((?:(?:https?|ftp):\/\/|mailto:).+?)((?:[:?]|\.+)?(?=(?:\s|$)|&gt;|[)"',]))/g;

    var SKIP_TAGS = /^(a|button|textarea)$/i;

    var plugins = [
        // default URL linkifier (built-in)
        function (html) {
            return html
                .replace(noProtocolUrl, '$1<a href="<``>://$2">$2</a>$3')
                .replace(httpOrMailtoUrl, '$1<a href="$2">$2</a>$3')
                .replace(/"<``>/g, '"http');
        },
        // mailto plugin
        {
            re: /(^|["'(\s]|&lt;)([^"'(\s&]+?@.+\.[a-z]{2,7})(([:?]|\.+)?(?=(\s|$)|&gt;|[)"',]))/gi,
            tmpl: '$1<a href="mailto:$2">$2</a>$3'
        },
        // twitter @usernames
        {
            re: /(^|["'(]|&lt;|\s)@([a-z0-9_-]+)((?:[:?]|\.+)?(?:\s|$)|&gt;|[)"',])/gi,
            tmpl: '$1<a href="https://www.twitter.com/$2">@$2</a>$3'
        },
        // twitter #hashtags
        {
            re: /(^|["'(]|&lt;|\s)(#.+?)((?:[:?]|\.+)?(?:\s|$)|&gt;|[)"',])/gi,
            tmpl: function (match, pre, hashTag, post) {
                return pre + '<a href="https://www.twitter.com/search?q=' + encodeURIComponent(hashTag) + '">' + hashTag + '</a>' + post;
            }
        }
    ];

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function applyPlugin(html, plugin) {
        if (typeof plugin === 'function') return plugin(html);
        return html.replace(plugin.re, plugin.tmpl);
    }

    function processNode(node) {
        var children = node.childNodes;
        for (var i = 0; i < children.length; i++) {
            var n = children[i];

            if (n.nodeType === 3) {  // text node
                var text = n.nodeValue;
                if (text.length <= 1 || !/\S/.test(text)) continue;

                var html = escapeHtml(text);
                var prev = html;
                for (var j = 0; j < plugins.length; j++) {
                    html = applyPlugin(html, plugins[j]);
                }

                if (html !== prev) {
                    var container = document.createElement('div');
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

    window.linkify = function (element) {
        processNode(element);
        return element;
    };
})();
