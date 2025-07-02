// hene/compiler/analyzer/analyze-nodes.js
import { makeMemberAst } from '../utils/ast/ast-builder.js';
import { partsFromMember } from '../utils/ast/ast-inspector.js';
import { heneError } from '../utils/errors/error.js';

export function createNodeTracker() {
    return { refs: new Map(), paths: new Set() };
}

export function recordNodeRef(nodeName, parts, tracker) {
    if (!tracker.refs.has(nodeName)) tracker.refs.set(nodeName, []);
    tracker.refs.get(nodeName).push(makeMemberAst(parts));
    tracker.paths.add(parts.join('.'));
}
export function scanNodesFromObject(objExpr, baseParts, tracker) {
    for (const prop of objExpr.properties || []) {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
        const val = prop.value;
        const newParts = baseParts.concat(prop.key.name);
        if (val.type === 'CallExpression' && val.callee.type === 'Identifier' && val.callee.name === '$node') {
            const arg = val.arguments && val.arguments[0];
            if (!arg || arg.type !== 'Literal') throw heneError('ERR_NODE_STRING_LITERAL');
            recordNodeRef(arg.value, newParts, tracker);
        } else if (val.type === 'ObjectExpression') {
            scanNodesFromObject(val, newParts, tracker);
        }
    }
}

export function scanNodeAssignment(assignExpr, tracker) {
    const left = assignExpr.left;
    const right = assignExpr.right;
    if (left.type !== 'MemberExpression') return null;
    const parts = partsFromMember(left);
    if (!parts) return null;
    if (right.type === 'CallExpression' && right.callee.type === 'Identifier' && right.callee.name === '$node') {
        const arg = right.arguments && right.arguments[0];
        if (!arg || arg.type !== 'Literal') throw heneError('ERR_NODE_STRING_LITERAL');
        recordNodeRef(arg.value, parts, tracker);
        return parts;
    } else if (right.type === 'ObjectExpression') {
        scanNodesFromObject(right, parts, tracker);
    }
    return parts;
}


export function hasNodeCall(ast) {
    if (!ast || typeof ast !== 'object') return false;
    if (ast.type === 'CallExpression' && ast.callee.type === 'Identifier' && ast.callee.name === '$node') return true;
    for (const k in ast) {
        const v = ast[k];
        if (Array.isArray(v)) { if (v.some(e => hasNodeCall(e))) return true; }
        else if (v && typeof v === 'object') { if (hasNodeCall(v)) return true; }
    }
    return false;
}

export function analyzeNodes(context) {
    const classNode = context.analysis.classNode;
    if (!classNode) return;

    const tracker = createNodeTracker();
    const classBody = classNode.body.body;
    const ctor = context.analysis.ctor;

    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.value && member.value.type === 'ObjectExpression') {
            if (member.key.type !== 'Identifier') continue;
            scanNodesFromObject(member.value, ['this', member.key.name], tracker);
        }
    }

    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
                scanNodeAssignment(stmt.expression, tracker);
            }
        }
    }

    for (const member of classBody) {
        if (member === ctor) continue;
        if (hasNodeCall(member)) {
            throw heneError('ERR_NODE_CONSTRUCTOR_ONLY');
        }
    }

    context.analysis.nodeTracker = tracker;
}
