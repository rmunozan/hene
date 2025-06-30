import { generate } from 'astring';

export function extractRenderHTML(classBody) {
    if (!classBody) return null;
    let html = null;
    for (let i = 0; i < classBody.length; i++) {
        const member = classBody[i];
        if (!member) continue;
        if (
            member.type === 'PropertyDefinition' &&
            member.key?.type === 'Identifier' &&
            member.key.name === '$render'
        ) {
            if (member.value?.type === 'Literal') html = member.value.value;
            else if (member.value?.type === 'TemplateLiteral') html = generate(member.value).slice(1, -1);
            classBody.splice(i, 1); i--;
        } else if (
            member.type === 'MethodDefinition' &&
            member.key?.type === 'Identifier' &&
            member.key.name === '$render' &&
            member.value?.body?.type === 'BlockStatement'
        ) {
            const retStmt = member.value.body.body.find(s => s.type === 'ReturnStatement');
            if (retStmt?.argument?.type === 'Literal') html = retStmt.argument.value;
            else if (retStmt?.argument?.type === 'TemplateLiteral') html = generate(retStmt.argument).slice(1, -1);
            classBody.splice(i, 1); i--;
        }
        if (html !== null) break;
    }
    return html;
}

export function ensureConstructor(classBody) {
    let ctor = classBody.find(m => m.type === 'MethodDefinition' && m.kind === 'constructor');
    if (!ctor) {
        ctor = {
            type: 'MethodDefinition', kind: 'constructor', static: false, computed: false,
            key: { type: 'Identifier', name: 'constructor' },
            value: {
                type: 'FunctionExpression', id: null, params: [],
                body: { type: 'BlockStatement', body: [] },
                async: false, generator: false, expression: false
            }
        };
        classBody.unshift(ctor);
    }
    return ctor;
}

export function prependSuperCall(ctorNode) {
    if (!ctorNode?.value?.body) return;
    const bodyStmts = ctorNode.value.body.body;
    const hasSuper = bodyStmts.some(
        s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && s.expression.callee.type === 'Super'
    );
    if (!hasSuper) {
        bodyStmts.unshift({
            type: 'ExpressionStatement',
            expression: { type: 'CallExpression', callee: { type: 'Super' }, arguments: [], optional: false }
        });
    }
}

export function ensureConnectedCallback(classBody) {
    let cb = classBody.find(m => m.type === 'MethodDefinition' && m.key?.name === 'connectedCallback');
    if (!cb) {
        cb = {
            type: 'MethodDefinition', kind: 'method', static: false, computed: false,
            key: { type: 'Identifier', name: 'connectedCallback' },
            value: {
                type: 'FunctionExpression', id: null, params: [],
                body: { type: 'BlockStatement', body: [] },
                async: false, generator: false, expression: false
            }
        };
        classBody.push(cb);
    }
    return cb;
}

export function ensureDisconnectedCallback(classBody) {
    let cb = classBody.find(m => m.type === 'MethodDefinition' && m.key?.name === 'disconnectedCallback');
    if (!cb) {
        cb = {
            type: 'MethodDefinition', kind: 'method', static: false, computed: false,
            key: { type: 'Identifier', name: 'disconnectedCallback' },
            value: {
                type: 'FunctionExpression', id: null, params: [],
                body: { type: 'BlockStatement', body: [] },
                async: false, generator: false, expression: false
            }
        };
        classBody.push(cb);
    }
    return cb;
}
