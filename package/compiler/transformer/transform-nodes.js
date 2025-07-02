// hene/compiler/transformer/transform-nodes.js
import { heneError } from '../utils/errors/error.js';
import { recordNodeRef } from '../analyzer/analyze-nodes.js';

function collectNodesFromObject(objExpr, baseParts, tracker) {
    for (const prop of objExpr.properties || []) {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
        const val = prop.value;
        const newParts = baseParts.concat(prop.key.name);
        if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$node') {
            const arg = val.arguments && val.arguments[0];
            if (!arg || arg.type !== 'Literal') throw heneError('ERR_NODE_STRING_LITERAL');
            recordNodeRef(arg.value, newParts, tracker);
            prop.value = { type: 'Literal', value: null };
        } else if (val.type === 'ObjectExpression') {
            collectNodesFromObject(val, newParts, tracker);
        }
    }
}

function inspectNodeAssignment(assignExpr, tracker) {
    const left = assignExpr.left;
    const right = assignExpr.right;
    if (left.type !== 'MemberExpression') return null;
    const parts = [];
    let cur = left;
    while (cur.type === 'MemberExpression') {
        if (cur.property.type !== 'Identifier') return null;
        parts.unshift(cur.property.name);
        cur = cur.object;
    }
    if (cur.type === 'ThisExpression') parts.unshift('this');
    else if (cur.type === 'Identifier') parts.unshift(cur.name); else return null;
    if (right.type === 'CallExpression' && right.callee.type === 'Identifier' && right.callee.name === '$node') {
        const arg = right.arguments && right.arguments[0];
        if (!arg || arg.type !== 'Literal') throw heneError('ERR_NODE_STRING_LITERAL');
        recordNodeRef(arg.value, parts, tracker);
        assignExpr.right = { type: 'Literal', value: null };
        return parts;
    } else if (right.type === 'ObjectExpression') {
        collectNodesFromObject(right, parts, tracker);
    }
    return parts;
}

/**
 * Replace $node() calls with null initializers in property definitions and
 * constructor assignments.
 * @param {import('../context.js').Context} context
 */
export function transformNodes(context) {
    const classNode = context.analysis.classNode;
    const nodeTracker = context.analysis.nodeTracker;
    if (!classNode || !nodeTracker) return;

    const classBody = classNode.body.body;
    const ctor = context.analysis.ctor;

    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.value && member.value.type === 'ObjectExpression') {
            if (member.key.type !== 'Identifier') continue;
            collectNodesFromObject(member.value, ['this', member.key.name], nodeTracker);
        }
    }

    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
                inspectNodeAssignment(stmt.expression, nodeTracker);
            }
        }
    }

    const idx = context.analysis.builtIdx;
    if (idx !== -1 && ctor) {
        ctor.value.body.body.splice(idx, 1);
    }
}
