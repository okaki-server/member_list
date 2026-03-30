/**
 * update_subscribers.js
 * YouTube Data API v3 を使って members.json の subscribers フィールドを更新する。
 * 使い方: node scripts/update_subscribers.js
 * 必要な環境変数: YOUTUBE_API_KEY (.env または GitHub Secrets)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// .env ファイルのサポート（ローカル実行時）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('❌ YOUTUBE_API_KEY が設定されていません。.env ファイルまたは GitHub Secrets を確認してください。');
  process.exit(1);
}

const MEMBERS_JSON = path.resolve(__dirname, '../members.json');

/**
 * YouTube チャンネル URL からチャンネルID を取得する
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function resolveChannelId(url) {
  try {
    // @ハンドル形式: https://www.youtube.com/@xxx
    const handleMatch = url.match(/youtube\.com\/@([^/?&]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];
      const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${handle}&key=${API_KEY}`;
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (json.items && json.items.length > 0) return json.items[0].id;
    }

    // channel/UC... 形式
    const channelMatch = url.match(/youtube\.com\/channel\/(UC[^/?&]+)/);
    if (channelMatch) return channelMatch[1];

    // /c/カスタム名 形式（非推奨だがフォールバック）
    const customMatch = url.match(/youtube\.com\/c\/([^/?&]+)/);
    if (customMatch) {
      const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${customMatch[1]}&key=${API_KEY}`;
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (json.items && json.items.length > 0) return json.items[0].id;
    }

    return null;
  } catch (err) {
    console.warn(`  ⚠️  チャンネルID取得失敗: ${url} - ${err.message}`);
    return null;
  }
}

/**
 * チャンネルIDリストから登録者数をまとめて取得（最大50件/リクエスト）
 * @param {string[]} channelIds
 * @returns {Promise<Map<string, number>>} channelId → subscriberCount
 */
async function fetchSubscriberCounts(channelIds) {
  const result = new Map();
  const chunks = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    chunks.push(channelIds.slice(i, i + 50));
  }
  for (const chunk of chunks) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${chunk.join(',')}&key=${API_KEY}`;
    const res = await fetch(apiUrl);
    const json = await res.json();
    if (json.error) {
      console.error(`❌ YouTube API エラー: ${json.error.message}`);
      continue;
    }
    for (const item of (json.items || [])) {
      const count = parseInt(item.statistics?.subscriberCount ?? '0', 10);
      result.set(item.id, count);
    }
  }
  return result;
}

async function main() {
  console.log('📂 members.json を読み込み中...');
  const members = JSON.parse(fs.readFileSync(MEMBERS_JSON, 'utf-8'));

  // 運営を含む全メンバーを対象とする
  const targets = members;
  console.log(`🎯 対象メンバー: ${targets.length} 名`);

  // チャンネルIDの解決
  console.log('\n🔍 チャンネルID を解決中...');
  const idMap = new Map(); // member index → channelId
  const channelIds = [];

  for (const member of targets) {
    process.stdout.write(`  ${member.name} ... `);
    const channelId = await resolveChannelId(member.youtube);
    if (channelId) {
      idMap.set(member.name, channelId);
      channelIds.push(channelId);
      console.log(`✅ ${channelId}`);
    } else {
      console.log('❌ 取得失敗（スキップ）');
    }
  }

  // 登録者数の一括取得
  console.log('\n📊 登録者数を取得中...');
  const subsMap = await fetchSubscriberCounts([...new Set(channelIds)]);

  // members.json を更新
  let updatedCount = 0;
  for (const member of members) {
    const channelId = idMap.get(member.name);
    if (channelId && subsMap.has(channelId)) {
      const newSubs = subsMap.get(channelId);
      if (member.subscribers !== newSubs) {
        console.log(`  📈 ${member.name}: ${member.subscribers?.toLocaleString() ?? '未設定'} → ${newSubs.toLocaleString()}`);
        member.subscribers = newSubs;
        updatedCount++;
      }
    }
  }

  fs.writeFileSync(MEMBERS_JSON, JSON.stringify(members, null, 2), 'utf-8');
  console.log(`\n✅ 完了！${updatedCount} 件更新 → ${MEMBERS_JSON}`);
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
