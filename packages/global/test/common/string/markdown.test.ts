import { describe, it, expect, vi } from 'vitest';
import {
  simpleMarkdownText,
  htmlTable2Md,
  parseMarkdownBase64Images
} from '@fastgpt/global/common/string/markdown';

describe('markdown 字符串处理函数测试', () => {
  describe('simpleMarkdownText', () => {
    it('应该移除链接中的换行符', () => {
      const input = '[Hello\nWorld](https://example.com)';
      const result = simpleMarkdownText(input);

      expect(result).toBe('[Hello World](https://example.com)');
    });

    it('应该处理空 URL 的链接', () => {
      const input = '[Text]()';
      const result = simpleMarkdownText(input);

      // 实际行为: () 不匹配 (.+?),所以链接会被保留
      expect(result).toBe('[Text]()');
    });

    it('应该移除转义的特殊字符', () => {
      const input = '\\# \\* \\( \\) \\[ \\]';
      const result = simpleMarkdownText(input);

      expect(result).toBe('# * ( ) [ ]');
    });

    it('应该替换双反斜杠换行符', () => {
      const input = 'Line1\\\\nLine2';
      const result = simpleMarkdownText(input);

      expect(result).toBe('Line1\\nLine2');
    });

    it('应该移除标题前的空格', () => {
      const input = '\n  # Heading\n  ## Subheading';
      const result = simpleMarkdownText(input);

      expect(result).toBe('# Heading\n## Subheading');
    });

    it('应该移除代码块前的空格', () => {
      const input = '\n  ```javascript\n  code\n  ```';
      const result = simpleMarkdownText(input);

      expect(result).toContain('```javascript');
    });

    it('应该 trim 前后空白', () => {
      const input = '  \n  content  \n  ';
      const result = simpleMarkdownText(input);

      expect(result).not.toMatch(/^\s/);
      expect(result).not.toMatch(/\s$/);
    });

    it('应该处理空字符串', () => {
      const result = simpleMarkdownText('');

      expect(result).toBe('');
    });

    it('应该处理纯空白字符串', () => {
      const result = simpleMarkdownText('   \n\n\t  ');

      // simpleText 不会移除所有空白,只是 trim
      expect(result).toBe('');
    });
  });

  describe('htmlTable2Md', () => {
    it('应该将简单的 HTML 表格转换为 Markdown', () => {
      const html = `
        <p>Before</p>
        <table>
          <tr><td>A</td><td>B</td></tr>
          <tr><td>C</td><td>D</td></tr>
        </table>
        <p>After</p>
      `;
      const result = htmlTable2Md(html);

      expect(result).toContain('| A | B |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| C | D |');
      expect(result).toContain('<p>Before</p>');
      expect(result).toContain('<p>After</p>');
    });

    it('应该处理带 colspan 的表格', () => {
      const html = `
        <table>
          <tr><td colspan="2">Header</td></tr>
          <tr><td>A</td><td>B</td></tr>
        </table>
      `;
      const result = htmlTable2Md(html);

      expect(result).toContain('| Header |');
      expect(result).toContain('| A | B |');
    });

    it('应该处理带 rowspan 的表格', () => {
      const html = `
        <table>
          <tr><td rowspan="2">A</td><td>B</td></tr>
          <tr><td>C</td></tr>
        </table>
      `;
      const result = htmlTable2Md(html);

      expect(result).toContain('| A | B |');
      expect(result).toContain('| C |'); // rowspan 的后续行用空格填充
    });

    it('应该处理空单元格', () => {
      const html = `
        <table>
          <tr><td>A</td><td/><td>C</td></tr>
        </table>
      `;
      const result = htmlTable2Md(html);

      expect(result).toContain('| A |');
      expect(result).toContain('| C |');
    });

    it('应该处理不规则的表格', () => {
      const html = `
        <table>
          <tr><td>A</td><td>B</td><td>C</td></tr>
          <tr><td>D</td></tr>
        </table>
      `;
      const result = htmlTable2Md(html);

      expect(result).toContain('| A | B | C |');
      expect(result).toContain('| D |'); // 自动填充空列
    });

    it('应该处理无效的表格 HTML', () => {
      const invalidHtml = '<table><tr>invalid</tr></table>';
      const result = htmlTable2Md(invalidHtml);

      // 无效 HTML 可能返回空表格或原样
      expect(result).toBeTruthy();
    });

    it('应该处理不包含表格的内容', () => {
      const html = '<p>No tables here</p>';
      const result = htmlTable2Md(html);

      expect(result).toBe(html);
    });

    it('应该处理多个表格', () => {
      const html = `
        <table><tr><td>Table 1</td></tr></table>
        <p>Text</p>
        <table><tr><td>Table 2</td></tr></table>
      `;
      const result = htmlTable2Md(html);

      expect(result).toContain('| Table 1 |');
      expect(result).toContain('| Table 2 |');
      expect(result).toContain('<p>Text</p>');
    });

    it('应该处理包含特殊字符的单元格', () => {
      const html = `
        <table>
          <tr><td>A &amp; B</td><td>C &lt; D</td></tr>
        </table>
      `;
      const result = htmlTable2Md(html);

      expect(result).toContain('A &amp; B');
      expect(result).toContain('C &lt; D');
    });
  });

  describe('parseMarkdownBase64Images', () => {
    it('应该在没有 uploadImgController 时移除 base64 图片', async () => {
      const rawText = '![image](data:image/png;base64,ABC123)';
      const result = await parseMarkdownBase64Images(rawText);

      expect(result).toBe('');
    });

    it('应该上传 base64 图片并替换 URL', async () => {
      const base64Img = 'data:image/png;base64,iVBORw0KGgo=';
      const rawText = `![test](${base64Img})`;
      const uploadedUrl = 'https://cdn.example.com/image.png';

      const mockUpload = vi.fn().mockResolvedValue({ key: uploadedUrl });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      expect(mockUpload).toHaveBeenCalledWith(base64Img);
      expect(result).toBe(`![test](${uploadedUrl})`);
    });

    it('应该处理多个 base64 图片', async () => {
      const base64Img1 = 'data:image/png;base64,ABC=';
      const base64Img2 = 'data:image/jpeg;base64,DEF=';
      const rawText = `![img1](${base64Img1})\n![img2](${base64Img2})`;

      const mockUpload = vi
        .fn()
        .mockResolvedValueOnce({ key: 'https://cdn.example.com/img1.png' })
        .mockResolvedValueOnce({ key: 'https://cdn.example.com/img2.jpg' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      // 按匹配顺序逐张上传所有 markdown base64 图片
      expect(mockUpload).toHaveBeenCalled();
      expect(result).toContain('https://cdn.example.com/img1.png');
      expect(result).toContain('https://cdn.example.com/img2.jpg');
    });

    it('应该处理上传失败的情况', async () => {
      const base64Img = 'data:image/png;base64,ERROR=';
      const rawText = `![test](${base64Img})`;

      const mockUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      // 上传失败时应该移除图片
      expect(result).not.toContain(base64Img);
    });

    it('应该处理部分上传失败', async () => {
      const base64Img1 = 'data:image/png;base64,OK=';
      const base64Img2 = 'data:image/jpeg;base64,FAIL=';
      const rawText = `![img1](${base64Img1})\n![img2](${base64Img2})`;

      const mockUpload = vi
        .fn()
        .mockResolvedValueOnce({ key: 'https://cdn.example.com/img1.png' })
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      expect(result).toContain('https://cdn.example.com/img1.png');
      expect(result).not.toContain(base64Img2);
    });

    it('应该处理嵌入在文本中的 base64 图片', async () => {
      const base64Img = 'data:image/png;base64,EMBEDDED=';
      const rawText = `
        # Header
        Some text before
        ![image](${base64Img})
        Some text after
        ## Footer
      `;

      const mockUpload = vi.fn().mockResolvedValue({ key: 'https://cdn.example.com/image.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      expect(result).toContain('# Header');
      expect(result).toContain('Some text before');
      expect(result).toContain('https://cdn.example.com/image.png');
      expect(result).toContain('Some text after');
      expect(result).toContain('## Footer');
    });
  });

  describe('parseMarkdownBase64Images markdown 清理', () => {
    it('应该处理不带上传控制器的 Markdown', async () => {
      const rawText = '# Title\n\nSome text\n\n';
      const result = await parseMarkdownBase64Images(rawText);

      expect(result).toContain('# Title');
      expect(result).toContain('Some text');
    });

    it('应该上传 base64 图片并简化文本', async () => {
      const base64Img = 'data:image/png;base64,TEST=';
      const rawText = `# Title\n\n![image](${base64Img})\n\nMore text`;

      const mockUpload = vi.fn().mockResolvedValue({ key: 'https://cdn.example.com/image.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      expect(result).toContain('# Title');
      expect(result).toContain('https://cdn.example.com/image.png');
      expect(result).not.toContain(base64Img);
    });

    it('应该移除多余的转义字符', async () => {
      const rawText = '\\# Title\n\\* Item 1\n\\* Item 2';
      const result = await parseMarkdownBase64Images(rawText);

      expect(result).toContain('# Title');
      expect(result).toContain('* Item 1');
      expect(result).toContain('* Item 2');
    });

    it('应该处理空文本', async () => {
      const result = await parseMarkdownBase64Images('');

      expect(result).toBe('');
    });

    it('应该处理复杂的 Markdown 结构', async () => {
      const base64Img = 'data:image/png;base64,COMPLEX=';
      const rawText = `
        \\# Heading

        [Link](https://example.com)

        ![image](${base64Img})

        \`\`\`javascript
        code here
        \`\`\`
      `;

      const mockUpload = vi.fn().mockResolvedValue({ key: 'https://cdn.example.com/img.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      expect(result).toContain('# Heading');
      expect(result).toContain('[Link](https://example.com)');
      expect(result).toContain('https://cdn.example.com/img.png');
      expect(result).toContain('```javascript');
    });
  });

  describe('parseMarkdownBase64Images', () => {
    it('应该在没有上传回调时删除 markdown base64 图片', async () => {
      const base64Data = 'ABC123==';
      const text = `before ![alt](data:image/png;base64,${base64Data}) after`;
      const result = await parseMarkdownBase64Images(text);

      expect(result).toBe('before  after');
      expect(result).not.toContain('data:image/png;base64');
    });

    it('应该在传入上传回调时逐张替换为 image key', async () => {
      const base64Data = 'ABC123==';
      const text = `![alt](data:image/png;base64,${base64Data})`;
      const upload = vi.fn().mockResolvedValue({ key: 'dataset/file-parsed/image.png' });

      const result = await parseMarkdownBase64Images(text, {
        controller: upload
      });

      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          altText: 'alt',
          dataUrl: `data:image/png;base64,${base64Data}`,
          mime: 'image/png',
          base64: base64Data
        })
      );
      expect(result).toBe('![alt](dataset/file-parsed/image.png)');
    });

    it('应该保留普通 URL 图片和普通文本', async () => {
      const base64Data = 'BASE64==';
      const text = `# Title\n![base64](data:image/png;base64,${base64Data})\n![url](https://example.com/image.jpg)`;
      const result = await parseMarkdownBase64Images(text);

      expect(result).toContain('# Title');
      expect(result).toContain('![url](https://example.com/image.jpg)');
      expect(result).not.toContain('data:image/png');
    });

    it('上传失败时应该移除失败图片并继续处理后续图片', async () => {
      const text = [
        '![img1](data:image/png;base64,OK=)',
        'middle',
        '![img2](data:image/jpeg;base64,FAIL=)'
      ].join('\n');
      const upload = vi
        .fn()
        .mockResolvedValueOnce({ key: 'dataset/file-parsed/image.png' })
        .mockRejectedValueOnce(new Error('upload failed'));

      const result = await parseMarkdownBase64Images(text, {
        controller: upload
      });

      expect(result).toContain('![img1](dataset/file-parsed/image.png)');
      expect(result).toContain('middle');
      expect(result).not.toContain('data:image/jpeg');
    });

    it('并发上传完成顺序不一致时应该保留原始图片顺序', async () => {
      const text = [
        'start',
        '![img1](data:image/png;base64,ONE=)',
        'middle',
        '![img2](data:image/png;base64,TWO=)',
        'end'
      ].join('\n');
      const upload = vi.fn(async (image) => {
        if (image.type === 'base64' && image.base64 === 'ONE=') {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { key: 'key-1' };
        }

        return { key: 'key-2' };
      });

      const result = await parseMarkdownBase64Images(text, {
        controller: upload
      });

      expect(result).toBe(
        ['start', '![img1](key-1)', 'middle', '![img2](key-2)', 'end'].join('\n')
      );
    });

    it('parseHttp 开启时应该转存普通 http 图片', async () => {
      const text = 'hello ![img](https://img.example.com/a.png)';
      const upload = vi.fn().mockResolvedValue({ key: 'dataset/file-parsed/a.png' });

      const result = await parseMarkdownBase64Images(text, {
        parseHttp: true,
        controller: upload
      });

      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'http',
          altText: 'img',
          url: 'https://img.example.com/a.png'
        })
      );
      expect(result).toBe('hello ![img](dataset/file-parsed/a.png)');
    });

    it('parseHttp 开启时应该正确处理 URL 中的括号', async () => {
      const text = 'hello ![img](https://img.example.com/a(1).png)';
      const upload = vi.fn().mockResolvedValue({ key: 'dataset/file-parsed/a.png' });

      const result = await parseMarkdownBase64Images(text, {
        parseHttp: true,
        controller: upload
      });

      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'http',
          url: 'https://img.example.com/a(1).png'
        })
      );
      expect(result).toBe('hello ![img](dataset/file-parsed/a.png)');
    });

    it('parseHttp 开启时应该正确处理 URL 中转义的右括号', async () => {
      const text = String.raw`hello ![img](https://img.example.com/a\).png)`;
      const upload = vi.fn().mockResolvedValue({ key: 'dataset/file-parsed/a.png' });

      const result = await parseMarkdownBase64Images(text, {
        parseHttp: true,
        controller: upload
      });

      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'http',
          url: 'https://img.example.com/a).png'
        })
      );
      expect(result).toBe('hello ![img](dataset/file-parsed/a.png)');
    });

    it('http 图片转存失败时应该用原始 markdown 节点回退', async () => {
      const text = String.raw`hello ![img](https://img.example.com/a\).png)`;

      const result = await parseMarkdownBase64Images(text, {
        parseHttp: true,
        controller: vi.fn().mockRejectedValue(new Error('failed'))
      });

      expect(result).toBe(text);
    });

    it('parseHttp 开启但未传上传回调时应该保留普通 http 图片', async () => {
      const text = 'hello ![img](https://img.example.com/a.png)';

      const result = await parseMarkdownBase64Images(text, {
        parseHttp: true
      });

      expect(result).toBe(text);
    });

    it('http 图片转存失败时应该保留原 URL', async () => {
      const text = 'hello ![img](https://img.example.com/a.png)';

      const result = await parseMarkdownBase64Images(text, {
        parseHttp: true,
        controller: vi.fn().mockRejectedValue(new Error('failed'))
      });

      expect(result).toBe(text);
    });
  });

  describe('性能测试', () => {
    it('parseMarkdownBase64Images 应该处理多个图片', async () => {
      const imageCount = 5;
      let text = '';

      for (let i = 0; i < imageCount; i++) {
        text += `![img${i}](data:image/png;base64,DATA${i}==)\n`;
      }

      const mockUpload = vi.fn().mockImplementation(async (img) => {
        await new Promise((resolve) => setTimeout(resolve, 10)); // 模拟异步上传
        return { key: `https://cdn.example.com/${img.split('DATA')[1].split('=')[0]}.png` };
      });

      await parseMarkdownBase64Images(text, {
        controller: (image) => {
          expect(image.type).toBe('base64');
          return mockUpload(image.url);
        }
      });

      expect(mockUpload).toHaveBeenCalledTimes(imageCount);
    });

    it('parseMarkdownBase64Images 应该快速处理大文档并删除 base64', async () => {
      // 生成包含 100 个 base64 图片的文档
      let text = '';
      for (let i = 0; i < 100; i++) {
        text += `![img${i}](data:image/png;base64,${'A'.repeat(1000)})\n`;
      }

      const start = performance.now();
      const result = await parseMarkdownBase64Images(text);
      const duration = performance.now() - start;

      expect(result).not.toContain('data:image/png;base64');
      expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
    });
  });
});
