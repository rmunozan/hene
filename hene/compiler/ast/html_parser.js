// hene/dom/html_parser.js
/**
 * @fileoverview Parses HTML strings into a simplified AST for Hene.
 * It uses `parse5` for robust HTML parsing and includes a mechanism
 * to protect and restore JavaScript template literals (`${...}`)
 * within text content and attribute values, as `parse5` itself
 * doesn't understand these as JS expressions.
 */
import * as parse5 from 'parse5';

const PLACEHOLDER_PREFIX = '__HENE_EXPR_';
const PLACEHOLDER_SUFFIX = '__';

/**
 * Replaces `${...}` expressions in HTML with placeholders before parsing.
 * @param {string} html - The HTML string.
 * @returns {object} { processedHtml, expressionsMap }.
 */
function protectTemplateExpressions(html) {
    const expressionsMap = new Map();
    let i = 0;
    // Regex to find ${...} ensuring correct brace matching for simple cases
    const processedHtml = html.replace(/\$\{((?:[^{}]*|\{[^{}]*\})*)\}/g, (match) => {
        const placeholder = `${PLACEHOLDER_PREFIX}${i++}${PLACEHOLDER_SUFFIX}`;
        expressionsMap.set(placeholder, match); // Store full ${expr}
        return placeholder;
    });
    return { processedHtml, expressionsMap };
}

/**
 * Restores placeholders in a string value with original `${...}` expressions.
 * @param {string} value - The string with placeholders.
 * @param {Map<string, string>} expressionsMap - Map of placeholders to original expressions.
 * @returns {string} String with original expressions restored.
 */
function restoreInValue(value, expressionsMap) {
    let restored = value;
    expressionsMap.forEach((original, placeholder) => {
        // Use a regex for global replacement of the placeholder
        const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        restored = restored.replace(regex, original);
    });
    return restored;
}

/**
 * Recursively restores placeholders in parsed HTML node tree.
 * @param {object} node - The AST node.
 * @param {Map<string, string>} expressionsMap - Map of placeholders to original expressions.
 */
function restoreInNode(node, expressionsMap) {
    if (!node) return;
    if (node.type === 'text') node.content = restoreInValue(node.content, expressionsMap);
    if (node.attrs) {
        for (const name in node.attrs) {
            node.attrs[name] = restoreInValue(node.attrs[name], expressionsMap);
        }
    }
    if (node.children) node.children.forEach(child => restoreInNode(child, expressionsMap));
}

/**
 * Parses an HTML string into a custom AST, protecting/restoring `${...}`.
 * @param {string} html - The HTML string.
 * @returns {Array<object>} Array of simplified AST nodes.
 */
export function parseHTMLString(html) {
    const { processedHtml, expressionsMap } = protectTemplateExpressions(html);
    const fragment = parse5.parseFragment(processedHtml); // sourceCodeLocationInfo: false is default

    const astNodes = fragment.childNodes.map(convertParse5Node).filter(Boolean);
    astNodes.forEach(node => restoreInNode(node, expressionsMap));
    return astNodes;
}

/**
 * Converts a parse5 AST node to a simplified Hene AST node.
 * @param {object} p5node - The parse5 node.
 * @returns {object|null} Simplified AST node or null if insignificant (e.g., empty text, comment).
 */
function convertParse5Node(p5node) {
    if (p5node.nodeName === '#text') {
        const val = p5node.value;
        return val.trim() === '' ? null : { type: 'text', content: val };
    }
    if (p5node.nodeName === '#comment') return null;

    if (p5node.tagName) { // Element node
        const attrs = {};
        if (p5node.attrs) p5node.attrs.forEach(attr => attrs[attr.name] = attr.value);
        const children = p5node.childNodes ? p5node.childNodes.map(convertParse5Node).filter(Boolean) : [];
        return { type: 'element', tag: p5node.tagName, attrs, children };
    }
    return null;
}