/**
 * download_icons.js
 * members.json の icon フィールドの画像を public/icons/ にダウンロードし、
 * icon フィールドをローカルパスに書き換える。
 * 使い方: node scripts/download_icons.js
 *
 * YouTube のアイコンURLは末尾の "=s900-c-k-..." がサイズ指定になっているため、
 * ダウンロード前に ICON_SIZE へ書き換えて Google 側でリサイズ済みの画像を取得する。
 * （s900 は1枚あたり約130KB、s360 なら約47KB）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMBERS_JSON = path.resolve(__dirname, '../members.json');
const ICONS_DIR   = path.resolve(__dirname, '../icons');

// サイト上の最大表示サイズはモーダルの168px。Retina(2倍)を考慮して360pxで取得する。
const ICON_SIZE = 360;

if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

/** ファイル名として安全な文字列にする */
function safeName(name) {
  return name.replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '_');
}

/**
 * googleusercontent 系URLのサイズ指定を差し替える。
 * 例: ...=s900-c-k-c0x00ffffff-no-rj → ...=s360-c-k-c0x00ffffff-no-rj
 * 対象外のURLや想定外の形式はそのまま返す。
 */
function withIconSize(url, size = ICON_SIZE) {
  if (!/(googleusercontent|ggpht)\.com/.test(url)) return url;

  const eq = url.lastIndexOf('=');
  if (eq === -1) return `${url}=s${size}`;

  const base = url.slice(0, eq);
  let replaced = false;
  const opts = url.slice(eq + 1).split('-').map(o => {
    if (/^s\d+$/.test(o)) { replaced = true; return `s${size}`; }
    if (/^[wh]\d+$/.test(o)) { replaced = true; return `${o[0]}${size}`; }
    return o;
  });
  if (!replaced) opts.unshift(`s${size}`);

  return `${base}=${opts.join('-')}`;
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
    if (!iconUrl || !iconUrl.startsWith('http')) {
      console.log(`  ⏭  ${member.name}: すでにローカル`);
      continue;
    }

    const fileName   = `${safeName(member.name)}.jpg`;
    const localPath  = path.join(ICONS_DIR, fileName);
    const publicPath = `icons/${fileName}`;

    process.stdout.write(`  📥 ${member.name} ... `);
    try {
      await downloadIcon(withIconSize(iconUrl), localPath);
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
