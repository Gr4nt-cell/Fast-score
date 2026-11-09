#!/usr/bin/env node
/**
 * Parses every source file the way Metro will.
 *
 * `node --check` is not a substitute: it parses as a script, so it accepts
 * things the real bundler rejects and chokes on JSX it should accept. A
 * redeclared identifier shipped to CI once because of exactly that, and a
 * failed JS bundle costs a three-minute Gradle run to discover.
 *
 * Uses @babel/parser when it is installed (it is, in CI, via node_modules)
 * and says so plainly when it isn't, rather than passing silently.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['src', 'modules', 'plugins'];
const FILES = ['App.js', 'index.js', 'app.config.js'];

let parse;
for (const base of [ROOT, process.env.BABEL_PARSER_PATH || '']) {
  if (!base) continue;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    parse = require(require.resolve('@babel/parser', { paths: [base] })).parse;
    break;
  } catch {
    // try the next location
  }
}
if (!parse) {
  console.error('syntax: @babel/parser not found — run npm install first (checked node_modules and BABEL_PARSER_PATH)');
  process.exit(2);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'build' || name === '.git') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = [];
for (const d of DIRS) {
  const full = path.join(ROOT, d);
  if (fs.existsSync(full)) walk(full, files);
}
for (const f of FILES) {
  const full = path.join(ROOT, f);
  if (fs.existsSync(full)) files.push(full);
}

let bad = 0;
for (const file of files) {
  try {
    parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread'],
      errorRecovery: false,
    });
  } catch (e) {
    bad += 1;
    const where = e.loc ? `:${e.loc.line}:${e.loc.column}` : '';
    console.error(`syntax: ${path.relative(ROOT, file)}${where} ${e.message.split('\n')[0]}`);
  }
}

if (bad) {
  console.error(`syntax: ${bad} file(s) would fail to bundle`);
  process.exit(1);
}
console.log(`syntax: ${files.length} files parse`);
