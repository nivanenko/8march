import { readFileSync, writeFileSync } from 'fs';
import { pbkdf2Sync, randomBytes, createCipheriv } from 'crypto';

const PASSWORD = '11-08-1995';
const SALT = '8march2026';

const source = readFileSync('source.html', 'utf8');
const photoB64 = readFileSync('photo.jpg', 'base64');
const childB64 = readFileSync('child.jpg', 'base64');

const startMarker = '<!-- ENCRYPT-START -->';
const endMarker = '<!-- ENCRYPT-END -->';
const startIdx = source.indexOf(startMarker);
const endIdx = source.indexOf(endMarker) + endMarker.length;

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found in source.html');
  process.exit(1);
}

let cardHtml = source.slice(startIdx + startMarker.length, source.indexOf(endMarker)).trim();
cardHtml = cardHtml.replace('src="photo.jpg"', 'src="data:image/jpeg;base64,' + photoB64 + '"');
cardHtml = cardHtml.replace('src="child.jpg"', 'src="data:image/jpeg;base64,' + childB64 + '"');

const key = pbkdf2Sync(PASSWORD, SALT, 100000, 32, 'sha256');
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(cardHtml, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
const combined = Buffer.concat([encrypted, tag]);

const ivB64 = iv.toString('base64');
const dataB64 = combined.toString('base64');

const decryptScript = `
var ENCRYPTED_IV = '${ivB64}';
var ENCRYPTED_DATA = '${dataB64}';
var DECRYPT_SALT = '${SALT}';

async function decryptCard(password) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  var key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(DECRYPT_SALT), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  var iv = Uint8Array.from(atob(ENCRYPTED_IV), function(c) { return c.charCodeAt(0); });
  var data = Uint8Array.from(atob(ENCRYPTED_DATA), function(c) { return c.charCodeAt(0); });
  var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
  return new TextDecoder().decode(decrypted);
}`;

let output = source.slice(0, startIdx) + '<div id="card-container"></div>' + source.slice(endIdx);

output = output.replace(
  '  createSparkles();\n',
  ''
);

output = output.replace(
  `  openBtn.addEventListener('click', function() {
    if (selDay.value === '11' && selMonth.value === '8' && selYear.value === '1995') {
      dateError.classList.remove('visible');
      window.scrollTo(0, 0);
      document.getElementById('cover').classList.add('opened');
      document.body.classList.remove('cover-visible');
      setTimeout(runReveal, 400);
    } else {
      dateError.classList.add('visible');
      dateSelects.classList.add('shake');
      setTimeout(function() { dateSelects.classList.remove('shake'); }, 400);
    }
  });`,
  `  openBtn.addEventListener('click', async function() {
    var dateStr = selDay.value.padStart(2, '0') + '-' + selMonth.value.padStart(2, '0') + '-' + selYear.value;
    try {
      var html = await decryptCard(dateStr);
      document.getElementById('card-container').innerHTML = html;
      createSparkles();
      dateError.classList.remove('visible');
      window.scrollTo(0, 0);
      document.getElementById('cover').classList.add('opened');
      document.body.classList.remove('cover-visible');
      setTimeout(runReveal, 400);
    } catch(e) {
      dateError.classList.add('visible');
      dateSelects.classList.add('shake');
      setTimeout(function() { dateSelects.classList.remove('shake'); }, 400);
    }
  });`
);

output = output.replace(
  "<script>\n(function() {",
  "<script>" + decryptScript + "\n(function() {"
);

output = output.replace(startMarker + '\n', '');
output = output.replace('\n' + endMarker, '');

writeFileSync('index.html', output);

console.log('Encrypted card content: ' + Math.round(dataB64.length / 1024) + 'KB');
console.log('Written to index.html');
