/**
 * download_icons.js
 * members.json の icon フィールドの画像を public/icons/ にダウンロードし、
 * icon フィールドをローカルパスに書き換える。
 * 使い方: node scripts/download_icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMBERS_JSON = path.resolve(__dirname, '../public/members.json');
const ICONS_DIR   = path.resolve(__dirname, '../public/icons');

if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

/** ファイル名として安全な文字列にする */
function safeName(name) {
  return name.replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '_');
}

async function downloadIcon(url, dest) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

async function main() {
  const members = JSON.parse(fs.readFileSync(MEMBERS_JSON, 'utf-8'));
  let updated = 0;

  for (const member of members) {
    const iconUrl = member.icon;
    // すでにローカルパスなら skip
    if (!iconUrl || iconUrl.startsWith('/') || iconUrl.startsWith('./')) {
      console.log(`  ⏭  ${member.name}: すでにローカル`);
      continue;
    }

    const fileName   = `${safeName(member.name)}.jpg`;
    const localPath  = path.join(ICONS_DIR, fileName);
    const publicPath = `/icons/${fileName}`;

    process.stdout.write(`  📥 ${member.name} ... `);
    try {
      await downloadIcon(iconUrl, localPath);
      member.icon = publicPath;
      updated++;
      console.log('✅');
    } catch (err) {
      console.log(`❌ ${err.message}（元URLを維持）`);
    }

    // レート制限を避けるために少し待つ
    await new Promise(r => setTimeout(r, 300));
  }

  fs.writeFileSync(MEMBERS_JSON, JSON.stringify(members, null, 2), 'utf-8');
  console.log(`\n✅ 完了！${updated} 件のアイコンをローカル保存 → ${ICONS_DIR}`);
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
