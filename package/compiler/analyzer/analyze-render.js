// hene/compiler/analyzer/analyze-render.js
import { generate } from 'astring';
import { heneError } from '../utils/errors/error.js';

function findRenderHTML(classBody) {
    if (!classBody) return { html: null, node: null };
    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.key?.type === 'Identifier' && member.key.name === '$render') {
            const val = member.value;
            if (val?.type === 'Literal' && typeof val.value === 'string') {
                if (val.value === '') throw heneError('ERR_RENDER_EMPTY', val);
                return { html: val.value, node: member };
            }
            if (val?.type === 'TemplateLiteral') {
                const html = generate(val).slice(1, -1);
                if (html === '') throw heneError('ERR_RENDER_EMPTY', val);
                return { html, node: member };
            }
            throw heneError('ERR_RENDER_STRING', val || member);
        } else if (member.type === 'MethodDefinition' && member.key?.type === 'Identifier' && member.key.name === '$render' && member.value?.body?.type === 'BlockStatement') {
            const retStmt = member.value.body.body.find(s => s.type === 'ReturnStatement');
            const arg = retStmt?.argument;
            if (arg?.type === 'Literal' && typeof arg.value === 'string') {
                if (arg.value === '') throw heneError('ERR_RENDER_EMPTY', arg);
                return { html: arg.value, node: member };
            }
            if (arg?.type === 'TemplateLiteral') {
                const html = generate(arg).slice(1, -1);
                if (html === '') throw heneError('ERR_RENDER_EMPTY', arg);
                return { html, node: member };
            }
            throw heneError('ERR_RENDER_STRING', arg || member);
        }
    }
    return { html: null, node: null };
}

function hasRenderCall(ast, ignore) {
    if (!ast || typeof ast !== 'object' || ast === ignore) return false;
    if (ast.type === 'CallExpression') {
        const callee = ast.callee;
        if ((callee.type === 'Identifier' && callee.name === '$render') ||
            (callee.type === 'MemberExpression' && callee.property.type === 'Identifier' && callee.property.name === '$render')) {
            return true;
        }
    }
    for (const k in ast) {
        const v = ast[k];
        if (Array.isArray(v)) { if (v.some(e => hasRenderCall(e, ignore))) return true; }
        else if (v && typeof v === 'object') { if (hasRenderCall(v, ignore)) return true; }
    }
    return false;
}

/**
 * Extract the $render HTML string and store it on context.analysis.renderHTML.
 * @param {import('../context.js').Context} context
 */
export function analyzeRender(context) {
    const classNode = context.analysis.classNode;
    if (!classNode) return;
    const { html, node } = findRenderHTML(classNode.body.body);
    for (const m of classNode.body.body) {
        if (m === node) continue;
        if (hasRenderCall(m)) throw heneError('ERR_RENDER_CALLED', m);
    }
    context.analysis.renderHTML = html;
}
