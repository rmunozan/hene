// hene/dom/dom_generator.js
/**
 * @fileoverview Generates AST for DOM creation and manipulation.
 * - `stringToAstLiteral`: Converts strings (potentially template literals) to AST literal nodes.
 * - `buildDomInstructionsAST`: Orchestrates parsing of HTML from `$render` and generation
 *   of DOM creation statements, `this.nodes` assignments, and reactive sync watchers.
 * - `generateDomASTForNode`: Recursively generates AST for individual HTML elements and text nodes.
 */
import { parseHTMLString } from './html_parser.js';
import { extractAndEnrichSyncExpressions, processTextForRender } from '../compiler/sync_transformer.js';
import * as acorn from 'acorn';

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
 * Builds DOM creation and `this.nodes` assignment AST from HTML string.
 * @param {string} html - The HTML from `$render`.
 * @returns {object} { creation_statements, nodes_assignment, sync_watchers }.
 */
export function buildDomInstructionsAST(html) {
    if (!html) return { creation_statements: [], nodes_assignment: null, sync_watchers: [] };

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

    parsed.forEach(node => generateDomASTForNode(node, `this.${rootFrag}`, stmts, idCounter, nodeMap, watchers));

    const nodesAssign = Object.keys(nodeMap).length > 0 ? {
        type: 'ExpressionStatement',
        expression: {
            type: 'AssignmentExpression', operator: '=',
            left: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: 'nodes' }, computed: false },
            right: {
                type: 'ObjectExpression',
                properties: Object.entries(nodeMap).map(([key, varName]) => ({
                    type: 'Property', key: { type: 'Identifier', name: key }, value: { type: 'Identifier', name: varName },
                    kind: 'init', method: false, shorthand: false, computed: false
                }))
            }
        }
    } : null;

    return { creation_statements: stmts, nodes_assignment: nodesAssign, sync_watchers: watchers };
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
function generateDomASTForNode(node, parentVar, stmts, idCounter, nodeMap, watchers) {
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
        const tplRegex = /\$\{((?:[^{}]*|\{[^{}]*\})*)\}/g; // Find any ${...}
        let match;

        while ((match = tplRegex.exec(text)) !== null) {
            if (match.index > lastIdx) segments.push({ type: 'static', value: text.substring(lastIdx, match.index) });
            segments.push({ type: match[0].includes('sync(') ? 'reactive' : 'static', value: match[0] });
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
            let initValNode, isDyn = false, relSyncs = [], textToRender = '';

            if (seg.type === 'static') {
                initValNode = stringToAstLiteral(seg.value);
            } else { // reactive
                const syncsInExpr = extractAndEnrichSyncExpressions(seg.value);
                const procInfo = processTextForRender(seg.value, syncsInExpr)[0];
                initValNode = stringToAstLiteral(procInfo.textForRender);
                textToRender = procInfo.textForRender;
                isDyn = procInfo.isDynamic;
                if (isDyn) relSyncs = procInfo.relevantSyncs;
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

            if (isDyn && relSyncs.length > 0) {
                const uniqueTargets = new Map();
                relSyncs.forEach(sync => uniqueTargets.set(JSON.stringify(sync.syncTargetAST), sync.syncTargetAST));
                uniqueTargets.forEach(targetAST => watchers.push({ textNodeVar: textVar, syncTargetAST: targetAST, fullExpression: textToRender }));
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
                const syncsInAttr = extractAndEnrichSyncExpressions(attrVal);
                const procInfo = processTextForRender(attrVal, syncsInAttr)[0];
                stmts.push({
                    type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'MemberExpression', object: { type: 'Identifier', name: elVar }, property: { type: 'Identifier', name: 'setAttribute' }, computed: false }, arguments: [ { type: 'Literal', value: attrName }, stringToAstLiteral(procInfo.textForRender) ] }
                });

                if (procInfo.isDynamic && procInfo.relevantSyncs) {
                    const uniqueTargets = new Map();
                    procInfo.relevantSyncs.forEach(sync => uniqueTargets.set(JSON.stringify(sync.syncTargetAST), sync.syncTargetAST));
                    uniqueTargets.forEach(targetAST => watchers.push({ elementVar: elVar, attributeName: attrName, syncTargetAST: targetAST, fullExpression: procInfo.textForRender }));
                }
            }
        }
        stmts.push({
            type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'MemberExpression', object: parentAst, property: { type: 'Identifier', name: 'appendChild' }, computed: false }, arguments: [{ type: 'Identifier', name: elVar }] }
        });

        if (node.children) {
            node.children.forEach(child => generateDomASTForNode(child, elVar, stmts, idCounter, nodeMap, watchers));
        }
    }
}