import { defineConfig } from 'vite';
import { heneCompiler } from 'hene/compiler';

export default defineConfig({
	root: 'src',
	plugins: [
    heneCompiler()
  ]
});
