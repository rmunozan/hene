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
    ensureDisconnectedCallback,
    heneError,
    partsFromMember
} from './utils.js';
import { processEventListeners } from './events.js';
import { createNodeTracker, collectNodesFromObject, hasNodeCall, containsNodeRef, inspectNodeAssignment } from './node.js';
import { createStateMap, collectStatesFromObject, inspectStateAssignment, recordState, buildStateWatchers } from './state.js';
import { processRender } from './render.js';

/**
 * Transforms `HeneElement` class AST: re-parents to `HTMLElement`, processes
 * `$render`, and handles `$event` calls.
 *
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

    const reactiveStates = createStateMap();
    const nodeTracker = createNodeTracker();

    // Collect state and node references from property definitions
    for (const member of classBodyMembers) {
        if (member.type === 'PropertyDefinition' && member.value) {
            if (member.key.type !== 'Identifier') continue;
            const base = ['this', member.key.name];
            const val = member.value;
            if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$state') {
                recordState(base, reactiveStates);
            } else if (val.type === 'ObjectExpression') {
                collectStatesFromObject(val, base, reactiveStates);
                collectNodesFromObject(val, base, nodeTracker);
            }
        }
    }

    for (const member of classBodyMembers) {
        if (member === ctor) continue;
        if (hasNodeCall(member)) {
            throw heneError('() can only be used inside the constructor');
        }
    }

    for (const stmt of ctorBody) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
            inspectStateAssignment(stmt.expression, reactiveStates);
            const parts = inspectNodeAssignment(stmt.expression, nodeTracker);
            if (stmt.expression.right.type === 'ObjectExpression' && parts) {
                collectStatesFromObject(stmt.expression.right, parts, reactiveStates);
            }
        }
    }

    for (const stmt of ctorBody) {
        if (containsNodeRef(stmt, nodeTracker)) {
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
        const { statements, watchers } = processRender(renderHTML, reactiveStates, nodeTracker.refs);
        buildMethodStmts.push(...statements);
        const watchData = buildStateWatchers(watchers);
        buildMethodStmts.push(...watchData.statements);
        unwatcherVarNames = watchData.unwatcherNames;

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

