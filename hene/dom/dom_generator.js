// hene/dom/dom_generator.js
/**
 * @fileoverview Generates AST for DOM creation and manipulation.
 * - `stringToAstLiteral`: Converts strings (potentially template literals) to AST literal nodes.
 * - `buildDomInstructionsAST`: Orchestrates parsing of HTML from `$render` and generation
 *   of DOM creation statements, `this.nodes` assignments, and reactive sync watchers.
 * - `generateDomASTForNode`: Recursively generates AST for individual HTML elements and text nodes.
 */
import { parseHTMLString } from './html_parser.js';
import * as acorn from 'acorn';

function collectReactiveRefs(ast, reactiveStates, found) {
    if (!ast || typeof ast !== 'object') return;
    switch (ast.type) {
        case 'MemberExpression': {
            let parts = [];
            let cur = ast;
            while (cur.type === 'MemberExpression') {
                if (cur.property.type !== 'Identifier') return;
                parts.unshift(cur.property.name);
                cur = cur.object;
            }
            if (cur.type === 'ThisExpression') {
                parts.unshift('this');
            } else if (cur.type === 'Identifier') {
                parts.unshift(cur.name);
            }
            const key = parts.join('.');
            if (reactiveStates.has(key)) {
                found.add(key);
            }
            collectReactiveRefs(ast.object, reactiveStates, found);
            if (ast.computed) collectReactiveRefs(ast.property, reactiveStates, found);
            break;
        }
        case 'CallExpression':
            collectReactiveRefs(ast.callee, reactiveStates, found);
            ast.arguments.forEach(arg => collectReactiveRefs(arg, reactiveStates, found));
            break;
        case 'BinaryExpression':
        case 'LogicalExpression':
        case 'AssignmentExpression':
        case 'ConditionalExpression':
            collectReactiveRefs(ast.left, reactiveStates, found);
            collectReactiveRefs(ast.right, reactiveStates, found);
            if (ast.test) collectReactiveRefs(ast.test, reactiveStates, found);
            if (ast.consequent) collectReactiveRefs(ast.consequent, reactiveStates, found);
            if (ast.alternate) collectReactiveRefs(ast.alternate, reactiveStates, found);
            break;
        case 'UnaryExpression':
        case 'UpdateExpression':
            collectReactiveRefs(ast.argument, reactiveStates, found);
            break;
        case 'ArrayExpression':
            ast.elements.forEach(el => collectReactiveRefs(el, reactiveStates, found));
            break;
        case 'ObjectExpression':
            ast.properties.forEach(p => collectReactiveRefs(p.value, reactiveStates, found));
            break;
        case 'TemplateLiteral':
            ast.expressions.forEach(e => collectReactiveRefs(e, reactiveStates, found));
            break;
        default:
            for (const k in ast) {
                if (ast[k] && typeof ast[k] === 'object') collectReactiveRefs(ast[k], reactiveStates, found);
            }
    }
}

function reactiveRefsFromExpression(exprStr, reactiveStates) {
    try {
        const ast = acorn.parseExpressionAt(exprStr, 0, { ecmaVersion: 'latest' });
        const found = new Set();
        collectReactiveRefs(ast, reactiveStates, found);
        return Array.from(found).map(key => reactiveStates.get(key));
    } catch (e) {
        return [];
    }
}

/**
 * Creates an AST Literal or TemplateLiteral node from a string.
 * @param {string} strValue - The string content.
 * @returns {object} AST node (Literal or TemplateLiteral).
 */
export function stringToAstLiteral(strValue) {
    if (strValue.includes('${') && strValue.includes('}')) {
        const parts = strValue.split(/\$\{(.*?)\}/g);
        const quasis = [];
        const expressions = [];

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i % 2 === 0) { // Static part
                quasis.push({ type: 'TemplateElement', value: { raw: part, cooked: part }, tail: false });
            } else { // Expression part
                const exprText = part.trim();
                if (exprText === "") {
                    expressions.push({ type: 'Literal', value: '' }); // Handle empty expressions like `${}`
                    continue;
                }
                try {
                    expressions.push(acorn.parseExpressionAt(exprText, 0, { ecmaVersion: 'latest' }));
                } catch (e) {
                    console.error(`[Hene] Error parsing expr "${exprText}" in template: "${strValue}"`, e);
                    expressions.push({ type: 'Literal', value: `/* HENE_PARSE_ERROR: ${exprText.replace(/\*\//g, '*\\/')} */` });
                }
            }
        }
        if (quasis.length > 0) quasis[quasis.length - 1].tail = true;
        return { type: 'TemplateLiteral', quasis, expressions };
    }
    return { type: 'Literal', value: strValue };
}

/**
 * Builds DOM creation AST and returns a node map for `$node` references.
 * @param {string} html - The HTML from `$render`.
 * @returns {object} { creation_statements, node_map, sync_watchers }.
 */
export function buildDomInstructionsAST(html, reactiveStates = new Map()) {
    if (!html) return { creation_statements: [], node_map: {}, sync_watchers: [] };

    const stmts = [];
    const rootFrag = '_fragment_root';

    stmts.push({
        type: 'ExpressionStatement',
        expression: {
            type: 'AssignmentExpression', operator: '=',
            left: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: rootFrag }, computed: false },
            right: { type: 'CallExpression', callee: { type: 'MemberExpression', object: { type: 'Identifier', name: 'document' }, property: { type: 'Identifier', name: 'createDocumentFragment' }, computed: false }, arguments: [] }
        }
    });

    const idCounter = { count: 0 };
    const nodeMap = {};
    const watchers = [];
    const parsed = parseHTMLString(html);

    parsed.forEach(node => generateDomASTForNode(node, `this.${rootFrag}`, stmts, idCounter, nodeMap, watchers, reactiveStates));

    return { creation_statements: stmts, node_map: nodeMap, sync_watchers: watchers };
}

/**
 * Generates DOM creation AST for a single HTML node (element or text).
 * @param {object} node - Parsed HTML node.
 * @param {string} parentVar - AST identifier name for the parent DOM node.
 * @param {Array<object>} stmts - Collector for AST statements.
 * @param {object} idCounter - For unique variable names.
 * @param {object} nodeMap - For `this.nodes` mapping.
 * @param {Array<object>} watchers - Collector for reactive watchers.
 */
function generateDomASTForNode(node, parentVar, stmts, idCounter, nodeMap, watchers, reactiveStates) {
    let parentAst;
    if (parentVar.startsWith('this.')) {
        parentAst = { type: 'MemberExpression', object: {type: 'ThisExpression'}, property: {type: 'Identifier', name: parentVar.substring(5)}};
    } else {
        parentAst = { type: 'Identifier', name: parentVar };
    }

    if (node.type === 'text') {
        const text = node.content;
        const segments = [];
        let lastIdx = 0;
        const tplRegex = /\$\{((?:[^{}]*|\{[^{}]*\})*)\}/g;
        let match;

        while ((match = tplRegex.exec(text)) !== null) {
            if (match.index > lastIdx) segments.push({ type: 'static', value: text.substring(lastIdx, match.index) });
            segments.push({ type: 'expr', value: match[0] });
            lastIdx = tplRegex.lastIndex;
        }
        if (lastIdx < text.length) segments.push({ type: 'static', value: text.substring(lastIdx) });

        const finalSegs = []; // Consolidate adjacent static segments
        let currentStatic = null;
        for (const seg of segments) {
            if (seg.type === 'static') {
                currentStatic = (currentStatic || "") + seg.value;
            } else {
                if (currentStatic !== null && currentStatic.trim() !== '') finalSegs.push({ type: 'static', value: currentStatic });
                currentStatic = null;
                finalSegs.push(seg);
            }
        }
        if (currentStatic !== null && currentStatic.trim() !== '') finalSegs.push({ type: 'static', value: currentStatic });

        finalSegs.forEach(seg => {
            if (seg.value === '') return;
            const textVar = `_text${idCounter.count++}`;
            let initValNode, isDyn = false, refs = [];

            if (seg.type === 'static') {
                initValNode = stringToAstLiteral(seg.value);
            } else {
                initValNode = stringToAstLiteral(seg.value);
                const expr = seg.value.slice(2, -1);
                refs = reactiveRefsFromExpression(expr, reactiveStates);
                if (refs.length > 0) isDyn = true;
            }

            stmts.push({
                type: 'VariableDeclaration', declarations: [{
                    type: 'VariableDeclarator', id: { type: 'Identifier', name: textVar },
                    init: { type: 'CallExpression', callee: { type: 'MemberExpression', object: { type: 'Identifier', name: 'document' }, property: { type: 'Identifier', name: 'createTextNode' }, computed: false }, arguments: [initValNode] }
                }], kind: 'const'
            });
            stmts.push({
                type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'MemberExpression', object: parentAst, property: { type: 'Identifier', name: 'appendChild' }, computed: false }, arguments: [{ type: 'Identifier', name: textVar }] }
            });

            if (isDyn && refs.length > 0) {
                const unique = new Map();
                refs.forEach(ast => unique.set(JSON.stringify(ast), ast));
                unique.forEach(ast => watchers.push({ textNodeVar: textVar, syncTargetAST: ast, fullExpression: seg.value }));
            }
        });
        return;
    }

    if (node.type === 'element') {
        const elVar = `_el${idCounter.count++}`;
        stmts.push({
            type: 'VariableDeclaration', declarations: [{
                type: 'VariableDeclarator', id: { type: 'Identifier', name: elVar },
                init: { type: 'CallExpression', callee: { type: 'MemberExpression', object: { type: 'Identifier', name: 'document' }, property: { type: 'Identifier', name: 'createElement' }, computed: false }, arguments: [{ type: 'Literal', value: node.tag }] }
            }], kind: 'const'
        });

        if (node.attrs) {
            for (const [attrName, attrVal] of Object.entries(node.attrs)) {
                if (attrName === 'node') {
                    nodeMap[attrVal] = elVar;
                    continue;
                }
                const refs = [];
                const attrRegex = /\$\{((?:[^{}]*|\{[^{}]*\})*)\}/g;
                let m;
                while ((m = attrRegex.exec(attrVal)) !== null) {
                    refs.push(...reactiveRefsFromExpression(m[1], reactiveStates));
                }
                stmts.push({
                    type: 'ExpressionStatement',
                    expression: {
                        type: 'CallExpression',
                        callee: { type: 'MemberExpression', object: { type: 'Identifier', name: elVar }, property: { type: 'Identifier', name: 'setAttribute' }, computed: false },
                        arguments: [ { type: 'Literal', value: attrName }, stringToAstLiteral(attrVal) ]
                    }
                });

                if (refs.length > 0) {
                    const unique = new Map();
                    refs.forEach(ast => unique.set(JSON.stringify(ast), ast));
                    unique.forEach(ast => watchers.push({ elementVar: elVar, attributeName: attrName, syncTargetAST: ast, fullExpression: attrVal }));
                }
            }
        }
        stmts.push({
            type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'MemberExpression', object: parentAst, property: { type: 'Identifier', name: 'appendChild' }, computed: false }, arguments: [{ type: 'Identifier', name: elVar }] }
        });

        if (node.children) {
            node.children.forEach(child => generateDomASTForNode(child, elVar, stmts, idCounter, nodeMap, watchers, reactiveStates));
        }
    }
}