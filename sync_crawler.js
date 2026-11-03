const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, 'data', 'knowledge');
if (!fs.existsSync(KNOWLEDGE_DIR)) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

async function syncKnowledge() {
  const groupId = '1913869945242410752';
  const token = '23d355f6c265716d';

  console.log('🔄 Đang đồng bộ Kho Repositories...');
  let allRepos = [];
  let reposMeta = null;

  for (let page = 1; page <= 6; page++) {
    const url = `https://b2.triennguyen.com/api/repos?groupId=${groupId}&token=${token}&page=${page}&limit=60`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await res.json();
      if (!reposMeta) {
        reposMeta = {
          stats: data.stats,
          categories: data.categories,
          currentGroup: data.currentGroup
        };
      }
      if (data.repos && data.repos.length > 0) {
        allRepos = allRepos.concat(data.repos);
      } else {
        break;
      }
    } catch (e) {
      console.error(`Lỗi trang repos ${page}:`, e.message);
      break;
    }
  }

  // Khử trùng lặp repos theo repo_url hoặc id
  const uniqueRepos = [];
  const seenRepo = new Set();
  for (const r of allRepos) {
    const key = r.full_name || r.repo_url || r.id;
    if (!seenRepo.has(key)) {
      seenRepo.add(key);
      uniqueRepos.push(r);
    }
  }

  console.log(`✓ Đã gom được ${uniqueRepos.length} Repositories.`);

  console.log('🔄 Đang đồng bộ Kho Hub (Tài nguyên & Bài viết)...');
  let allHubItems = [];
  let hubMeta = null;

  for (let page = 1; page <= 6; page++) {
    const url = `https://b2.triennguyen.com/api/hub?groupId=${groupId}&token=${token}&page=${page}&limit=60`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await res.json();
      if (!hubMeta) {
        hubMeta = {
          stats: data.stats,
          currentGroup: data.currentGroup
        };
      }
      if (data.items && data.items.length > 0) {
        allHubItems = allHubItems.concat(data.items);
      } else {
        break;
      }
    } catch (e) {
      console.error(`Lỗi trang hub ${page}:`, e.message);
      break;
    }
  }

  const uniqueHubItems = [];
  const seenHub = new Set();
  for (const h of allHubItems) {
    const key = h.id || h.title;
    if (!seenHub.has(key)) {
      seenHub.add(key);
      uniqueHubItems.push(h);
    }
  }

  console.log(`✓ Đã gom được ${uniqueHubItems.length} Bài viết Hub.`);

  const snapshot = {
    syncedAt: new Date().toISOString(),
    group: hubMeta ? hubMeta.currentGroup : { name: 'GROUP TRAO ĐỔI - AI, CÔNG NGHỆ' },
    reposMeta,
    hubMeta,
    repos: uniqueRepos,
    hubItems: uniqueHubItems
  };

  fs.writeFileSync(path.join(KNOWLEDGE_DIR, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  console.log('⭐ Lưu snapshot thành công vào data/knowledge/snapshot.json!');
}

syncKnowledge().catch(console.error);
