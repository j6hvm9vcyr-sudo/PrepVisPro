// Change le numéro de version partout (app Mac, interface, exports) : node scripts/bump-version.mjs 0.3.0
import { readFileSync, writeFileSync } from 'node:fs';

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) {
  console.error('Usage : node scripts/bump-version.mjs X.Y.Z');
  process.exit(1);
}
const json = (f, fn) => {
  const o = JSON.parse(readFileSync(f, 'utf8'));
  fn(o);
  writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
};
json('package.json', (o) => void (o.version = v));
json('package-lock.json', (o) => {
  o.version = v;
  if (o.packages?.['']) o.packages[''].version = v;
});
json('src-tauri/tauri.conf.json', (o) => void (o.version = v));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
writeFileSync('src-tauri/Cargo.toml', cargo.replace(/^version = "[^"]+"/m, `version = "${v}"`));
const lock = readFileSync('src-tauri/Cargo.lock', 'utf8');
writeFileSync('src-tauri/Cargo.lock', lock.replace(/(name = "prepvispro"\nversion = ")[^"]+"/, `$1${v}"`));
console.log(`Version ${v}`);
