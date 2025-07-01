// hene/compiler/parser/html-parser.js
/**
 * Parses a `$render` HTML string into a custom AST.
 */
import * as parse5 from 'parse5';

const PLACEHOLDER_PREFIX = '__HENE_EXPR_';
const PLACEHOLDER_SUFFIX = '__';

function protectTemplateExpressions(html) {
    const expressionsMap = new Map();
    let i = 0;
    const processedHtml = html.replace(/\$\{((?:[^{}]*|\{[^{}]*\})*)\}/g, (match) => {
        const placeholder = `${PLACEHOLDER_PREFIX}${i++}${PLACEHOLDER_SUFFIX}`;
        expressionsMap.set(placeholder, match);
        return placeholder;
    });
    return { processedHtml, expressionsMap };
}

function restoreInValue(value, expressionsMap) {
    let restored = value;
    expressionsMap.forEach((original, placeholder) => {
        const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        restored = restored.replace(regex, original);
    });
    return restored;
}

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

function convertParse5Node(p5node) {
    if (p5node.nodeName === '#text') {
        const val = p5node.value;
        return val.trim() === '' ? null : { type: 'text', content: val };
    }
    if (p5node.nodeName === '#comment') return null;
    if (p5node.tagName) {
        const attrs = {};
        if (p5node.attrs) p5node.attrs.forEach(attr => attrs[attr.name] = attr.value);
        const children = p5node.childNodes ? p5node.childNodes.map(convertParse5Node).filter(Boolean) : [];
        return { type: 'element', tag: p5node.tagName, attrs, children };
    }
    return null;
}

export function parseHTMLString(html) {
    const { processedHtml, expressionsMap } = protectTemplateExpressions(html);
    const fragment = parse5.parseFragment(processedHtml);
    const astNodes = fragment.childNodes.map(convertParse5Node).filter(Boolean);
    astNodes.forEach(node => restoreInNode(node, expressionsMap));
    return astNodes;
}
