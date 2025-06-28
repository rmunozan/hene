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
function process$EventListeners(classMembers, constructorNode, disconnectedCbNode, eventIdCounter, hoistedHandlerStmts, ctorEventStmts = []) {
    const collectedEventListeners = [];

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
                    (listenerAST.type === 'ArrowFunctionExpression' || listenerAST.type === 'FunctionExpression')
                ) {
                    hoistedName = `_hene_eventHandler_${eventIdCounter.count++}`;
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

                if (bodyStmts === constructorNode.value.body.body) {
                    ctorEventStmts.push(addEvtStmt);
                    bodyStmts.splice(i, 1);
                } else {
                    bodyStmts[i] = addEvtStmt;
                }

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
        const { creation_statements, nodes_assignment, sync_watchers } = buildDomInstructionsAST(renderHTML);
        buildMethodStmts.push(...creation_statements);
        if (nodes_assignment) buildMethodStmts.push(nodes_assignment);

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
                const unwatchName = `_unwatchSync${groupIdx++}`;
                unwatcherVarNames.push(unwatchName);

                const updateStmts = groupData.updates.map(upd => {
                    if (upd.type === 'text') {
                        return {
                            type: 'ExpressionStatement',
                            expression: {
                                type: 'AssignmentExpression', operator: '=',
                                left: { type: 'MemberExpression', object: { type: 'Identifier', name: upd.target }, property: { type: 'Identifier', name: 'textContent' }, computed: false },
                                right: stringToAstLiteral(upd.expr)
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

                syncWatcherAsts.push({
                    type: 'ExpressionStatement',
                    expression: {
                        type: 'AssignmentExpression', operator: '=',
                        left: { type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: unwatchName }, computed: false },
                        right: {
                            type: 'CallExpression',
                            callee: { type: 'MemberExpression', object: groupData.stateAST, property: { type: 'Identifier', name: 'watch' }, computed: false },
                            arguments: [
                                { type: 'ArrowFunctionExpression', id: null, params: [], body: { type: 'BlockStatement', body: updateStmts }, async: false, expression: false },
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
                arguments: [{ type: 'MemberExpression', object: { type: 'ThisExpression' }, property: { type: 'Identifier', name: '_fragment_root' }, computed: false }]
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
    const ctorEventStmts = [];
    let evCounter = { count: 0 };
    // Use currentClassBodyMembers which includes any ensure* created methods
    process$EventListeners(classNode.body.body, ctor, disconnectedCb, evCounter, hoistedEvHandlers, ctorEventStmts);

    ctorBody.push(...hoistedEvHandlers);

    if (buildMethodStmts.length > 0 || ctorEventStmts.length > 0) {
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
                body: { type: 'BlockStatement', body: [...buildMethodStmts, ...ctorEventStmts] },
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