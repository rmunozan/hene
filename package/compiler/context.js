// hene/compiler/context.js
/**
 * @fileoverview Defines the shared Context object for a compilation run.
 *
 * The Context instance acts as a "shared blackboard" that is passed through
 * every stage of the pipeline. It holds the source code, the evolving AST,
 * the results of the analysis stage, and the final output code.
 * This prevents the need for long argument lists in pipeline functions.
 */
export class Context {
    /**
     * @param {string} sourceCode The initial source code to be compiled.
     */
    constructor(sourceCode) {
        /**
         * The original source code string.
         * @type {string}
         */
        this.sourceCode = sourceCode;

        /**
         * The Abstract Syntax Tree. It is initialized by the parser and
         * mutated by the transformer stage.
         * @type {object | null}
         */
        this.jsAst = null;

        /**
         * A container for all metadata gathered during the analysis stage.
         * This object is read by the transformer to guide its modifications.
         * @type {object | null}
         */
        this.analysis = null;

        /**
         * A container for the final output of the compilation.
         * @type {{ code: string }}
         */
        this.output = {
            code: sourceCode // Default to original code in case of early exit.
        };
    }
}
