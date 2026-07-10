/*
 * HNES utility helpers — vanilla DOM replacements for jQuery patterns.
 * Loaded before hn.js in the content_scripts manifest.
 */

/** querySelector — returns first match or null */
function $(selector, root) {
    return (root || document).querySelector(selector);
}

/** querySelectorAll — returns a real Array (not a NodeList) for safe .map/.forEach */
function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
}

/**
 * Create an element from an HTML string, or wrap an existing element.
 * @param {string|Element} html  - HTML string (may contain multiple top-level nodes) or a DOM element
 * @returns {Element} A wrapper div whose children are the parsed nodes.
 *                    Use .firstElementChild for a single element, or append .childNodes to move all children.
 *
 * Mirrors the common $('<div class="x">text</div>') + .append() jQuery pattern:
 *   parent.appendChild(createEl('<p>hi</p>').firstElementChild)
 *   parent.appendChild(createEl('<p>hi</p>'))        // appends the wrapper (invisible)
 *   createEl(html).querySelector('.child')
 *
 * Uses a <template> element as the parser container so that table elements
 * (<td>, <tr>, <tbody>, etc.) are parsed correctly — a <div> container would
 * silently drop them because they're invalid children of <div>.
 */
function createEl(html) {
    if (html && html.nodeType) return html;  // already a DOM element — pass-through

    var template = document.createElement('template');
    template.innerHTML = html;
    var wrapper = document.createElement('div');
    while (template.content.firstChild) {
        wrapper.appendChild(template.content.firstChild);
    }
    return wrapper;
}

/**
 * Event delegation helper — replaces $(document).on('click', '.selector', fn)
 * @param {Element|Document} root      - element to attach listener to
 * @param {string}            type     - event type ('click', 'keyup', etc.)
 * @param {string}            selector - CSS selector to match (uses closest())
 * @param {Function}          handler  - receives the matched element via e.target.closest(selector)
 */
function on(root, type, selector, handler) {
    root.addEventListener(type, function(e) {
        var el = e.target.closest(selector);
        if (el) handler.call(el, e);
    });
}

/** Find elements matching selector that contain the given text (substring match on textContent).
 *  Replaces jQuery's $('.selector:contains(text)') pseudo-selector. */
function $contains(selector, text, root) {
    return $$(selector, root).filter(function(el) { return el.textContent.includes(text); });
}
