// hene/index.js
import heneInit from "./init.js";

export default function heneCompiler() {
  return {
    name: 'hene-compiler',
    enforce: 'pre',

    /**
     * Only transform JS/TS files that actually use HeneElement.
     */
    async transform(code, id) {
      // Skip non-JS/TS files
      if (!/\.[jt]sx?$/.test(id)) return null;

      // Quick check: bail if no HeneElement
      if (!code.includes('HeneElement')) return null;

      // Run the core init transform
      const transformedCode = heneInit(code);

      return {
        code: transformedCode,
        map: null   // no sourcemaps
      };
    }
  };
}
