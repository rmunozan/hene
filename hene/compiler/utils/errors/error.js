// hene/compiler/utils/error.js
import messages from './error-messages.json' assert { type: 'json' };
/**
 * @fileoverview Helper utilities for compiler error creation and reporting.
 */

/**
 * Create a compile-time error with standardized prefix.
 * @param {string} msg
 * @returns {Error}
 */
export function heneError(code) {
  const msg = messages[code] || code;
  return new Error(`[Hene] ${msg}`);
}

/**
 * Report a compilation error with contextual code snippet when available.
 * @param {Error} error
 * @param {string} [code]
 */
export function reportError(error, code) {
  console.error(`[Hene] ${error.message}`);
  if (error.loc && code) {
    const { line, column } = error.loc;
    const lines = code.split('\n');
    const start = Math.max(0, line - 3);
    const end = Math.min(lines.length, line + 2);
    console.error(`Error at line ${line}, column ${column}:`);
    for (let i = start; i < end; i++) {
      console.error(`${i + 1}: ${lines[i]}`);
      if (i === line - 1) {
        console.error(' '.repeat(String(i + 1).length + 2 + column) + '^');
      }
    }
  } else if (error.stack) {
    console.error(error.stack);
  }
}
