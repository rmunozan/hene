// hene/compiler/index.js
/**
 * Entry point for Hene JavaScript compilation.
 * Runs the full pipeline on the provided source code.
 */
import { runPipeline } from './pipeline.js';

export default function compile(code) {
    return runPipeline(code);
}
