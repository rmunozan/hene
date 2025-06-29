// hene/compiler/transforms/node.js
/**
 * @fileoverview Utilities for handling `$node` references within
 * Hene component classes.
 */
import { makeMemberAst, partsFromMember, heneError } from './utils.js';

/**
 * Create a tracker object for node references.
 * @returns {{refs: Map<string, object[]>, paths: Set<string>}}
 */
export function createNodeTracker() {
    return { refs: new Map(), paths: new Set() };
}

/**
 * Record a `$node` reference for later replacement.
 * @param {string} nodeName - name passed to `$node()`
 * @param {string[]} parts - member path (e.g. ['this','nodes','btn'])
 * @param {object} tracker - tracker from `createNodeTracker()`
 */
export function recordNodeRef(nodeName, parts, tracker) {
    if (!tracker.refs.has(nodeName)) tracker.refs.set(nodeName, []);
    tracker.refs.get(nodeName).push(makeMemberAst(parts));
    tracker.paths.add(parts.join('.'));
}

/**
 * Recursively collect `$node()` calls from an object expression.
 * @param {object} objExpr - ObjectExpression AST
 * @param {string[]} baseParts - base member path
 * @param {object} tracker - tracker from `createNodeTracker()`
 */
export function collectNodesFromObject(objExpr, baseParts, tracker) {
    for (const prop of objExpr.properties || []) {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
        const val = prop.value;
        const newParts = baseParts.concat(prop.key.name);
        if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$node') {
            const arg = val.arguments && val.arguments[0];
            if (!arg || arg.type !== 'Literal') throw heneError('() requires a string literal');
            recordNodeRef(arg.value, newParts, tracker);
            prop.value = { type: 'Literal', value: null };
        } else if (val.type === 'ObjectExpression') {
            collectNodesFromObject(val, newParts, tracker);
        }
    }
}

/**
 * Determine whether an AST contains any `$node()` call.
 * @param {object} ast - AST node
 * @returns {boolean}
 */
export function hasNodeCall(ast) {
    if (!ast || typeof ast !== 'object') return false;
    if (ast.type === 'CallExpression' && ast.callee.type === 'Identifier' && ast.callee.name === '$node') {
        return true;
    }
    for (const k in ast) {
        const v = ast[k];
        if (Array.isArray(v)) { if (v.some(e => hasNodeCall(e))) return true; }
        else if (v && typeof v === 'object') { if (hasNodeCall(v)) return true; }
    }
    return false;
}

/**
 * Check whether the given AST uses any recorded `$node` reference.
 * @param {object} ast - AST node to scan
 * @param {object} tracker - tracker from `createNodeTracker()`
 * @returns {boolean}
 */
export function containsNodeRef(ast, tracker) {
    if (!ast || typeof ast !== 'object') return false;
    if (ast.type === 'MemberExpression') {
        const parts = partsFromMember(ast);
        if (parts && tracker.paths.has(parts.join('.'))) return true;
    }
    for (const k in ast) {
        const v = ast[k];
        if (Array.isArray(v)) { if (v.some(e => containsNodeRef(e, tracker))) return true; }
        else if (v && typeof v === 'object') { if (containsNodeRef(v, tracker)) return true; }
    }
    return false;
}

/**
 * Inspect an assignment for `$node()` usage and record it.
 *
 * @param {object} assignExpr - AssignmentExpression node
 * @param {object} tracker - tracker from `createNodeTracker()`
 * @returns {string[]|null} Member path of the assignment target or null.
 */
export function inspectNodeAssignment(assignExpr, tracker) {
    const left = assignExpr.left;
    const right = assignExpr.right;
    if (left.type !== 'MemberExpression') return null;
    const parts = partsFromMember(left);
    if (!parts) return null;
    if (right.type === 'CallExpression' && right.callee.type === 'Identifier' && right.callee.name === '$node') {
        const arg = right.arguments && right.arguments[0];
        if (!arg || arg.type !== 'Literal') throw heneError('() requires a string literal');
        recordNodeRef(arg.value, parts, tracker);
        assignExpr.right = { type: 'Literal', value: null };
        return parts;
    } else if (right.type === 'ObjectExpression') {
        collectNodesFromObject(right, parts, tracker);
    }
    return parts;
}
