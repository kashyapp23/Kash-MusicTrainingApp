'use strict';
// Explicit publication list: never copy Git history, baseline, backups or test data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const files = [
    'index.html', 'credits.html', 'styles.css', 'nordic.css', 'audio.js', 'app.js', 'ui.js',
    'selection.js', 'stats.js', 'analytics.js', 'storage.js', 'THIRD_PARTY_NOTICES.md',
    'licenses/Salamander-README.txt'
];
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function verify() {
    for (const file of files) {
        const absolute = path.join(root, file);
        if (!fs.lstatSync(absolute).isFile()) throw new Error(`Not a regular file: ${file}`);
        if (!fs.realpathSync(absolute).startsWith(root + path.sep)) throw new Error(`Outside project: ${file}`);
    }
    for (const file of files.filter(file => /\.(js|html|css)$/.test(file))) {
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        if (/Saher Galt|Incisive stab|Piercing sting|geometrically one|cdnjs\.cloudflare|vendor\/|\bTone\.(?:Sampler|now|loaded|context|Frequency|start)\b/.test(text)) {
            throw new Error(`Unreviewed legacy content in ${file}`);
        }
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|AKIA[A-Z0-9]{16}/.test(text)) {
            throw new Error(`Possible credential in ${file}`);
        }
    }
    for (const file of ['index.html', 'credits.html']) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        for (const [, link] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
            if (!/^(https?:|#)/.test(link) && !files.includes(link)) {
                throw new Error(`Missing publication resource: ${link}`);
            }
        }
    }
    console.log(`Verified ${files.length} publication files and resource links.`);
}
verify();
if (process.argv.includes('--check')) process.exit(0);
const output = path.join(root, 'release', `site-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(output, { recursive: true });
const manifest = {};
for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file));
    fs.mkdirSync(path.dirname(path.join(output, file)), { recursive: true });
    fs.writeFileSync(path.join(output, file), bytes, { flag: 'wx' });
    manifest[file] = sha256(bytes);
}
fs.writeFileSync(path.join(output, 'SHA256SUMS.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Publication snapshot: ${output}`);
console.log('Use this folder as a NEW repository; do not copy the development .git directory.');
