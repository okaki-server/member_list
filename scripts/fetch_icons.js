/**
 * fetch_icons.js
 * 【旧】CSV → members.json のパイプライン（初期構築用）
 *
 * ⚠️ このスクリプトは初回セットアップ時のみ使用。
 *    定期的なアイコン更新は download_icons.js を使ってください。
 *
 * 使い方: node scripts/fetch_icons.js
 * 効果: members.json の各メンバーの YouTube チャンネルから
 *       アイコン URL を取得して icon フィールドを上書きする。
 *       その後 npm run download-icons でローカル保存に切り替える。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const MEMBERS_JSON = path.resolve(__dirname, '../members.json');

async function getYouTubeIcon(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      }
    });
    const html = await response.text();
    const dom  = new JSDOM(html);
    const meta = dom.window.document.querySelector('meta[property="og:image"]');
    return meta ? meta.content : null;
  } catch (err) {
    console.error(`  ❌ Error: ${url} - ${err.message}`);
    return null;
  }
}

async function main() {
  const members = JSON.parse(fs.readFileSync(MEMBERS_JSON, 'utf-8'));
  let updated = 0;

  for (const member of members) {
    if (!member.youtube) continue;
    process.stdout.write(`  🔍 ${member.name} ... `);
    const iconUrl = await getYouTubeIcon(member.youtube);
    if (iconUrl) {
      member.icon = iconUrl;
      updated++;
      console.log('✅');
    } else {
      console.log('❌ 取得失敗（既存のアイコンを維持）');
    }
    await new Promise(r => setTimeout(r, 500));
  }

  fs.writeFileSync(MEMBERS_JSON, JSON.stringify(members, null, 2), 'utf-8');
  console.log(`\n✅ 完了！${updated} 件のアイコンURLを更新`);
  console.log('次に npm run download-icons を実行してローカルに保存してください。');
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
