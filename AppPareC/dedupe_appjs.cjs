const fs = require('fs');
const path = 'app.js';
const token = "const buildOrderObject = () => {";
let s = fs.readFileSync(path, 'utf8');
let first = s.indexOf(token);
if (first === -1) {
  console.log('token not found');
  process.exit(0);
}
let second = s.indexOf(token, first + 1);
if (second === -1) {
  console.log('only one occurrence');
  process.exit(0);
}
function findClosing(startPos) {
  const openIndex = s.indexOf('{', startPos + token.length);
  if (openIndex === -1) return -1;
  let depth = 1;
  for (let i = openIndex + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
const closeIndex = findClosing(second);
if (closeIndex === -1) {
  console.error('could not find closing brace for second occurrence');
  process.exit(1);
}
let endPos = closeIndex + 1;
// consume following semicolons and whitespace
while (endPos < s.length && /[;\s]/.test(s[endPos])) endPos++;
const before = s.slice(0, second);
const after = s.slice(endPos);
fs.writeFileSync(path + '.bak', s, 'utf8');
fs.writeFileSync(path, before + after, 'utf8');
console.log('removed duplicate buildOrderObject at', second, '->', endPos);
process.exit(0);
