/*
 * HNES utility helpers — vanilla DOM replacements for jQuery patterns.
 * Loaded before hn.js in the content_scripts manifest.
 */

/** querySelector — returns first match or null */
function $(selector, root = document) {
    return root.querySelector(selector);
}

/** querySelectorAll — returns a real Array (not a NodeList) for safe .map/.forEach */
function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
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

    const template = document.createElement('template');
    template.innerHTML = html;
    const wrapper = document.createElement('div');
    wrapper.append(...template.content.childNodes);
    return wrapper;
}

/** Create a plain element — cheaper than createEl() for single tags (no HTML parse). */
function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

/**
 * Event delegation helper — replaces $(document).on('click', '.selector', fn)
 * @param {Element|Document} root      - element to attach listener to
 * @param {string}            type     - event type ('click', 'keyup', etc.)
 * @param {string}            selector - CSS selector to match (uses closest())
 * @param {Function}          handler  - invoked with `this` bound to the matched element;
 *                                       use function() {}, not an arrow, to access `this`
 */
function on(root, type, selector, handler) {
    root.addEventListener(type, (e) => {
        const target = e.target.closest(selector);
        if (target) handler.call(target, e);
    });
}

/** Find elements matching selector that contain the given text (substring match on textContent).
 *  Replaces jQuery's $('.selector:contains(text)') pseudo-selector. */
function $contains(selector, text, root) {
    return $$(selector, root).filter((node) => node.textContent.includes(text));
}
