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
    ensureDisconnectedCallback
} from './class-shell.js';
import { heneError } from '../utils/error.js';
import { processEventListeners } from './events.js';
import { collectNodesFromObject, inspectNodeAssignment } from '../2-analyzer/nodes.js';
import { createStateMap } from '../2-analyzer/state.js';
import { buildStateWatchers } from './reactivity.js';
import { processRender } from './build-method.js';

/**
 * Transforms `HeneElement` class AST: re-parents to `HTMLElement`, processes
 * `$render`, and handles `$event` calls.
 *
 * @param {object} classNode - The class declaration AST node.
 */
export function transformHeneClassAST(classNode, analysis) {
    if (!classNode || !classNode.superClass || classNode.superClass.name !== 'HeneElement') {
        return;
    }

    classNode.superClass.name = 'HTMLElement';
    const classBodyMembers = classNode.body.body;

    const ctor = analysis.ctor || ensureConstructor(classBodyMembers);
    const connectedCb = ensureConnectedCallback(classBodyMembers);
    const disconnectedCb = ensureDisconnectedCallback(classBodyMembers);
    const ctorBody = ctor.value.body.body;

    const reactiveStates = analysis.stateMap || createStateMap();
    const nodeTracker = analysis.nodeTracker || { refs: new Map(), paths: new Set() };

    // Mutate property definitions for $node()
    for (const member of classBodyMembers) {
        if (member.type === 'PropertyDefinition' && member.value && member.value.type === 'ObjectExpression') {
            collectNodesFromObject(member.value, ['this', member.key.name], nodeTracker);
        }
    }

    // Mutate constructor assignments for $node()
    for (const stmt of ctorBody) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
            inspectNodeAssignment(stmt.expression, nodeTracker);
        }
    }

    const builtIdx = typeof analysis.builtIdx === 'number' ? analysis.builtIdx : -1;
    if (builtIdx !== -1) {
        ctorBody.splice(builtIdx, 1);
    }

    const buildMethodStmts = [];
    const removedHTML = extractRenderHTML(classBodyMembers);
    const renderHTML = analysis.renderHTML != null ? analysis.renderHTML : removedHTML;
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

