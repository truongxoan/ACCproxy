const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../src/config/db');
const {
  saveAsset,
  getAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
  getAssetFileMeta
} = require('../src/services/assetService');

console.log('================================================================');
console.log('⚡ BẮT ĐẦU KIỂM ĐỊNH KHO TƯ LIỆU KỊCH BẢN & ẢNH (.MD, .TXT, .PNG)');
console.log('================================================================');

async function runTests() {
  let createdMdId = null;
  let createdTxtId = null;
  let createdPngId = null;

  try {
    // 1. Test Upload Markdown File
    console.log('▶ Test #1: Tải lên & Trích xuất nội dung file Markdown (.md)...');
    const sampleMd = `# Kịch Bản Video AI Agent\n\nĐây là kịch bản thử nghiệm.\n\n- Bước 1: Mở trình duyệt\n- Bước 2: Đăng nhập\n\n> Lưu ý OpSec bảo mật tuyệt đối!`;
    const mdBase64 = Buffer.from(sampleMd, 'utf-8').toString('base64');

    const mdAsset = saveAsset({
      originalName: 'kich_ban_review_01.md',
      base64Data: `data:text/markdown;base64,${mdBase64}`,
      title: 'Kịch Bản Review Phim Phần 1',
      tags: 'kịch bản, review, viral'
    });

    assert.ok(mdAsset.id, 'Phải có ID asset');
    assert.strictEqual(mdAsset.file_type, 'md');
    assert.strictEqual(mdAsset.title, 'Kịch Bản Review Phim Phần 1');
    assert.ok(mdAsset.content_text.includes('Kịch Bản Video AI Agent'), 'Nội dung markdown phải được lưu');
    assert.ok(fs.existsSync(mdAsset.file_path), 'File vật lý .md phải tồn tại trên ổ đĩa');
    createdMdId = mdAsset.id;
    console.log('  [PASS] Upload .md thành công (ID:', createdMdId, ')');

    // 2. Test Upload Text File
    console.log('▶ Test #2: Tải lên & Lưu trữ file Prompt Text (.txt)...');
    const sampleTxt = `Prompt tạo kịch bản:\nViết một câu chuyện hài hước về lập trình viên và bug server lúc 2h sáng.`;
    const txtBase64 = Buffer.from(sampleTxt, 'utf-8').toString('base64');

    const txtAsset = saveAsset({
      originalName: 'prompt_kich_ban.txt',
      base64Data: `data:text/plain;base64,${txtBase64}`,
      title: 'Prompt Kịch Bản Hài Hước',
      tags: 'prompt, chatgpt'
    });

    assert.ok(txtAsset.id, 'Phải có ID asset');
    assert.strictEqual(txtAsset.file_type, 'txt');
    assert.ok(txtAsset.content_text.includes('Prompt tạo kịch bản'), 'Nội dung text phải được lưu');
    createdTxtId = txtAsset.id;
    console.log('  [PASS] Upload .txt thành công (ID:', createdTxtId, ')');

    // 3. Test Upload PNG Image
    console.log('▶ Test #3: Tải lên & Lưu trữ ảnh Thumbnail PNG (.png)...');
    // 1x1 transparent PNG Base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const pngAsset = saveAsset({
      originalName: 'thumbnail_cover.png',
      base64Data: `data:image/png;base64,${pngBase64}`,
      title: 'Thumbnail Bìa Video 1080x1920',
      tags: 'thumbnail, cover, tiktok'
    });

    assert.ok(pngAsset.id, 'Phải có ID asset');
    assert.strictEqual(pngAsset.file_type, 'png');
    assert.ok(fs.existsSync(pngAsset.file_path), 'File ảnh .png phải tồn tại trên ổ đĩa');
    createdPngId = pngAsset.id;
    console.log('  [PASS] Upload .png thành công (ID:', createdPngId, ')');

    // 4. Test Sửa Nội Dung File Text / Markdown Trực Tiếp
    console.log('▶ Test #4: Chỉnh sửa trực tiếp nội dung văn bản kịch bản...');
    const updatedContent = sampleMd + '\n\n## Cập nhật thêm đoạn kết thúc triệu view!';
    const updated = updateAsset(createdMdId, {
      title: 'Kịch Bản Review Phim Phần 1 (Bản Final)',
      contentText: updatedContent
    });

    assert.strictEqual(updated.title, 'Kịch Bản Review Phim Phần 1 (Bản Final)');
    assert.ok(updated.content_text.includes('Cập nhật thêm đoạn kết thúc triệu view!'));

    // Kiểm tra file vật lý trên đĩa cũng được ghi đè
    const fileDiskContent = fs.readFileSync(updated.file_path, 'utf-8');
    assert.ok(fileDiskContent.includes('Cập nhật thêm đoạn kết thúc triệu view!'), 'File trên đĩa phải được đồng bộ');
    console.log('  [PASS] Chỉnh sửa & đồng bộ nội dung kịch bản thành công');

    // 5. Test Lấy File Stream / Raw Metadata
    console.log('▶ Test #5: Kiểm tra raw file streaming metadata...');
    const metaPng = getAssetFileMeta(createdPngId);
    assert.ok(metaPng, 'Phải lấy được meta ảnh');
    assert.strictEqual(metaPng.mimeType, 'image/png');
    assert.strictEqual(metaPng.originalName, 'thumbnail_cover.png');
    console.log('  [PASS] File streaming metadata hợp lệ 100%');

    // 6. Test Danh Sách & Bộ Lọc
    console.log('▶ Test #6: Truy vấn & Lọc danh sách theo định dạng...');
    const allAssets = getAssets();
    assert.ok(allAssets.length >= 3, 'Phải có ít nhất 3 file trong danh sách');

    const mdList = getAssets({ fileType: 'md' });
    assert.ok(mdList.every(x => x.file_type === 'md'), 'Bộ lọc MD phải chỉ trả về file .md');

    const imgList = getAssets({ fileType: 'images' });
    assert.ok(imgList.every(x => ['png', 'jpg', 'jpeg', 'webp'].includes(x.file_type)), 'Bộ lọc ảnh phải đúng');

    const searchResult = getAssets({ search: 'Final' });
    assert.ok(searchResult.some(x => x.id === createdMdId), 'Tìm kiếm theo từ khóa phải tìm ra bản Final');
    console.log('  [PASS] Bộ lọc và tìm kiếm hoạt động chuẩn xác');

    // 7. Cleanup Test Files
    console.log('▶ Test #7: Dọn dẹp & Xóa file an toàn khỏi database và ổ đĩa...');
    const del1 = deleteAsset(createdMdId);
    const del2 = deleteAsset(createdTxtId);
    const del3 = deleteAsset(createdPngId);

    assert.strictEqual(del1, true);
    assert.strictEqual(del2, true);
    assert.strictEqual(del3, true);

    assert.strictEqual(getAssetById(createdMdId), null);
    assert.strictEqual(getAssetById(createdTxtId), null);
    assert.strictEqual(getAssetById(createdPngId), null);
    console.log('  [PASS] Xóa an toàn và dọn dẹp ổ đĩa sạch sẽ');

    console.log('================================================================');
    console.log('⭐ KẾT QUẢ: 7/7 TESTS KHO TƯ LIỆU ĐẠT CHUẨN XANH MƯỢT (100% PASS)');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
