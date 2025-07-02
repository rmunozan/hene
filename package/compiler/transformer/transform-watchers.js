// hene/compiler/transformer/transform-watchers.js
import * as acorn from 'acorn';
import { generate } from 'astring';
import { stringToAstLiteral } from './transform-render.js';

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

/**
 * Inject watcher statements into the __build method and setup cleanup calls.
 * @param {import('../context.js').Context} context
 */
export function transformWatchers(context) {
    const watchers = context.analysis.syncWatchers;
    if (!watchers || watchers.length === 0) return;
    const buildMethod = context.analysis.classNode.body.body.find(m => m.key?.name === '__build');
    if (!buildMethod) return;
    const watchData = buildStateWatchers(watchers);
    buildMethod.value.body.body.push(...watchData.statements);
    const disconnectedCb = context.analysis.disconnectedCb;
    if (disconnectedCb) {
        watchData.unwatcherNames.forEach(name => {
            disconnectedCb.value.body.body.unshift({
                type: 'ExpressionStatement',
                expression: {
                    type: 'CallExpression',
                    callee: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name }, computed: false },
                    arguments: [],
                    optional: false
                }
            });
        });
    }
}
