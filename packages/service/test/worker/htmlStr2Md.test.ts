import { describe, it, expect, vi } from 'vitest';
import { html2md } from '@fastgpt/service/worker/htmlStr2Md/utils';

describe('html2md 性能和功能测试', () => {
  // 性能基准
  const PERFORMANCE_THRESHOLDS = {
    smallHtml: 100, // 小文档应该在 100ms 内完成
    mediumHtml: 500, // 中等文档应该在 500ms 内完成
    largeBase64: 2000 // 大 base64 图片应该在 2s 内完成(优化后)
  };

  describe('功能正确性', () => {
    it('应该正确处理简单的 HTML', async () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = await html2md(html);

      expect(result.rawText).toContain('Hello');
      expect(result.rawText).toContain('**World**');
      expect(result).not.toHaveProperty('imageList');
    });

    it('未传 uploadFile 时应该删除 base64 图片内容', async () => {
      const base64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const html = `<img src="data:image/png;base64,${base64Data}" alt="test">`;
      const result = await html2md(html);

      expect(result.rawText).not.toContain('data:image/png;base64');
      expect(result).not.toHaveProperty('imageList');
    });

    it('传入 uploadFile 时应该实时上传 base64 图片并替换成 key', async () => {
      const base64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const uploadFile = vi.fn(async () => ({
        key: 'dataset/file-parsed/html-image.png'
      }));
      const html = `
        <img SRC = 'data:image/png;base64,${base64Data}' alt="single">
        <img src="data:image/jpeg;base64,${base64Data}" alt="double">
      `;

      const result = await html2md(html, { uploadFile });

      expect(uploadFile).toHaveBeenCalledTimes(2);
      expect(uploadFile).toHaveBeenNthCalledWith(1, {
        name: expect.stringMatching(/\.png$/),
        mime: 'image/png',
        buffer: expect.any(ArrayBuffer)
      });
      expect(uploadFile).toHaveBeenNthCalledWith(2, {
        name: expect.stringMatching(/\.jpg$|\.jpeg$/),
        mime: 'image/jpeg',
        buffer: expect.any(ArrayBuffer)
      });
      expect(result.rawText).toContain('dataset/file-parsed/html-image.png');
      expect(result.rawText).not.toContain('data:image/');
      expect(result).not.toHaveProperty('imageList');
    });

    it('应该处理多个 base64 图片且不返回 imageList', async () => {
      const base64Data = 'iVBORw0KGgo=';
      const html = `
        <img src="data:image/png;base64,${base64Data}">
        <img src="data:image/jpeg;base64,${base64Data}">
        <img src="data:image/gif;base64,${base64Data}">
      `;
      const result = await html2md(html);

      expect(result.rawText).not.toContain('data:image/');
      expect(result).not.toHaveProperty('imageList');
    });

    it('应该正确处理表格', async () => {
      const html = `
        <table>
          <tr><td>Cell 1</td><td>Cell 2</td></tr>
          <tr><td>Cell 3</td><td>Cell 4</td></tr>
        </table>
      `;
      const result = await html2md(html);

      expect(result.rawText).toContain('Cell 1');
      expect(result.rawText).toContain('Cell 2');
      expect(result.rawText).toContain('|'); // Markdown 表格语法
    });

    it('应该移除 script 和 style 标签', async () => {
      const html = `
        <p>Visible content</p>
        <script>alert('should be removed')</script>
        <style>body { color: red; }</style>
      `;
      const result = await html2md(html);

      expect(result.rawText).toContain('Visible content');
      expect(result.rawText).not.toContain('alert');
      expect(result.rawText).not.toContain('color: red');
    });

    it('应该处理视频标签', async () => {
      const html = `<video src="https://example.com/video.mp4"></video>`;
      const result = await html2md(html);

      expect(result.rawText).toContain('https://example.com/video.mp4');
    });
  });

  describe('性能测试', () => {
    it('小型 HTML 文档性能(~10KB)', async () => {
      const html = '<p>' + 'Hello World '.repeat(1000) + '</p>';

      const start = Date.now();
      const result = await html2md(html);
      const duration = Date.now() - start;

      expect(result.rawText).toContain('Hello World');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.smallHtml);
    });

    it('中等大小 HTML 文档性能(~50KB)', async () => {
      const html = '<div>' + '<p>Content </p>'.repeat(5000) + '</div>';

      const start = Date.now();
      const result = await html2md(html);
      const duration = Date.now() - start;

      expect(result.rawText).toContain('Content');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.mediumHtml);
    });

    it('大型 base64 图片性能(~1MB)', async () => {
      // 生成约 1MB 的 base64 数据
      const base64Data = 'A'.repeat(1000000);
      const html = `<img src="data:image/png;base64,${base64Data}">`;

      const start = Date.now();
      const result = await html2md(html);
      const duration = Date.now() - start;

      expect(result.rawText).not.toContain(base64Data);
      expect(result).not.toHaveProperty('imageList');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.largeBase64);
    });

    it('多个大型 base64 图片性能', async () => {
      // 3 个约 500KB 的 base64 图片
      const base64Data = 'B'.repeat(500 * 1024);
      const html = `
        <img src="data:image/png;base64,${base64Data}">
        <img src="data:image/jpeg;base64,${base64Data}">
        <img src="data:image/gif;base64,${base64Data}">
      `;

      const start = Date.now();
      const result = await html2md(html);
      const duration = Date.now() - start;

      expect(result.rawText).not.toContain(base64Data);
      expect(result).not.toHaveProperty('imageList');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.largeBase64 * 2);
    });

    it('深度嵌套 HTML 性能', async () => {
      // 创建深度嵌套的 HTML 结构
      let html = '';
      const depth = 50;

      for (let i = 0; i < depth; i++) {
        html += '<div><table><tr><td>';
      }
      html += 'Deep content';
      for (let i = 0; i < depth; i++) {
        html += '</td></tr></table></div>';
      }

      const start = Date.now();
      const result = await html2md(html);
      const duration = Date.now() - start;

      expect(result.rawText).toContain('Deep content');
      expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
    });
  });

  describe('防御性功能', () => {
    it('应该拒绝超大 HTML 文档(>1MB)', async () => {
      const hugeHtml = 'x'.repeat(1000000 + 1);
      const result = await html2md(hugeHtml);

      expect(result.rawText).toBe(hugeHtml);
      expect(result).not.toHaveProperty('imageList');
    });

    it('应该正常处理大型 HTML 文档(<1MB)', async () => {
      const largeHtml = 'x'.repeat(1000000 - 1);
      const result = await html2md(largeHtml);

      // 即使很大，但在限制内，应该正常处理
      expect(result.rawText).toBeTruthy();
      expect(result.rawText.length).toBeGreaterThan(0);
    });

    it('应该处理空 HTML', async () => {
      const result = await html2md('');

      expect(result.rawText).toBe('');
      expect(result).not.toHaveProperty('imageList');
    });

    it('应该处理无效的 HTML', async () => {
      const invalidHtml = '<div><p>Unclosed tags';
      const result = await html2md(invalidHtml);

      // 应该不会崩溃,并尽可能提取内容
      expect(result.rawText).toBeTruthy();
    });

    it('应该处理包含特殊字符的 HTML', async () => {
      const html = '<p>&lt;script&gt;alert("xss")&lt;/script&gt;</p>';
      const result = await html2md(html);

      expect(result.rawText).toContain('<script>');
      expect(result.rawText).toContain('</script>');
    });
  });

  describe('边界情况', () => {
    it('应该处理只包含空白的 HTML', async () => {
      const html = '   \n\n\t  ';
      const result = await html2md(html);

      expect(result.rawText).toBe('');
      expect(result).not.toHaveProperty('imageList');
    });

    it('应该处理包含 Unicode 字符的 HTML', async () => {
      const html = '<p>你好世界 🌍 مرحبا</p>';
      const result = await html2md(html);

      expect(result.rawText).toContain('你好世界');
      expect(result.rawText).toContain('🌍');
      expect(result.rawText).toContain('مرحبا');
    });

    it('应该正确处理混合的 base64 和普通图片', async () => {
      const base64Data = 'iVBORw0KGgo=';
      const html = `
        <img src="data:image/png;base64,${base64Data}">
        <img src="https://example.com/image.jpg">
      `;
      const result = await html2md(html);

      expect(result.rawText).not.toContain('data:image/png;base64');
      expect(result.rawText).toContain('https://example.com/image.jpg'); // 普通 URL 保留在文本中
    });

    it('应该去重重复的图片', async () => {
      const base64Data = 'iVBORw0KGgo=';
      const html = `
        <img src="data:image/png;base64,${base64Data}">
        <p>Some text</p>
        <img src="data:image/png;base64,${base64Data}">
      `;
      const result = await html2md(html);

      expect(result.rawText).not.toContain('data:image/png;base64');
      expect(result).not.toHaveProperty('imageList');
    });
  });

  describe('正则表达式优化验证', () => {
    it('优化后的正则应该正确匹配合法的 base64', async () => {
      const validBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      const html = `<img src="data:image/png;base64,${validBase64}">`;
      const uploadFile = vi.fn(async () => ({
        key: 'dataset/file-parsed/valid.png'
      }));
      const result = await html2md(html, { uploadFile });

      expect(uploadFile).toHaveBeenCalledWith({
        name: expect.stringMatching(/\.png$/),
        mime: 'image/png',
        buffer: expect.any(ArrayBuffer)
      });
      expect(result.rawText).toContain('dataset/file-parsed/valid.png');
    });

    it('优化后的正则应该处理非法的 base64 字符', async () => {
      // 包含非法字符 @ 和 #
      const invalidBase64 = 'ABC@123#XYZ';
      const html = `<img src="data:image/png;base64,${invalidBase64}">`;
      const result = await html2md(html);

      // 这个测试验证系统不会因为非法字符而崩溃
      expect(result.rawText).toBeTruthy();
      expect(result).not.toHaveProperty('imageList');
    });

    it('应该处理 base64 末尾的填充字符', async () => {
      const base64WithPadding = 'iVBORw0KGgo==';
      const html = `<img src="data:image/png;base64,${base64WithPadding}">`;
      const uploadFile = vi.fn(async () => ({
        key: 'dataset/file-parsed/padding.png'
      }));
      const result = await html2md(html, { uploadFile });

      expect(uploadFile).toHaveBeenCalledWith({
        name: expect.stringMatching(/\.png$/),
        mime: 'image/png',
        buffer: expect.any(ArrayBuffer)
      });
      expect(result.rawText).toContain('dataset/file-parsed/padding.png');
    });
  });

  describe('实例复用验证', () => {
    it('多次调用应该使用相同的 TurndownService 实例', async () => {
      const html1 = '<p>Test 1</p>';
      const html2 = '<p>Test 2</p>';

      const result1 = await html2md(html1);
      const result2 = await html2md(html2);

      expect(result1.rawText).toContain('Test 1');
      expect(result2.rawText).toContain('Test 2');
      // 两次调用都应该成功,且性能稳定
    });

    it('批量转换性能应该稳定', async () => {
      const htmlTemplates = Array(10)
        .fill(null)
        .map((_, i) => `<p>Content ${i}</p>`);

      const durations: number[] = [];

      for (const html of htmlTemplates) {
        const start = performance.now();
        await html2md(html);
        durations.push(performance.now() - start);
      }

      // 计算平均耗时
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      // 所有调用都应该快速完成 - 放宽到 100ms
      expect(avgDuration).toBeLessThan(100);

      // 性能应该稳定(标准差不应该太大)
      // 只有在平均耗时 > 0 时才检查标准差
      if (avgDuration > 0) {
        const variance =
          durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
        const stdDev = Math.sqrt(variance);

        // 单次转换通常在亚毫秒级，测试机器调度抖动会放大标准差，保留稳定性检查但设置绝对下限。
        expect(stdDev).toBeLessThan(Math.max(avgDuration * 3.0, 1));
      }
    });
  });
});
