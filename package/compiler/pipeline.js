// hene/compiler/pipeline.js
/**
 * @fileoverview The master pipeline orchestrator for the Hene compiler.
 *
 * This file instantiates a shared Context and passes it sequentially
 * through every specialized function from all compiler stages.
 */

import { Context } from './context.js';

// --- STAGE 1: PARSER ---
import { parseJavaScript } from './parser/js-parser.js';

// --- STAGE 2: ANALYZERS ---
import { findHeneClass } from './analyzer/analyze-class.js';
import { analyzeState } from './analyzer/analyze-state.js';
import { analyzeNodes } from './analyzer/analyze-nodes.js';
import { analyzeRender } from './analyzer/analyze-render.js';

// --- STAGE 3: TRANSFORMERS ---
import { transformClassShell } from './transformer/transform-class-shell.js';
import { transformNodes } from './transformer/transform-nodes.js';
import { transformRender } from './transformer/transform-render.js';
import { transformWatchers } from './transformer/transform-watchers.js';
import { transformEvents } from './transformer/transform-events.js';

// --- STAGE 4: GENERATOR ---
import { generateJavaScript } from './generator/js-generator.js';

import { reportError } from './utils/errors/error.js';

/**
 * Runs the full compilation pipeline on a string of source code.
 * @param {string} sourceCode The original JavaScript source code.
 * @returns {string} The transformed JavaScript code.
 */
export function runPipeline(sourceCode, opts = {}) {
    if (!sourceCode) return '';

    // Initialize the shared context for this entire compilation run.
    const context = new Context(sourceCode);
    const pluginCtx = opts.pluginCtx;
    const id = opts.id;

    try {
        // STAGE 1: PARSING
        parseJavaScript(context);

        // STAGE 2: ANALYSIS
        findHeneClass(context);
        if (!context.analysis?.classNode) {
            return context.sourceCode;
        }
        analyzeState(context);
        analyzeNodes(context);
        analyzeRender(context);

        // STAGE 3: TRANSFORMATION
        transformClassShell(context);
        transformNodes(context);
        transformRender(context);
        transformWatchers(context);
        transformEvents(context);

        // STAGE 4: GENERATION
        generateJavaScript(context);

    } catch (e) {
        reportError(e, context.sourceCode, pluginCtx, id);
    }

    // Return the final code from the context.
    return context.output.code;
}
