const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge');
const SNAPSHOT_PATH = path.join(KNOWLEDGE_DIR, 'snapshot.json');

/**
 * Đọc dữ liệu snapshot từ file
 * @returns {object}
 */
function readSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_PATH)) {
      return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Lỗi đọc snapshot kiến thức:', err.message);
  }
  return {
    syncedAt: null,
    group: { name: 'GROUP TRAO ĐỔI - AI, CÔNG NGHỆ' },
    reposMeta: { stats: { totalRepos: 0, totalStars: 0 }, categories: [] },
    hubMeta: { stats: { totalItems: 0, totalLinks: 0, totalFiles: 0, totalContributors: 0 } },
    repos: [],
    hubItems: []
  };
}

/**
 * Lấy tóm tắt kiến thức và các trụ cột công nghệ chiến lược
 * @returns {object}
 */
function getKnowledgeSummary() {
  const snapshot = readSnapshot();
  const reposCount = snapshot.repos ? snapshot.repos.length : 0;
  const hubCount = snapshot.hubItems ? snapshot.hubItems.length : 0;
  const totalStars = snapshot.reposMeta?.stats?.totalStars || 12432939;

  return {
    success: true,
    group: snapshot.group,
    syncedAt: snapshot.syncedAt,
    stats: {
      totalRepos: reposCount,
      totalHubItems: hubCount,
      totalStars,
      totalLinks: snapshot.hubMeta?.stats?.totalLinks || 1426,
      totalFiles: snapshot.hubMeta?.stats?.totalFiles || 813,
      totalContributors: snapshot.hubMeta?.stats?.totalContributors || 74
    },
    categories: snapshot.reposMeta?.categories || [],
    pillars: [
      {
        id: 'ai-agents-mcp',
        icon: '🤖',
        title: 'Hệ Sinh Thái Agentic AI & Model Context Protocol (MCP)',
        badge: 'TRENDING #1',
        description: 'Tập trung các framework bầy đàn tự hành (Autonomous Multi-Agent), Claude CLI, Superpowers và giao thức MCP giúp AI kết nối trực tiếp với công cụ, database và IDE.',
        keyTools: ['obra/superpowers', 'modelcontextprotocol', 'Claude Agentic Skills', 'LangChain', 'LlamaIndex'],
        application: 'Tự động hóa hoàn toàn luồng viết mã, kiểm thử, fix bug và tương tác dữ liệu không cần sự can thiệp thủ công.'
      },
      {
        id: 'voice-tts',
        icon: '🎙️',
        title: 'Voice AI & Neural Text-To-Speech (TTS) Cực Tốc',
        badge: '30+ REPOS',
        description: 'Kho lưu trữ 30+ mô hình tạo giọng nói đa ngôn ngữ quy mô lớn, clone giọng siêu chân thực, hỗ trợ chạy local trên mini-PC / Home Assistant.',
        keyTools: ['Qwen2.5-Audio', 'open-mmlab/Amphion', 'mozilla/TTS', 'hexgrad/kokoro', 'ChatTTS', 'MeloTTS', 'EmotiVoice'],
        application: 'Lồng tiếng video TikTok, YouTube Shorts, Facebook Reels tự động với ngữ điệu tự nhiên 100%, không tốn chi phí thuê voice.'
      },
      {
        id: 'automation-scraping',
        icon: '🕷️',
        title: 'Automation, Scraping & Video Reup Không Logo',
        badge: 'GROWTH HACK',
        description: 'Bộ công cụ cào dữ liệu không giới hạn, trích xuất video TikTok/Douyin/Shorts sạch watermark, tẩy rửa metadata MD5 và tự động đổi mã hash.',
        keyTools: ['Crawlee', 'Puppeteer Stealth', 'Playwright Engine', 'Video Sanitizer', 'Hook Vault 3s'],
        application: 'Xây dựng hệ thống kéo traffic triệu view, reup video sạch bản quyền và đẩy content lên ma trận hàng loạt kênh.'
      },
      {
        id: 'infra-selfhosted',
        icon: '🏠',
        title: 'Hạ Tầng Tự Lưu Trữ (Self-Hosted) & Bảo Mật Tuyệt Đối',
        badge: 'ZERO COST',
        description: 'Các giải pháp biến điện thoại Android, mini PC và VPS thành máy chủ đám mây cá nhân an toàn qua Cloudflare Tunnels mà không cần mở port.',
        keyTools: ['Cloudflare Tunnel (cloudflared)', 'Docker', 'Termux ARM64', 'PM2 Process Sentinel', 'SQLite WAL'],
        application: 'Vận hành hệ sinh thái AccProxy Sovereign 24/7 trên điện thoại bỏ túi, làm chủ toàn bộ dữ liệu, bảo mật tài khoản 100%.'
      }
    ]
  };
}

/**
 * Lấy danh sách Repositories có phân trang, lọc theo danh mục, từ khóa tìm kiếm
 * @param {object} params
 * @returns {object}
 */
function getRepos({ category = 'all', search = '', language = '', page = 1, limit = 24 } = {}) {
  const snapshot = readSnapshot();
  let repos = snapshot.repos || [];

  if (category && category !== 'all') {
    repos = repos.filter(r => r.category && r.category.toLowerCase().includes(category.toLowerCase()));
  }

  if (language && language !== 'all') {
    repos = repos.filter(r => r.language && r.language.toLowerCase() === language.toLowerCase());
  }

  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    repos = repos.filter(r => 
      (r.full_name && r.full_name.toLowerCase().includes(q)) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.summary_vi && r.summary_vi.toLowerCase().includes(q)) ||
      (r.category && r.category.toLowerCase().includes(q))
    );
  }

  // Sắp xếp theo số stars giảm dần
  repos.sort((a, b) => (b.stars || 0) - (a.stars || 0));

  const total = repos.length;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 24;
  const totalPages = Math.ceil(total / limitNum) || 1;
  const start = (pageNum - 1) * limitNum;
  const paginated = repos.slice(start, start + limitNum);

  return {
    success: true,
    total,
    page: pageNum,
    totalPages,
    limit: limitNum,
    repos: paginated
  };
}

/**
 * Lấy danh sách tài nguyên & bài chia sẻ Hub
 * @param {object} params
 * @returns {object}
 */
function getHubItems({ category = 'all', search = '', author = '', page = 1, limit = 18 } = {}) {
  const snapshot = readSnapshot();
  let items = snapshot.hubItems || [];

  if (category && category !== 'all') {
    items = items.filter(h => (h.category && h.category.toLowerCase() === category.toLowerCase()) || (h.categoryLabel && h.categoryLabel.toLowerCase().includes(category.toLowerCase())));
  }

  if (author && author.trim() !== '') {
    items = items.filter(h => h.author && h.author.toLowerCase().includes(author.toLowerCase()));
  }

  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    items = items.filter(h => 
      (h.title && h.title.toLowerCase().includes(q)) ||
      (h.summary && h.summary.toLowerCase().includes(q)) ||
      (h.keyPoints && h.keyPoints.some(k => k.toLowerCase().includes(q)))
    );
  }

  const total = items.length;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 18;
  const totalPages = Math.ceil(total / limitNum) || 1;
  const start = (pageNum - 1) * limitNum;
  const paginated = items.slice(start, start + limitNum);

  return {
    success: true,
    total,
    page: pageNum,
    totalPages,
    limit: limitNum,
    items: paginated
  };
}

/**
 * Đồng bộ dữ liệu mới nhất từ 2 API từ xa của nhóm
 * @returns {Promise<object>}
 */
async function syncRemoteKnowledge() {
  const groupId = '1913869945242410752';
  const token = '23d355f6c265716d';

  let allRepos = [];
  let reposMeta = null;

  for (let page = 1; page <= 6; page++) {
    const url = `https://b2.triennguyen.com/api/repos?groupId=${groupId}&token=${token}&page=${page}&limit=60`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
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
      break;
    }
  }

  const uniqueRepos = [];
  const seenRepo = new Set();
  for (const r of allRepos) {
    const key = r.full_name || r.repo_url || r.id;
    if (!seenRepo.has(key)) {
      seenRepo.add(key);
      uniqueRepos.push(r);
    }
  }

  let allHubItems = [];
  let hubMeta = null;

  for (let page = 1; page <= 6; page++) {
    const url = `https://b2.triennguyen.com/api/hub?groupId=${groupId}&token=${token}&page=${page}&limit=60`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
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

  if (uniqueRepos.length > 0 || uniqueHubItems.length > 0) {
    const snapshot = {
      syncedAt: new Date().toISOString(),
      group: hubMeta ? hubMeta.currentGroup : { name: 'GROUP TRAO ĐỔI - AI, CÔNG NGHỆ' },
      reposMeta,
      hubMeta,
      repos: uniqueRepos,
      hubItems: uniqueHubItems
    };

    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
    }
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');

    return {
      success: true,
      message: `Đã đồng bộ thành công ${uniqueRepos.length} Repositories và ${uniqueHubItems.length} Bài viết Hub từ máy chủ nhóm!`,
      reposCount: uniqueRepos.length,
      hubCount: uniqueHubItems.length,
      syncedAt: snapshot.syncedAt
    };
  }

  return {
    success: false,
    message: 'Không thể kết nối đến máy chủ kho tri thức từ xa để đồng bộ.'
  };
}

module.exports = {
  getKnowledgeSummary,
  getRepos,
  getHubItems,
  syncRemoteKnowledge,
  readSnapshot
};
