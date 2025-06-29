// hene/compiler/transforms/class.js
/**
 * @fileoverview Transforms HeneElement class AST:
 * - Re-parents class to HTMLElement.
 * - Processes `$render` to generate DOM creation logic.
 * - Handles `$event` calls by converting them to `addEventListener`
 *   and managing listener hoisting and cleanup in `disconnectedCallback`.
 * - Injects necessary lifecycle method calls and DOM setup into the constructor.
 */
import {
    extractRenderHTML,
    ensureConstructor,
    ensureConnectedCallback,
    prependSuperCall,
    ensureDisconnectedCallback, heneError
} from './utils.js';
import { buildDomInstructionsAST, stringToAstLiteral } from '../ast/dom_generator.js';
import { generate } from 'astring';
import { processEventListeners } from "./events.js";
import * as acorn from 'acorn';

 * Transforms HeneElement class AST: re-parents to HTMLElement, processes `$render`, and handles `$event` calls.
 * @param {object} classNode - The class declaration AST node.
 */
export function transformHeneClassAST(classNode) {
    if (!classNode || !classNode.superClass || classNode.superClass.name !== 'HeneElement') {
        return;
    }

    classNode.superClass.name = 'HTMLElement';
    const classBodyMembers = classNode.body.body;

    const ctor = ensureConstructor(classBodyMembers);
    const connectedCb = ensureConnectedCallback(classBodyMembers);
    const disconnectedCb = ensureDisconnectedCallback(classBodyMembers);
    const ctorBody = ctor.value.body.body;

    // Collect properties initialized via $state() for reactive tracking
    const reactiveStates = new Map();
    const nodeRefs = new Map();
    const nodeRefPaths = new Set();

    function makeMemberAst(parts) {
        let expr = parts[0] === 'this'
            ? { type: 'ThisExpression' }
            : { type: 'Identifier', name: parts[0] };
        for (let i = 1; i < parts.length; i++) {
            expr = {
                type: 'MemberExpression',
                object: expr,
                property: { type: 'Identifier', name: parts[i] },
                computed: false
            };
        }
        return expr;
    }

    function partsFromMember(member) {
        const p = [];
        let cur = member;
        while (cur && cur.type === 'MemberExpression') {
            if (cur.property.type !== 'Identifier') return null;
            p.unshift(cur.property.name);
            cur = cur.object;
        }
        if (cur && cur.type === 'ThisExpression') {
            p.unshift('this');
        } else if (cur && cur.type === 'Identifier') {
            p.unshift(cur.name);
        } else {
            return null;
        }
        return p;
    }

    function recordState(pathParts) {
        const key = pathParts.join('.');
        if (!reactiveStates.has(key)) {
            reactiveStates.set(key, makeMemberAst(pathParts));
        }
    }

    function collectFromObject(objExpr, baseParts) {
        for (const prop of objExpr.properties || []) {
            if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
            const val = prop.value;
            const newParts = baseParts.concat(prop.key.name);
            if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$state') {
                recordState(newParts);
            } else if (val.type === 'ObjectExpression') {
                collectFromObject(val, newParts);
            }
        }
        collectNodesFromObject(objExpr, baseParts);
    }

    function recordNodeRef(nodeName, parts) {
        if (!nodeRefs.has(nodeName)) nodeRefs.set(nodeName, []);
        nodeRefs.get(nodeName).push(makeMemberAst(parts));
        nodeRefPaths.add(parts.join('.'));
    }

    function collectNodesFromObject(objExpr, baseParts) {
        for (const prop of objExpr.properties || []) {
            if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
            const val = prop.value;
            const newParts = baseParts.concat(prop.key.name);
            if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$node') {
                const arg = val.arguments && val.arguments[0];
                if (!arg || arg.type !== 'Literal') throw heneError('() requires a string literal');
                recordNodeRef(arg.value, newParts);
                prop.value = { type: 'Literal', value: null };
            } else if (val.type === 'ObjectExpression') {
                collectNodesFromObject(val, newParts);
            }
        }
    }

    function hasNodeCall(ast) {
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

    function containsNodeRef(ast) {
        if (!ast || typeof ast !== 'object') return false;
        if (ast.type === 'MemberExpression') {
            const parts = partsFromMember(ast);
            if (parts && nodeRefPaths.has(parts.join('.'))) return true;
        }
        for (const k in ast) {
            const v = ast[k];
            if (Array.isArray(v)) { if (v.some(e => containsNodeRef(e))) return true; }
            else if (v && typeof v === 'object') { if (containsNodeRef(v)) return true; }
        }
        return false;
    }

    function inspectAssignment(assignExpr) {
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
            recordState(parts);
        } else if (right.type === 'CallExpression' && right.callee.type === 'Identifier' && right.callee.name === '$node') {
            const arg = right.arguments && right.arguments[0];
            if (!arg || arg.type !== 'Literal') throw heneError('() requires a string literal');
            recordNodeRef(arg.value, parts);
            assignExpr.right = { type: 'Literal', value: null };
        } else if (right.type === 'ObjectExpression') {
            collectFromObject(right, parts);
            collectNodesFromObject(right, parts);
        }
    }

    // Check class property definitions for $state
    for (const member of classBodyMembers) {
        if (member.type === 'PropertyDefinition' && member.value) {
            if (member.key.type !== 'Identifier') continue;
            const base = ['this', member.key.name];
            const val = member.value;
            if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$state') {
                recordState(base);
            } else if (val.type === 'ObjectExpression') {
                collectFromObject(val, base);
            }
        }
    }

    for (const member of classBodyMembers) {
        if (member === ctor) continue;
        if (hasNodeCall(member)) {
            throw heneError('() can only be used inside the constructor');
        }
    }

    // Inspect constructor assignments and collect node references
    for (const stmt of ctorBody) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
            inspectAssignment(stmt.expression);
        }
    }

    for (const stmt of ctorBody) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=' && stmt.expression.right.type === 'Literal' && stmt.expression.right.value === null) {
            const parts = partsFromMember(stmt.expression.left);
            if (parts) {
                const key = parts.join('.');
                if (nodeRefPaths.has(key)) continue;
            }
        }
        if (containsNodeRef(stmt)) {
            throw heneError('Cached nodes cannot be used inside the constructor');
        }
    }

    let builtIdx = -1;
    for (let i = 0; i < ctorBody.length; i++) {
        const stmt = ctorBody[i];
        if (
            stmt.type === 'ExpressionStatement' &&
            stmt.expression.type === 'CallExpression' &&
            stmt.expression.callee.type === 'MemberExpression' &&
            stmt.expression.callee.object.type === 'ThisExpression' &&
            stmt.expression.callee.property.type === 'Identifier' &&
            stmt.expression.callee.property.name === '$built'
        ) {
            if (builtIdx !== -1) console.warn(`[Hene] Multiple 'this.$built()' calls found. Using first one.`);
            if (stmt.expression.arguments && stmt.expression.arguments.length > 0) {
                 console.warn(`[Hene] 'this.$built()' should not have arguments. Ignoring them.`);
            }
            builtIdx = i;
            break;
        }
    }

    if (builtIdx !== -1) {
        ctorBody.splice(builtIdx, 1);
    }

    const buildMethodStmts = [];
    const renderHTML = extractRenderHTML(classBodyMembers);
    let unwatcherVarNames = [];

    if (renderHTML) {
        const { creation_statements, node_map, sync_watchers } = buildDomInstructionsAST(renderHTML, reactiveStates);
        buildMethodStmts.push(...creation_statements);
        Object.entries(node_map).forEach(([name, varName]) => {
            const refs = nodeRefs.get(name);
            if (!refs) return;
            const declIdx = buildMethodStmts.findIndex(s => s.type === 'VariableDeclaration' && s.declarations[0].id.name === varName);
            refs.forEach((ast, idx) => {
                if (idx === 0 && declIdx >= 0 && ast.type === 'MemberExpression' && ast.object.type === 'ThisExpression') {
                    const init = buildMethodStmts[declIdx].declarations[0].init;
                    buildMethodStmts[declIdx].declarations[0].init = {
                        type: 'AssignmentExpression',
                        operator: '=',
                        left: ast,
                        right: init
                    };
                } else {
                    buildMethodStmts.push({
                        type: 'ExpressionStatement',
                        expression: {
                            type: 'AssignmentExpression',
                            operator: '=',
                            left: ast,
                            right: { type: 'Identifier', name: varName }
                        }
                    });
                }
            });
        });

        const syncWatcherAsts = [];
        if (sync_watchers && sync_watchers.length > 0) {
            const grouped = new Map();
            sync_watchers.forEach((watcher) => {
                const stateKey = generate(watcher.syncTargetAST);
                if (!grouped.has(stateKey)) {
                    grouped.set(stateKey, { stateAST: watcher.syncTargetAST, updates: [] });
                }
                const group = grouped.get(stateKey);
                if (watcher.textNodeVar) {
                    group.updates.push({ type: 'text', target: watcher.textNodeVar, expr: watcher.fullExpression });
                } else if (watcher.attributeName && watcher.elementVar) {
                    group.updates.push({ type: 'attr', target: watcher.elementVar, attr: watcher.attributeName, expr: watcher.fullExpression });
                }
            });

            let groupIdx = 0;
            grouped.forEach((groupData) => {
                const unwatchName = `_w${groupIdx++}`;
                unwatcherVarNames.push(unwatchName);

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

                syncWatcherAsts.push({
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
        }
        buildMethodStmts.push(...syncWatcherAsts);

        connectedCb.value.body.body.push({
            type: 'ExpressionStatement',
            expression: {
                type: 'CallExpression',
                callee: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: 'appendChild' }, computed: false },
                arguments: [{ type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: '_root' }, computed: false }]
            }
        });

        unwatcherVarNames.forEach(name => {
            disconnectedCb.value.body.body.unshift({
                type: 'ExpressionStatement',
                expression: {
                    type: 'CallExpression',
                    callee: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name }, computed: false },
                    arguments: [], optional: false
                }
            });
        });
    }

    const hoistedEvHandlers = [];
    let evCounter = { count: 0 };
    // Use currentClassBodyMembers which includes any ensure* created methods
    processEventListeners(classNode.body.body, ctor, connectedCb, disconnectedCb, evCounter, hoistedEvHandlers);

    ctorBody.push(...hoistedEvHandlers);

    if (buildMethodStmts.length > 0) {
        classBodyMembers.push({
            type: 'MethodDefinition',
            kind: 'method',
            static: false,
            computed: false,
            key: { type: 'Identifier', name: '__build' },
            value: {
                type: 'FunctionExpression',
                id: null,
                params: [],
                body: { type: 'BlockStatement', body: [...buildMethodStmts] },
                async: false,
                generator: false,
                expression: false
            }
        });

        ctorBody.unshift({
            type: 'ExpressionStatement',
            expression: {
                type: 'AssignmentExpression',
                operator: '=',
                left: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: '__built' }, computed: false },
                right: { type: 'Literal', value: false }
            }
        });

        connectedCb.value.body.body.unshift({
            type: 'IfStatement',
            test: { type: 'UnaryExpression', operator: '!', prefix: true, argument: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: '__built' }, computed: false } },
            consequent: {
                type: 'BlockStatement',
                body: [
                    { type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: '__build' }, computed: false }, arguments: [] } },
                    { type: 'ExpressionStatement', expression: { type: 'AssignmentExpression', operator: '=', left: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: '__built' }, computed: false }, right: { type: 'Literal', value: true } } }
                ]
            },
            alternate: null
        });
    }

    prependSuperCall(ctor);
}

