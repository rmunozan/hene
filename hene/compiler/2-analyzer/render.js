import { generate } from 'astring';

export function findRenderHTML(classBody) {
    if (!classBody) return null;
    for (const member of classBody) {
        if (member.type === 'PropertyDefinition' && member.key?.type === 'Identifier' && member.key.name === '$render') {
            if (member.value?.type === 'Literal') return member.value.value;
            if (member.value?.type === 'TemplateLiteral') return generate(member.value).slice(1, -1);
        } else if (member.type === 'MethodDefinition' && member.key?.type === 'Identifier' && member.key.name === '$render' && member.value?.body?.type === 'BlockStatement') {
            const retStmt = member.value.body.body.find(s => s.type === 'ReturnStatement');
            if (retStmt?.argument?.type === 'Literal') return retStmt.argument.value;
            if (retStmt?.argument?.type === 'TemplateLiteral') return generate(retStmt.argument).slice(1, -1);
        }
    }
    return null;
}
