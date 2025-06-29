// hene/compiler/class_transformer.js
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
    ensureDisconnectedCallback
} from './utils.js';
import { buildDomInstructionsAST, stringToAstLiteral } from '../dom/dom_generator.js';
import { generate } from 'astring';
import * as acorn from 'acorn';

/**
 * Processes `$event` calls in class members, hoists inline listeners,
 * and sets up `removeEventListener` calls in `disconnectedCallback`.
 * @param {Array<Object>} classMembers - AST nodes for class methods and properties.
 * @param {Object} constructorNode - AST node for the class constructor.
 * @param {Object} disconnectedCbNode - AST node for `disconnectedCallback`.
 * @param {object} eventIdCounter - Counter for unique event handler names, e.g., { count: 0 }.
 * @param {Array<Object>} hoistedHandlerStmts - Array to collect AST for hoisted handler assignments.
 */
function process$EventListeners(classMembers, constructorNode, connectedCbNode, disconnectedCbNode, eventIdCounter, hoistedHandlerStmts) {
    const collectedEventListeners = [];
    const classMethodNames = new Set();
    for (const m of classMembers) {
        if (
            m.type === 'MethodDefinition' &&
            m.key?.type === 'Identifier' &&
            m.kind === 'method' &&
            !m.static
        ) {
            classMethodNames.add(m.key.name);
        }
    }

    for (const memberNode of classMembers) {
        let bodyStmts = null;

        if (memberNode.type === 'MethodDefinition' && memberNode.value && memberNode.value.body) {
             bodyStmts = memberNode.value.body.body;
        } else if (memberNode.type === 'PropertyDefinition' && memberNode.value) {
            // Currently skipping $event processing in PropertyDefinition initializers.
            // Common pattern is `this.nodes.btn.$event(...)` within methods.
             continue;
        }

        if (!bodyStmts || !Array.isArray(bodyStmts)) continue;

        for (let i = bodyStmts.length - 1; i >= 0; i--) {
            const stmt = bodyStmts[i];

            if (
                stmt.type === 'ExpressionStatement' &&
                stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.type === 'MemberExpression' &&
                stmt.expression.callee.property.type === 'Identifier' &&
                stmt.expression.callee.property.name === '$event'
            ) {
                const callExpr = stmt.expression;
                if (callExpr.arguments.length < 2 || callExpr.arguments.length > 3) {
                     // console.warn(`[Hene] Invalid $event arguments at ...`);
                     continue;
                }

                const eventTargetAST = callExpr.callee.object;
                const eventTypeAST = callExpr.arguments[0];
                let listenerAST = callExpr.arguments[1];
                const optionsAST = callExpr.arguments[2] || null;

                let finalListenerAST = listenerAST;
                let hoistedName = null;

                if (
                    listenerAST.type === 'MemberExpression' &&
                    listenerAST.object.type === 'ThisExpression' &&
                    listenerAST.property.type === 'Identifier' &&
                    classMethodNames.has(listenerAST.property.name)
                ) {
                    hoistedName = `_e${eventIdCounter.count++}`;
                    hoistedHandlerStmts.push({
                        type: 'ExpressionStatement',
                        expression: {
                            type: 'AssignmentExpression',
                            operator: '=',
                            left: {
                                type: 'MemberExpression',
                                object: { type: 'ThisExpression' },
                                property: { type: 'Identifier', name: hoistedName },
                                computed: false
                            },
                            right: {
                                type: 'ArrowFunctionExpression',
                                id: null,
                                params: [{ type: 'Identifier', name: 'e' }],
                                body: {
                                    type: 'CallExpression',
                                    callee: {
                                        type: 'MemberExpression',
                                        object: { type: 'ThisExpression' },
                                        property: { type: 'Identifier', name: listenerAST.property.name },
                                        computed: false
                                    },
                                    arguments: [{ type: 'Identifier', name: 'e' }],
                                    optional: false
                                },
                                async: false,
                                expression: true
                            }
                        }
                    });
                    finalListenerAST = {
                        type: 'MemberExpression',
                        object: { type: 'ThisExpression' },
                        property: { type: 'Identifier', name: hoistedName },
                        computed: false
                    };
                } else if (
                    listenerAST.type === 'ArrowFunctionExpression' ||
                    listenerAST.type === 'FunctionExpression'
                ) {
                    hoistedName = `_e${eventIdCounter.count++}`;
                    hoistedHandlerStmts.push({
                        type: 'ExpressionStatement',
                        expression: {
                            type: 'AssignmentExpression',
                            operator: '=',
                            left: {
                                type: 'MemberExpression',
                                object: { type: 'ThisExpression' },
                                property: { type: 'Identifier', name: hoistedName },
                                computed: false
                            },
                            right: listenerAST
                        }
                    });
                    finalListenerAST = {
                        type: 'MemberExpression',
                        object: { type: 'ThisExpression' },
                        property: { type: 'Identifier', name: hoistedName },
                        computed: false
                    };
                } else if (listenerAST.type !== 'MemberExpression' || listenerAST.object.type !== 'ThisExpression') {
                     // console.warn(`[Hene] $event listener may not be stable for removal: ${generate(listenerAST)}`);
                }

                const addEvtStmt = {
                    type: 'ExpressionStatement',
                    expression: {
                        type: 'CallExpression',
                        callee: {
                            type: 'MemberExpression',
                            object: eventTargetAST,
                            property: { type: 'Identifier', name: 'addEventListener' },
                            computed: false
                        },
                        arguments: [
                            eventTypeAST,
                            finalListenerAST,
                            optionsAST || { type: 'Literal', value: false }
                        ],
                        optional: false
                    }
                };

                if (bodyStmts !== connectedCbNode.value.body.body) {
                    throw new Error('$event() can only be used inside connectedCallback');
                }
                bodyStmts[i] = addEvtStmt;

                let removeOptsAST = { type: 'Literal', value: false };
                 if (optionsAST) {
                     if (optionsAST.type === 'ObjectExpression') {
                        const capProp = optionsAST.properties.find(
                            p => p.key.type === 'Identifier' && p.key.name === 'capture'
                        );
                        if (capProp && capProp.value.type === 'Literal' && typeof capProp.value.value === 'boolean') {
                             removeOptsAST = { type: 'Literal', value: capProp.value.value };
                        } else if (capProp && capProp.value.type === 'Identifier' && (capProp.value.name === 'true' || capProp.value.name === 'false')) {
                            removeOptsAST = { type: 'Literal', value: capProp.value.name === 'true' };
                        } else if (capProp) {
                             // console.warn(`[Hene] Unsupported capture value for removeEventListener: ${generate(capProp.value)}`);
                        }
                    } else if (optionsAST.type === 'Literal' && typeof optionsAST.value === 'boolean') {
                         removeOptsAST = { type: 'Literal', value: optionsAST.value };
                    } else if (optionsAST.type === 'Identifier' && (optionsAST.name === 'true' || optionsAST.name === 'false')) {
                         removeOptsAST = { type: 'Literal', value: optionsAST.name === 'true' };
                    } else {
                         // console.warn(`[Hene] Unsupported options for removeEventListener: ${optionsAST.type}`);
                    }
                }

                collectedEventListeners.push({
                    target: eventTargetAST,
                    type: eventTypeAST,
                    listener: finalListenerAST,
                    capture: removeOptsAST
                });
            }
        }
    }

    for (const ev of collectedEventListeners) {
        disconnectedCbNode.value.body.body.unshift({
            type: 'ExpressionStatement',
            expression: {
                type: 'CallExpression',
                callee: {
                    type: 'MemberExpression',
                    object: ev.target,
                    property: { type: 'Identifier', name: 'removeEventListener' },
                    computed: false
                },
                arguments: [ev.type, ev.listener, ev.capture],
                optional: false
            }
        });
    }
}


/**
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
                if (!arg || arg.type !== 'Literal') throw new Error('[Hene] $node() requires a string literal');
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
            if (!arg || arg.type !== 'Literal') throw new Error('[Hene] $node() requires a string literal');
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
            throw new Error('[Hene] $node() can only be used inside the constructor');
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
            throw new Error('[Hene] Cached nodes cannot be used inside the constructor');
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
    process$EventListeners(classNode.body.body, ctor, connectedCb, disconnectedCb, evCounter, hoistedEvHandlers);

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