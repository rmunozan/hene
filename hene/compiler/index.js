// hene/compiler/index.js
/**
 * Entry point for Hene JavaScript compilation using the new pipeline.
 */
import { runPipeline } from './pipeline.js';

export default function compile(code) {
    return runPipeline(code);
}
