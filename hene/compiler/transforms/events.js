// hene/compiler/transforms/events.js
/**
 * @fileoverview Event-related transforms for Hene.
 * Provides utilities for handling `$event` calls within component classes.
 */
import { heneError } from '../errors.js';

/**
 * Processes `$event` calls in class members, hoists inline listeners,
 * and sets up `removeEventListener` calls in `disconnectedCallback`.
 *
 * @param {Array<Object>} classMembers - AST nodes for class methods and properties.
 * @param {Object} constructorNode - AST node for the class constructor.
 * @param {Object} connectedCbNode - AST node for `connectedCallback`.
 * @param {Object} disconnectedCbNode - AST node for `disconnectedCallback`.
 * @param {object} eventIdCounter - Counter for unique event handler names.
 * @param {Array<Object>} hoistedHandlerStmts - Collector for hoisted handler assignments.
 */
export function processEventListeners(classMembers, constructorNode, connectedCbNode, disconnectedCbNode, eventIdCounter, hoistedHandlerStmts) {
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
                        throw heneError('$event() can only be used inside connectedCallback');
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

