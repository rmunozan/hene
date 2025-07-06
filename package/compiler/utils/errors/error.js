/**
 * @fileoverview Helper utilities for compiler error creation and reporting.
 */
import { readFileSync } from 'fs';
const messages = JSON.parse(
  readFileSync(new URL('./error-messages.json', import.meta.url), 'utf8')
);

function codeFrame(code, line, column) {
  const lines = code.split('\n').map(l => l.replace(/\t/g, '    '));
  const start = Math.max(0, line - 2);
  const end = Math.min(lines.length, line + 1);
  let frame = '';
  for (let i = start; i < end; i++) {
    const l = i + 1;
    const prefix = l === line ? '>' : ' ';
    const num = String(l).padStart(4);
    frame += `${prefix} ${num} | ${lines[i]}\n`;
  }
  return frame;
}

/**
 * Create a compile-time error with standardized prefix.
 * @param {string} msg
 * @returns {Error}
 */
export function heneError(code, node) {
  const entry = messages[code] || { message: code };
  const error = new Error(entry.message);
  error.id = code;
  if (entry.hint) error.hint = entry.hint;
  if (node?.loc) error.loc = node.loc.start || node.loc;
  return error;
}

/**
 * Report a compilation error with contextual code snippet when available.
 * @param {Error} error
 * @param {string} [code]
 */
export function reportError(error, code, pluginCtx, id) {
  const prefix = `[Hene ${error.id || ''}]`;
  const loc = error.loc && code
    ? { line: error.loc.line, column: error.loc.column, file: id }
    : undefined;
  const frame = error.loc && code
    ? codeFrame(code, error.loc.line, error.loc.column)
    : undefined;
  const parts = ['\n' + prefix, error.message];
  if (error.hint) parts.push(error.hint);
  const msg = parts.join('\n');

  if (pluginCtx && typeof pluginCtx.error === 'function') {
    pluginCtx.error({ id, message: msg, loc, frame });
  } else {
    console.error(msg);
    if (frame) console.error(frame);
  }
}
