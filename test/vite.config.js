import { defineConfig } from 'vite';
import compile from '../hene/compiler/index.js';

function heneCompiler() {
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

export default defineConfig({
	root: 'src',
	plugins: [
    heneCompiler()
  ]
});
