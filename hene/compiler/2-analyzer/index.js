import { createStateMap, recordState, collectStatesFromObject, inspectStateAssignment } from './state.js';
import { createNodeTracker, scanNodesFromObject, scanNodeAssignment, hasNodeCall } from './nodes.js';
import { findRenderHTML } from './render.js';
import { heneError } from '../utils/error.js';

export function analyzeClass(classNode) {
    const classBody = classNode.body.body;
    const ctor = classBody.find(m => m.type === 'MethodDefinition' && m.kind === 'constructor');
    const ctx = {
        stateMap: createStateMap(),
        nodeTracker: createNodeTracker(),
        renderHTML: null,
        builtIdx: -1,
        ctor
    };

    // analyze property definitions
    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.value) {
            if (member.key.type !== 'Identifier') continue;
            const base = ['this', member.key.name];
            const val = member.value;
            if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$state') {
                recordState(base, ctx.stateMap);
            } else if (val.type === 'ObjectExpression') {
                collectStatesFromObject(val, base, ctx.stateMap);
                scanNodesFromObject(val, base, ctx.nodeTracker);
            }
        }
    }

    for (const member of classBody) {
        if (member === ctor) continue;
        if (hasNodeCall(member)) {
            throw heneError('$node() can only be used inside the constructor');
        }
    }

    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
                inspectStateAssignment(stmt.expression, ctx.stateMap);
                const parts = scanNodeAssignment(stmt.expression, ctx.nodeTracker);
                if (stmt.expression.right.type === 'ObjectExpression' && parts) {
                    collectStatesFromObject(stmt.expression.right, parts, ctx.stateMap);
                }
            }
        }

        for (const stmt of ctorBody) {
            if (
                stmt.type === 'ExpressionStatement' &&
                stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.type === 'MemberExpression' &&
                stmt.expression.callee.object.type === 'ThisExpression' &&
                stmt.expression.callee.property.type === 'Identifier' &&
                stmt.expression.callee.property.name === '$built'
            ) {
                ctx.builtIdx = ctorBody.indexOf(stmt);
                break;
            }
        }
    }

    ctx.renderHTML = findRenderHTML(classBody);
    return ctx;
}
