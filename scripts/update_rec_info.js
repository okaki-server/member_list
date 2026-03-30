/**
 * update_rec_info.js
 * members.json の recommendUrl から動画/プレイリスト情報を取得し、
 * rec (ID) と recTitle (タイトル) を自動更新する。
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

async function fetchVideoInfo(videoId) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.items && json.items.length > 0) {
    return {
      title: json.items[0].snippet.title,
      thumbId: videoId
    };
  }
  return null;
}

async function fetchPlaylistInfo(playlistId) {
  // プレイリスト本体の情報（タイトル）を取得
  const pUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${API_KEY}`;
  const pRes = await fetch(pUrl);
  const pJson = await pRes.json();
  
  if (!pJson.items || pJson.items.length === 0) return null;
  const playlistTitle = pJson.items[0].snippet.title;

  // サムネイル用に最初の動画IDを取得
  const iUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=1&key=${API_KEY}`;
  const iRes = await fetch(iUrl);
  const iJson = await iRes.json();
  const thumbId = (iJson.items && iJson.items.length > 0) 
    ? iJson.items[0].snippet.resourceId.videoId 
    : null;

  return {
    title: playlistTitle,
    thumbId: thumbId
  };
}

async function main() {
  const members = JSON.parse(fs.readFileSync(MEMBERS_JSON, 'utf-8'));
  let updated = false;

  for (const member of members) {
    if (!member.recommendUrl) continue;

    console.log(`🔍 Checking ${member.name}: ${member.recommendUrl}`);
    
    // Playlist 判定
    const plMatch = member.recommendUrl.match(/[&?]list=([^&]+)/);
    const vMatch  = member.recommendUrl.match(/(?:v=|shorts\/|youtu\.be\/)([^&?/]+)/);

    if (plMatch) {
      const plId = plMatch[1];
      const info = await fetchPlaylistInfo(plId);
      if (info) {
        member.rec = `list:${plId}:${info.thumbId}`;
        member.recTitle = info.title;
        console.log(`  ✅ Playlist: ${info.title}`);
        updated = true;
      }
    } else if (vMatch) {
      const vId = vMatch[1];
      const info = await fetchVideoInfo(vId);
      if (info) {
        member.rec = vId;
        member.recTitle = info.title;
        console.log(`  ✅ Video: ${info.title}`);
        updated = true;
      }
    }
  }

  if (updated) {
    fs.writeFileSync(MEMBERS_JSON, JSON.stringify(members, null, 2), 'utf-8');
    console.log(`\n✨ members.json を更新しました。`);
  } else {
    console.log(`\n💡 更新が必要なデータはありませんでした。`);
  }
}

main().catch(console.error);
