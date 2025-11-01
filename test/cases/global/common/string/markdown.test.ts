import { describe, it, expect, vi } from 'vitest';
import {
  simpleMarkdownText,
  htmlTable2Md,
  uploadMarkdownBase64,
  markdownProcess,
  matchMdImg
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

  describe('uploadMarkdownBase64', () => {
    it('应该在没有 uploadImgController 时返回原文本', async () => {
      const rawText = '![image](data:image/png;base64,ABC123)';
      const result = await uploadMarkdownBase64({ rawText });

      expect(result).toBe(rawText);
    });

    it('应该上传 base64 图片并替换 URL', async () => {
      const base64Img = 'data:image/png;base64,iVBORw0KGgo=';
      const rawText = `![test](${base64Img})`;
      const uploadedUrl = 'https://cdn.example.com/image.png';

      const mockUpload = vi.fn().mockResolvedValue(uploadedUrl);

      const result = await uploadMarkdownBase64({
        rawText,
        uploadImgController: mockUpload
      });

      expect(mockUpload).toHaveBeenCalledWith(base64Img);
      expect(result).toBe(`![test](${uploadedUrl})`);
    });

    it('应该处理多个 base64 图片', async () => {
      // 注意: uploadMarkdownBase64 的正则 [^\)]+ 是贪婪匹配
      // 多个图片在同一行会被匹配为一个,所以用换行分隔
      const base64Img1 = 'data:image/png;base64,ABC=';
      const base64Img2 = 'data:image/jpeg;base64,DEF=';
      const rawText = `![img1](${base64Img1})\n![img2](${base64Img2})`;

      const mockUpload = vi
        .fn()
        .mockResolvedValueOnce('https://cdn.example.com/img1.png')
        .mockResolvedValueOnce('https://cdn.example.com/img2.jpg');

      const result = await uploadMarkdownBase64({
        rawText,
        uploadImgController: mockUpload
      });

      // batchRun 会调用所有匹配到的图片
      expect(mockUpload).toHaveBeenCalled();
      expect(result).toContain('https://cdn.example.com/img1.png');
      expect(result).toContain('https://cdn.example.com/img2.jpg');
    });

    it('应该处理上传失败的情况', async () => {
      const base64Img = 'data:image/png;base64,ERROR=';
      const rawText = `![test](${base64Img})`;

      const mockUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));

      const result = await uploadMarkdownBase64({
        rawText,
        uploadImgController: mockUpload
      });

      // 上传失败时应该移除图片
      expect(result).not.toContain(base64Img);
    });

    it('应该处理部分上传失败', async () => {
      // 注意: uploadMarkdownBase64 的正则 [^\)]+ 是贪婪匹配
      // 多个图片在同一行会被匹配为一个,所以用换行分隔
      const base64Img1 = 'data:image/png;base64,OK=';
      const base64Img2 = 'data:image/jpeg;base64,FAIL=';
      const rawText = `![img1](${base64Img1})\n![img2](${base64Img2})`;

      const mockUpload = vi
        .fn()
        .mockResolvedValueOnce('https://cdn.example.com/img1.png')
        .mockRejectedValueOnce(new Error('Failed'));

      const result = await uploadMarkdownBase64({
        rawText,
        uploadImgController: mockUpload
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

      const mockUpload = vi.fn().mockResolvedValue('https://cdn.example.com/image.png');

      const result = await uploadMarkdownBase64({
        rawText,
        uploadImgController: mockUpload
      });

      expect(result).toContain('# Header');
      expect(result).toContain('Some text before');
      expect(result).toContain('https://cdn.example.com/image.png');
      expect(result).toContain('Some text after');
      expect(result).toContain('## Footer');
    });
  });

  describe('markdownProcess', () => {
    it('应该处理不带上传控制器的 Markdown', async () => {
      const rawText = '# Title\n\nSome text\n\n';
      const result = await markdownProcess({ rawText });

      expect(result).toContain('# Title');
      expect(result).toContain('Some text');
    });

    it('应该上传 base64 图片并简化文本', async () => {
      const base64Img = 'data:image/png;base64,TEST=';
      const rawText = `# Title\n\n![image](${base64Img})\n\nMore text`;

      const mockUpload = vi.fn().mockResolvedValue('https://cdn.example.com/image.png');

      const result = await markdownProcess({
        rawText,
        uploadImgController: mockUpload
      });

      expect(result).toContain('# Title');
      expect(result).toContain('https://cdn.example.com/image.png');
      expect(result).not.toContain(base64Img);
    });

    it('应该移除多余的转义字符', async () => {
      const rawText = '\\# Title\n\\* Item 1\n\\* Item 2';
      const result = await markdownProcess({ rawText });

      expect(result).toContain('# Title');
      expect(result).toContain('* Item 1');
      expect(result).toContain('* Item 2');
    });

    it('应该处理空文本', async () => {
      const result = await markdownProcess({ rawText: '' });

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

      const mockUpload = vi.fn().mockResolvedValue('https://cdn.example.com/img.png');

      const result = await markdownProcess({
        rawText,
        uploadImgController: mockUpload
      });

      expect(result).toContain('# Heading');
      expect(result).toContain('[Link](https://example.com)');
      expect(result).toContain('https://cdn.example.com/img.png');
      expect(result).toContain('```javascript');
    });
  });

  describe('matchMdImg', () => {
    it('应该提取单个 base64 图片', () => {
      const base64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const text = `![test](data:image/png;base64,${base64Data})`;
      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(1);
      expect(result.imageList[0].base64).toBe(base64Data);
      expect(result.imageList[0].mime).toBe('image/png');
      expect(result.imageList[0].uuid).toMatch(/^IMAGE_[a-zA-Z0-9]+_IMAGE$/);
      expect(result.text).toContain('IMAGE_');
      expect(result.text).not.toContain('data:image');
    });

    it('应该保留 alt 文本', () => {
      const base64Data = 'ABC123==';
      const text = `![My Image](data:image/png;base64,${base64Data})`;
      const result = matchMdImg(text);

      expect(result.text).toContain('![My Image]');
      expect(result.imageList[0].uuid).toBeTruthy();
    });

    it('应该处理空 alt 文本', () => {
      const base64Data = 'ABC123==';
      const text = `![](data:image/png;base64,${base64Data})`;
      const result = matchMdImg(text);

      expect(result.text).toContain('![]');
      expect(result.imageList).toHaveLength(1);
    });

    it('应该提取多个 base64 图片', () => {
      const base64Data1 = 'DATA1==';
      const base64Data2 = 'DATA2==';
      const text = `
        ![img1](data:image/png;base64,${base64Data1})
        Some text
        ![img2](data:image/jpeg;base64,${base64Data2})
      `;
      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(2);
      expect(result.imageList[0].base64).toBe(base64Data1);
      expect(result.imageList[0].mime).toBe('image/png');
      expect(result.imageList[1].base64).toBe(base64Data2);
      expect(result.imageList[1].mime).toBe('image/jpeg');
    });

    it('应该处理不同的图片格式', () => {
      const formats = ['png', 'jpeg', 'gif', 'webp'];
      let text = '';

      formats.forEach((fmt, i) => {
        text += `![img${i}](data:image/${fmt};base64,DATA${i}==)\n`;
      });

      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(formats.length);
      formats.forEach((fmt, i) => {
        expect(result.imageList[i].mime).toBe(`image/${fmt}`);
      });
    });

    it('应该处理简单的 alt 文本', () => {
      const base64Data = 'TEST==';
      const text = `![Alt text](data:image/png;base64,${base64Data})`;
      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(1);
      expect(result.text).toContain('![Alt text]');
    });

    it('应该处理不包含 base64 图片的文本', () => {
      const text = `
        # Title
        ![normal image](https://example.com/image.png)
        Some text
      `;
      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(0);
      expect(result.text).toBe(text);
    });

    it('应该处理混合的图片类型', () => {
      const base64Data = 'BASE64==';
      const text = `
        ![base64](data:image/png;base64,${base64Data})
        ![url](https://example.com/image.jpg)
      `;
      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(1);
      expect(result.text).toContain('https://example.com/image.jpg');
      expect(result.text).not.toContain('data:image/png');
    });

    it('应该处理空文本', () => {
      const result = matchMdImg('');

      expect(result.imageList).toHaveLength(0);
      expect(result.text).toBe('');
    });

    it('应该处理大型 base64 图片', () => {
      // 生成约 100KB 的 base64 数据
      const largeBase64 = 'A'.repeat(100 * 1024);
      const text = `![large](data:image/png;base64,${largeBase64})`;
      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(1);
      expect(result.imageList[0].base64).toBe(largeBase64);
      expect(result.imageList[0].base64.length).toBe(100 * 1024);
    });

    it('应该为每个图片生成唯一的 UUID', () => {
      const base64Data = 'SAME==';
      const text = `
        ![img1](data:image/png;base64,${base64Data})
        ![img2](data:image/png;base64,${base64Data})
      `;
      const result = matchMdImg(text);

      expect(result.imageList).toHaveLength(2);
      expect(result.imageList[0].uuid).not.toBe(result.imageList[1].uuid);
    });

    it('应该处理 base64 填充字符', () => {
      const testCases = ['ABC=', 'ABCD==', 'ABCDEF'];

      testCases.forEach((base64Data) => {
        const text = `![test](data:image/png;base64,${base64Data})`;
        const result = matchMdImg(text);

        expect(result.imageList).toHaveLength(1);
        expect(result.imageList[0].base64).toBe(base64Data);
      });
    });
  });

  describe('性能测试', () => {
    it('uploadMarkdownBase64 应该处理多个图片', async () => {
      // 注意: uploadMarkdownBase64 的正则 [^\)]+ 是贪婪匹配
      // 多个图片在同一行会被匹配为一个,所以用换行分隔
      const imageCount = 5;
      let text = '';

      for (let i = 0; i < imageCount; i++) {
        text += `![img${i}](data:image/png;base64,DATA${i}==)\n`;
      }

      const mockUpload = vi.fn().mockImplementation(async (img) => {
        await new Promise((resolve) => setTimeout(resolve, 10)); // 模拟异步上传
        return `https://cdn.example.com/${img.split('DATA')[1].split('=')[0]}.png`;
      });

      await uploadMarkdownBase64({
        rawText: text,
        uploadImgController: mockUpload
      });

      expect(mockUpload).toHaveBeenCalledTimes(imageCount);
    });

    it('matchMdImg 应该快速处理大文档', () => {
      // 生成包含 100 个 base64 图片的文档
      let text = '';
      for (let i = 0; i < 100; i++) {
        text += `![img${i}](data:image/png;base64,${'A'.repeat(1000)})\n`;
      }

      const start = performance.now();
      const result = matchMdImg(text);
      const duration = performance.now() - start;

      expect(result.imageList).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
    });
  });
});
