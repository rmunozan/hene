// hene/compiler/entry.js
/**
 * @fileoverview Entry point for Hene JavaScript compilation.
 * Parses source code and runs the compilation pipeline.
 */
import * as acorn from 'acorn';
import { generate } from 'astring';
import runPipeline from './pipeline.js';
import { reportError } from './errors.js';

/**
 * Compile Hene source code.
 * @param {string} code - Original JavaScript source.
 * @returns {string} Transformed code or original on error.
 */
export default function compile(code) {
    if (!code) return '';
    try {
        const ast = acorn.parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true
        });
        runPipeline(ast);
        return generate(ast);
    } catch (e) {
        reportError(e, code);
        return code;
    }
}
