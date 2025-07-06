import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { compile } from '../package/compiler/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __show = process.argv.includes('--show');

const suites = ['state', 'events', 'nodes', 'render'];
let failed = false;

for (const s of suites) {
  const srcPath = path.join(__dirname, s, `${s}-source.js`);
  const expectPath = path.join(__dirname, s, `${s}-expected.js`);
  const source = fs.readFileSync(srcPath, 'utf8');
  const expected = fs.readFileSync(expectPath, 'utf8').trim().replace(/\r\n/g, '\n');
  const output = compile(source).trim().replace(/\r\n/g, '\n');

  if (__show) {
    console.log(`\n--- ${s} ---`);
    console.log(source);
    console.log('\n--- EXPECTED ---');
    console.log(expected);
    console.log('\n--- OUTPUT ---');
    console.log(output);
  }

  const pass = output === expected;
  console.log(`${s} ${pass ? '✅' : '❌'}`);
  if (!pass) failed = true;
}

if (failed) {
  process.exitCode = 1;
}
