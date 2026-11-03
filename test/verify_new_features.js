const assert = require('assert');
const { createDatabaseBackup, listBackups, getDatabaseStats } = require('../src/services/backupService');
const { getKnowledgeSummary, getRepos, getHubItems } = require('../src/services/knowledgeService');

async function testNewFeatures() {
  console.log('================================================================');
  console.log('⚡ KIỂM ĐỊNH TÍNH NĂNG MỚI: SAO LƯU BACKUP & KHO TRI THỨC NHÓM');
  console.log('================================================================');

  // 1. Kiểm tra thống kê DB
  const stats = getDatabaseStats();
  console.log('▶ Test #1: Thu thập thống kê DB...');
  assert(typeof stats.accounts === 'number', 'accounts phải là number');
  assert(typeof stats.users === 'number', 'users phải là number');
  console.log('  [PASS] Thống kê DB:', stats);

  // 2. Kiểm tra tạo snapshot SQLite
  console.log('▶ Test #2: Tạo snapshot SQLite an toàn...');
  const backup = await createDatabaseBackup();
  assert(backup.filename.startsWith('accproxy_backup_'), 'Tên file backup phải đúng định dạng');
  assert(backup.size > 0, 'Dung lượng backup phải lớn hơn 0');
  assert(backup.sha256.length === 64, 'SHA256 phải là 64 ký tự hex');
  console.log(`  [PASS] Backup snapshot: ${backup.filename} (${backup.sizeFormatted}), SHA256: ${backup.sha256.substring(0, 16)}...`);

  // 3. Kiểm tra danh sách backup
  console.log('▶ Test #3: Lấy danh sách lịch sử backup...');
  const history = listBackups();
  assert(history.length >= 1, 'Lịch sử backup phải có ít nhất 1 file');
  console.log(`  [PASS] Số lượng backup trong kho: ${history.length} file`);

  // 4. Kiểm tra Knowledge Summary
  console.log('▶ Test #4: Đọc Knowledge Summary...');
  const summary = getKnowledgeSummary();
  assert(summary.success === true, 'Summary phải success');
  assert(summary.stats.totalRepos >= 300, 'Repos phải >= 300');
  assert(summary.pillars.length >= 5, 'Phải có ít nhất 5 trụ cột công nghệ');
  console.log(`  [PASS] Knowledge Summary: ${summary.stats.totalRepos} repos, ${summary.stats.totalHubItems} hub items, ${summary.pillars.length} trụ cột chiến lược`);

  // 5. Kiểm tra Repos Query & Filtering
  console.log('▶ Test #5: Truy vấn Repositories & Bộ lọc...');
  const reposResult = getRepos({ limit: 10 });
  assert(reposResult.success === true, 'getRepos phải success');
  assert(reposResult.repos.length === 10, 'Phải trả về 10 repos');
  console.log(`  [PASS] Top repo #1: ${reposResult.repos[0].full_name} (${reposResult.repos[0].stars} stars)`);

  // 6. Kiểm tra Hub Items Query
  console.log('▶ Test #6: Truy vấn Hub Items...');
  const hubResult = getHubItems({ limit: 10 });
  assert(hubResult.success === true, 'getHubItems phải success');
  assert(hubResult.items.length === 10, 'Phải trả về 10 hub items');
  console.log(`  [PASS] Hub item #1: "${hubResult.items[0].title.substring(0, 50)}..."`);

  console.log('================================================================');
  console.log('⭐ TẤT CẢ 6/6 TEST TÍNH NĂNG MỚI ĐẠT CHUẨN XANH MƯỢT (100% PASS)');
  console.log('================================================================');
}

testNewFeatures().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
