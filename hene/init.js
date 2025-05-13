// hene/init.js
/**
 * @fileoverview Entry point for Hene JavaScript transformations.
 * This module parses JavaScript code using Acorn, identifies classes
 * that extend `HeneElement`, and applies transformations to them
 * using `transformHeneClassAST`. The transformed AST is then
 * converted back to JavaScript code using Astring.
 */
import * as acorn from 'acorn';
import { generate } from 'astring';
import { transformHeneClassAST } from './compiler/class_transformer.js';

/**
 * Parses JavaScript code and transforms classes extending `HeneElement`.
 * @param {string} code - The original JavaScript file content.
 * @returns {string} The transformed JavaScript code, or original on error.
 */
export default function heneInit(code) {
    if (!code) return '';

    try {
        const ast = acorn.parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true // Useful for error reporting
        });

        for (const node of ast.body) {
            if (
                node?.type === 'ClassDeclaration' &&
                node.superClass?.type === 'Identifier' &&
                node.superClass.name === 'HeneElement'
            ) {
                transformHeneClassAST(node);
            }
        }
        return generate(ast);
    } catch (e) {
        console.error("[Hene] Error transforming code:", e.message);
        if (e.loc && code) { // Ensure code is available for snippet
            const { line, column } = e.loc;
            const lines = code.split('\n');
            console.error(`Error at line ${line}, column ${column}:`);
            const start = Math.max(0, line - 3);
            const end = Math.min(lines.length, line + 2);
            for (let i = start; i < end; i++) {
                console.error(`${i + 1}: ${lines[i]}`);
                if (i === line - 1) {
                    console.error(' '.repeat(String(i + 1).length + 2 + column) + '^');
                }
            }
        } else if (e.stack) {
            console.error(e.stack);
        }
        return code; // Return original code on error
    }
}