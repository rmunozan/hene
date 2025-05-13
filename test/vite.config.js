import { defineConfig } from 'vite';
import heneCompiler from 'hene';

export default defineConfig({
	root: 'src',
	plugins: [
    heneCompiler()
  ]
});
