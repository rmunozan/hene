// hene/compiler/transforms/state.js
/**
 * @fileoverview Logic for analysing `$state` usage and generating
 * reactive binding watchers.
 */
import * as acorn from 'acorn';
import { generate } from 'astring';
import { makeMemberAst, partsFromMember, heneError } from './utils.js';
import { stringToAstLiteral } from '../ast/dom_generator.js';

/**
 * Create a new map to track `$state` members.
 * @returns {Map<string, object>}
 */
export function createStateMap() {
    return new Map();
}

/**
 * Record a `$state` member path in the provided map.
 * @param {string[]} parts
 * @param {Map<string, object>} map
 */
export function recordState(parts, map) {
    const key = parts.join('.');
    if (!map.has(key)) {
        map.set(key, makeMemberAst(parts));
    }
}

/**
 * Recursively walk an object expression to find `$state()` calls.
 * @param {object} objExpr
 * @param {string[]} baseParts
 * @param {Map<string, object>} map
 */
export function collectStatesFromObject(objExpr, baseParts, map) {
    for (const prop of objExpr.properties || []) {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
        const val = prop.value;
        const newParts = baseParts.concat(prop.key.name);
        if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$state') {
            recordState(newParts, map);
        } else if (val.type === 'ObjectExpression') {
            collectStatesFromObject(val, newParts, map);
        }
    }
}

/**
 * Inspect an assignment expression for `$state()` usage.
 * @param {object} assignExpr - AssignmentExpression node
 * @param {Map<string, object>} map
 */
export function inspectStateAssignment(assignExpr, map) {
    const left = assignExpr.left;
    const right = assignExpr.right;
    if (left.type !== 'MemberExpression') return;
    const parts = [];
    let cur = left;
    while (cur.type === 'MemberExpression') {
        if (cur.property.type !== 'Identifier') return;
        parts.unshift(cur.property.name);
        cur = cur.object;
    }
    if (cur.type === 'ThisExpression') {
        parts.unshift('this');
    } else if (cur.type === 'Identifier') {
        parts.unshift(cur.name);
    } else {
        return;
    }

    if (right.type === 'CallExpression' && right.callee.type === 'Identifier' && right.callee.name === '$state') {
        recordState(parts, map);
    } else if (right.type === 'ObjectExpression') {
        collectStatesFromObject(right, parts, map);
    }
}

/**
 * Create watcher statements for DOM bindings referencing `$state` values.
 * @param {Array<object>} syncWatchers - collected watcher info
 * @returns {{statements: object[], unwatcherNames: string[]}}
 */
export function buildStateWatchers(syncWatchers) {
    const result = { statements: [], unwatcherNames: [] };
    if (!syncWatchers || syncWatchers.length === 0) return result;

    const grouped = new Map();
    syncWatchers.forEach((watcher) => {
        const key = generate(watcher.syncTargetAST);
        if (!grouped.has(key)) {
            grouped.set(key, { stateAST: watcher.syncTargetAST, updates: [] });
        }
        const group = grouped.get(key);
        if (watcher.textNodeVar) {
            group.updates.push({ type: 'text', target: watcher.textNodeVar, expr: watcher.fullExpression });
        } else if (watcher.attributeName && watcher.elementVar) {
            group.updates.push({ type: 'attr', target: watcher.elementVar, attr: watcher.attributeName, expr: watcher.fullExpression });
        }
    });

    let idx = 0;
    grouped.forEach((groupData) => {
        const unwatchName = `_w${idx++}`;
        result.unwatcherNames.push(unwatchName);
        const updateStmts = groupData.updates.map(upd => {
            if (upd.type === 'text') {
                let expr = upd.expr;
                let rhs;
                if (expr.startsWith('${') && expr.endsWith('}')) {
                    try {
                        rhs = acorn.parseExpressionAt(expr.slice(2, -1), 0, { ecmaVersion: 'latest' });
                    } catch {
                        rhs = stringToAstLiteral(expr);
                    }
                } else {
                    rhs = stringToAstLiteral(expr);
                }
                return {
                    type: 'ExpressionStatement',
                    expression: {
                        type: 'AssignmentExpression',
                        operator: '=',
                        left: { type: 'MemberExpression', object: { type: 'Identifier', name: upd.target }, property: { type: 'Identifier', name: 'textContent' }, computed: false },
                        right: rhs
                    }
                };
            } else if (upd.type === 'attr') {
                return {
                    type: 'ExpressionStatement',
                    expression: {
                        type: 'CallExpression',
                        callee: { type: 'MemberExpression', object: { type: 'Identifier', name: upd.target }, property: { type: 'Identifier', name: 'setAttribute' }, computed: false },
                        arguments: [ { type: 'Literal', value: upd.attr }, stringToAstLiteral(upd.expr) ]
                    }
                };
            }
            return null;
        }).filter(Boolean);

        let watcherFnBody;
        let watcherExprFlag = false;
        if (updateStmts.length === 1 && updateStmts[0].type === 'ExpressionStatement') {
            watcherFnBody = updateStmts[0].expression;
            watcherExprFlag = true;
        } else {
            watcherFnBody = { type: 'BlockStatement', body: updateStmts };
            watcherExprFlag = false;
        }

        result.statements.push({
            type: 'ExpressionStatement',
            expression: {
                type: 'AssignmentExpression',
                operator: '=',
                left: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: unwatchName }, computed: false },
                right: {
                    type: 'CallExpression',
                    callee: { type: 'MemberExpression', object: groupData.stateAST, property: { type: 'Identifier', name: 'watch' }, computed: false },
                    arguments: [
                        { type: 'ArrowFunctionExpression', id: null, params: [], body: watcherFnBody, async: false, expression: watcherExprFlag },
                        { type: 'Literal', value: false }
                    ]
                }
            }
        });
    });

    return result;
}
