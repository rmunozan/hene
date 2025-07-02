import compile from './compiler/index.js';
export { $state } from './runtime/state.js';
export { HeneElement } from './compiler/utils/base-class.js';

export function heneCompiler() {
  return {
    name: 'hene-compiler',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id)) return null;
      if (!code.includes('HeneElement')) return null;
      const out = compile(code);
      console.log('\nCompiled output for', id, '\n', out);
      return { code: out, map: null };
    }
  };
}
