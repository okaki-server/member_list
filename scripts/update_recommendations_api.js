/**
 * update_recommendations_api.js
 * YouTube Data API v3 を使って members.json のおすすめ動画 (rec, recTitle) を更新する。
 * チャンネルの「予告編」または「指定の動画」を自動取得します。
 * 使い方: node scripts/update_recommendations_api.js
 * 必要な環境変数: YOUTUBE_API_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

// .env 読み込み
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
  console.error('❌ YOUTUBE_API_KEY が設定されていません。');
  process.exit(1);
}

const MEMBERS_JSON = path.resolve(__dirname, '../members.json');

async function resolveChannelId(url) {
  try {
    const handleMatch = url.match(/youtube\.com\/@([^/?&]+)/);
    if (handleMatch) {
      const handle = handleMatch[1];
      const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${handle}&key=${API_KEY}`;
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (json.items && json.items.length > 0) return json.items[0].id;
    }
    const channelMatch = url.match(/youtube\.com\/channel\/(UC[^/?&]+)/);
    if (channelMatch) return channelMatch[1];
    return null;
  } catch (err) {
    return null;
  }
}

async function fetchChannelBranding(channelIds) {
  const result = new Map();
  const chunks = [];
  for (let i = 0; i < channelIds.length; i += 50) chunks.push(channelIds.slice(i, i + 50));
  
  for (const chunk of chunks) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&id=${chunk.join(',')}&key=${API_KEY}`;
    const res = await fetch(apiUrl);
    const json = await res.json();
    for (const item of (json.items || [])) {
      const featured = item.brandingSettings?.channel?.unsubscribedTrailer || item.brandingSettings?.channel?.featuredVideoId;
      if (featured) result.set(item.id, featured);
    }
  }
  return result;
}

async function fetchVideoTitles(videoIds) {
  const result = new Map();
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) chunks.push(videoIds.slice(i, i + 50));
  
  for (const chunk of chunks) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk.join(',')}&key=${API_KEY}`;
    const res = await fetch(apiUrl);
    const json = await res.json();
    for (const item of (json.items || [])) {
      result.set(item.id, item.snippet.title);
    }
  }
  return result;
}

async function main() {
  const members = JSON.parse(fs.readFileSync(MEMBERS_JSON, 'utf-8'));
  console.log(`🎯 対象メンバー: ${members.length} 名`);

  const nameToId = new Map();
  console.log('🔍 チャンネルID解決中...');
  for (const m of members) {
    const cid = await resolveChannelId(m.youtube);
    if (cid) nameToId.set(m.name, cid);
  }

  const uniqueCids = [...new Set(nameToId.values())];
  console.log('🎬 おすすめ動画IDを取得中...');
  const channelToVideo = await fetchChannelBranding(uniqueCids);

  const uniqueVids = [...new Set(channelToVideo.values())];
  console.log('📝 動画タイトルを取得中...');
  const videoToTitle = await fetchVideoTitles(uniqueVids);

  let updatedCount = 0;
  for (const m of members) {
    const cid = nameToId.get(m.name);
    if (cid && channelToVideo.has(cid)) {
      const vid = channelToVideo.get(cid);
      const title = videoToTitle.get(vid) || 'おすすめ動画';
      
      if (m.rec !== vid || m.recTitle !== title) {
        console.log(`  ✨ ${m.name}: ${title}`);
        m.rec = vid;
        m.recTitle = title;
        updatedCount++;
      }
    }
  }

  fs.writeFileSync(MEMBERS_JSON, JSON.stringify(members, null, 2), 'utf-8');
  console.log(`\n✅ 完了！${updatedCount} 件のおすすめ動画を更新しました。`);
}

main().catch(console.error);
