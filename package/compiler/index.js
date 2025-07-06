// hene/compiler/index.js
/**
 * Entry point for Hene JavaScript compilation.
 * Runs the full pipeline on the provided source code.
 */
import { runPipeline } from './pipeline.js';

export function compile(code, opts = {}) {
    return runPipeline(code, opts);
}

export function heneCompiler() {
  return {
    name: 'hene-compiler',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id)) return null;
      // Only match class declarations that extend HeneElement
      if (!/\bclass\s+\w+\s+extends\s+HeneElement\b/.test(code)) return null;
      const out = compile(code, { pluginCtx: this, id });
      console.log('\nCompiled output for', id, '\n', out);
      return { code: out, map: null };
    }
  };
}