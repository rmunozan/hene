// hene/compiler/analyzer/analyze-render.js
/**
 * Finds the `$render` property and extracts the raw HTML.
 */
import { findRenderHTML } from '../2-analyzer/render.js';

export function analyzeRender(context) {
    const cls = context.analysis?.classNode;
    if (!cls) return;
    const classBody = cls.body.body;
    context.analysis.renderHTML = findRenderHTML(classBody);

    const ctor = context.analysis.ctor;
    if (ctor) {
        const ctorBody = ctor.value.body.body;
        for (const stmt of ctorBody) {
            if (
                stmt.type === 'ExpressionStatement' &&
                stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.type === 'MemberExpression' &&
                stmt.expression.callee.object.type === 'ThisExpression' &&
                stmt.expression.callee.property.type === 'Identifier' &&
                stmt.expression.callee.property.name === '$built'
            ) {
                context.analysis.builtIdx = ctorBody.indexOf(stmt);
                break;
            }
        }
    }
}
