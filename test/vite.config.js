import { defineConfig } from 'vite';
import compile from '../hene/compiler/entry.js';

function heneCompiler() {
  return {
    name: 'hene-compiler',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id)) return null;
      if (!code.includes('HeneElement')) return null;
      return { code: compile(code), map: null };
    }
  };
}

export default defineConfig({
	root: 'src',
	plugins: [
    heneCompiler()
  ]
});
