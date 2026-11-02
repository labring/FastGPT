import { describe, it, expect, vi } from 'vitest';
import {
  simpleMarkdownText,
  htmlTable2Md,
  matchDocumentImages,
  matchMarkdownImages,
  parseMarkdownBase64Images,
  replaceMarkdownImageAltText,
  unescapeMarkdownImageUrl
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

    it.each(['C:\\Users\\Alice', String.raw`\Delta + \Omega`, String.raw`\1`])(
      '应该保留非 Markdown 转义中的反斜杠: %s',
      (input) => {
        expect(simpleMarkdownText(input)).toBe(input);
      }
    );

    it('应该继续移除连字符、加号和下划线的转义', () => {
      expect(simpleMarkdownText(String.raw`\- \+ \_`)).toBe('- + _');
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

    it('应该保留 Markdown 硬换行的行尾双空格', () => {
      const input = 'Line  \nNext';

      expect(simpleMarkdownText(input)).toBe(input);
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

    it('应该在表头列数少于数据行时补齐表头和分隔行', () => {
      const html = `
        <table>
          <tr><td>季度报表</td></tr>
          <tr><td>Q1</td><td>Q2</td><td>Q3</td></tr>
          <tr><td>1</td><td>2</td><td>3</td></tr>
        </table>
      `;
      const lines = htmlTable2Md(html).trim().split('\n');
      const countColumns = (line: string) => line.split('|').length - 2;

      expect(lines[0]).toContain('季度报表');
      expect(countColumns(lines[0])).toBe(3);
      expect(lines[1]).toBe('| --- | --- | --- |');
      expect(lines[2]).toBe('| Q1 | Q2 | Q3 |');
      expect(lines[3]).toBe('| 1 | 2 | 3 |');
    });

    it('应该把 th 表头单元格转成 Markdown 表头，而不是丢掉列名', () => {
      const html = `
        <table>
          <thead>
            <tr><th>品名</th><th>单价</th></tr>
          </thead>
          <tbody>
            <tr><td>电缆</td><td>9 EUR</td></tr>
          </tbody>
        </table>
      `;
      const lines = htmlTable2Md(html).trim().split('\n');

      expect(lines[0]).toBe('| 品名 | 单价 |');
      expect(lines[1]).toBe('| --- | --- |');
      expect(lines[2]).toBe('| 电缆 | 9 EUR |');
    });

    it('应该保留同一行里混用的 th 行头和 td 数据', () => {
      const html = `
        <table>
          <tr><th>项目</th><td>Q1</td><td>Q2</td></tr>
          <tr><th>营收</th><td>10</td><td>20</td></tr>
        </table>
      `;
      const lines = htmlTable2Md(html).trim().split('\n');

      expect(lines[0]).toBe('| 项目 | Q1 | Q2 |');
      expect(lines[1]).toBe('| --- | --- | --- |');
      expect(lines[2]).toBe('| 营收 | 10 | 20 |');
    });

    it('应该转义单元格里的 |，避免拆出多余的列', () => {
      const html = `
        <table>
          <tr><th>选项|别名</th><th>公式</th></tr>
          <tr><td>A|B</td><td>$|x|$</td></tr>
          <tr><td>已转义 \\|</td><td>C</td></tr>
        </table>
      `;
      const lines = htmlTable2Md(html).trim().split('\n');

      expect(lines[0]).toBe('| 选项&#124;别名 | 公式 |');
      expect(lines[1]).toBe('| --- | --- |');
      expect(lines[2]).toBe('| A&#124;B | $&#124;x&#124;$ |');
      expect(lines[3]).toBe('| 已转义 \\| | C |');
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

  describe('parseMarkdownBase64Images HTML img 标签', () => {
    it('应该上传 HTML img 中的 base64 并仅替换 src 为 key', async () => {
      const rawText =
        '<img alt="印章" style="max-width:200px" src="data:image/png;base64,HTMLIMG=" />';
      const mockUpload = vi.fn().mockResolvedValue({ key: 'dataset/abc/img.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => mockUpload(image.url)
      });

      // 保留 img 标签结构与其他属性，仅替换 src（表格 HTML 块内的 markdown 语法不会被渲染）
      expect(result).toBe('<img alt="印章" style="max-width:200px" src="dataset/abc/img.png" />');
      expect(result).not.toContain('data:image');
    });

    it('应该在没有 controller 时删除 HTML img 的 base64 标签', async () => {
      const rawText = '<td>前文<img src="data:image/png;base64,XXX=" />后文</td>';

      const result = await parseMarkdownBase64Images(rawText);

      expect(result).not.toContain('<img');
      expect(result).not.toContain('data:image');
      expect(result).toContain('前文');
      expect(result).toContain('后文');
    });

    it('应该在 HTML img 上传失败时删除整个标签', async () => {
      const rawText = '<p>前文</p><img src="data:image/png;base64,FAIL=" /><p>后文</p>';

      const mockUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));

      const result = await parseMarkdownBase64Images(rawText, {
        controller: () => mockUpload()
      });

      expect(result).not.toContain('<img');
      expect(result).toContain('前文');
      expect(result).toContain('后文');
    });

    it('应该不动 src 为普通 URL 的 HTML img', async () => {
      const rawText = '<img src="https://cdn.example.com/a.png" />';

      const result = await parseMarkdownBase64Images(rawText, {
        controller: vi.fn().mockResolvedValue({ key: 'dataset/abc/img.png' })
      });

      expect(result).toBe('<img src="https://cdn.example.com/a.png" />');
    });

    it('应该处理保留 HTML 表格中的行内 img（docx 外部解析场景）', async () => {
      const rawText =
        '<table><tr><td><p>国科办资〔2018<img src="data:image/png;base64,TABLEIMG=" />〕122号</p></td></tr></table>';
      const mockUpload = vi.fn().mockResolvedValue({ key: 'dataset/xyz/seal.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => mockUpload(image.url)
      });

      expect(result).toContain('<img src="dataset/xyz/seal.png" />');
      expect(result).toContain('国科办资〔2018');
      expect(result).toContain('〕122号');
      expect(result).toContain('<table>');
      expect(result).not.toContain('data:image');
    });

    it('应该按文本顺序同时处理 markdown 图片与 HTML img', async () => {
      const rawText =
        '![md](data:image/png;base64,MD1=)中间<img src="data:image/jpeg;base64,HTML1=" />结尾';
      const keys = ['dataset/a/md.png', 'dataset/b/html.jpg'];

      const result = await parseMarkdownBase64Images(rawText, {
        controller: vi
          .fn()
          .mockResolvedValueOnce({ key: keys[0] })
          .mockResolvedValueOnce({ key: keys[1] })
      });

      expect(result.indexOf(keys[0])).toBeLessThan(result.indexOf(keys[1]));
      expect(result).toContain('中间');
      expect(result).toContain('结尾');
      expect(result).toContain(`![md](${keys[0]})`);
      expect(result).not.toContain('data:image');
    });

    it('应该在 parseBase64 为 false 时跳过 HTML img 的 base64', async () => {
      const rawText = '<img src="data:image/png;base64,SKIP=" />';

      const result = await parseMarkdownBase64Images(rawText, {
        parseBase64: false,
        controller: vi.fn().mockResolvedValue({ key: 'dataset/abc/img.png' })
      });

      expect(result).toContain('data:image/png;base64,SKIP=');
    });

    it('应该在前面属性值包含 src= 字样时不被串味误导', async () => {
      const rawText =
        '<img alt="icon with src=1" title="use src=2 here" src="data:image/png;base64,REALIMG=" />';
      const mockUpload = vi.fn().mockResolvedValue({ key: 'dataset/abc/img.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => mockUpload(image.url)
      });

      // 真正的 src 被替换，alt/title 属性完整保留
      expect(result).toBe(
        '<img alt="icon with src=1" title="use src=2 here" src="dataset/abc/img.png" />'
      );
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(result).not.toContain('data:image');
    });

    it('应该防御嵌套语法：HTML 属性值内的 markdown 图片不参与扫描', async () => {
      const rawText =
        '<img title="![inner](data:image/png;base64,INNER=)" src="data:image/png;base64,OUTER=" />';
      const mockUpload = vi.fn().mockResolvedValue({ key: 'dataset/abc/img.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => mockUpload(image.url)
      });

      // 仅外层 HTML img 被处理一次，内层嵌套语法被重叠防御过滤，文本不发生重复/损坏
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(result).toContain('<img title="![inner](data:image/png;base64,INNER=)"');
      expect(result.match(/dataset\/abc\/img\.png/g)).toHaveLength(1);
      expect(result).not.toContain('data:image/png;base64,OUTER=');
    });

    it('应该支持处理无引号 src 属性的 HTML img', async () => {
      const rawText = '<img alt=badge src=data:image/png;base64,UNQUOTED />';
      const mockUpload = vi.fn().mockResolvedValue({ key: 'dataset/abc/unquoted.png' });

      const result = await parseMarkdownBase64Images(rawText, {
        controller: (image) => mockUpload(image.url)
      });

      expect(result).toBe('<img alt=badge src="dataset/abc/unquoted.png" />');
      expect(mockUpload).toHaveBeenCalledWith('data:image/png;base64,UNQUOTED');
      expect(result).not.toContain('data:image');
    });
  });

  describe('parseMarkdownBase64Images markdown 清理', () => {
    it('应该在文件内容清理后保留 Windows 路径和公式命令', async () => {
      const rawText = String.raw`C:\Users\Alice contains $\Delta + \Omega$`;

      expect(await parseMarkdownBase64Images(rawText)).toBe(rawText);
    });

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

      // 图片被删除后留下的多余空白由 simpleText 压缩成一个空格
      expect(result).toBe('before after');
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

    it('parseHttp 开启时应该还原尖括号目的地址中的转义标点', async () => {
      const text = String.raw`hello ![img](<https://img.example.com/a\>.png>)`;
      const upload = vi.fn().mockResolvedValue({ key: 'dataset/file-parsed/a.png' });

      const result = await parseMarkdownBase64Images(text, {
        parseHttp: true,
        controller: upload
      });

      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'http',
          url: 'https://img.example.com/a>.png'
        })
      );
      expect(result).toBe('hello ![img](<dataset/file-parsed/a.png>)');
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

  describe('Markdown 图片地址与标题', () => {
    it('按 CommonMark 规则还原目的地址中的 ASCII 标点转义', () => {
      expect(unescapeMarkdownImageUrl(String.raw`https://example.com/a\>.png`)).toBe(
        'https://example.com/a>.png'
      );
      expect(unescapeMarkdownImageUrl(String.raw`https://example.com/a\n.png`)).toBe(
        String.raw`https://example.com/a\n.png`
      );
    });

    it.each(['https://example.com/a>b.png', 'https://example.com/a<b.png'])(
      '裸目的地址保留未转义的尖括号：%s',
      (url) => {
        const node = `![figure](${url})`;
        expect(matchMarkdownImages(node)).toEqual([
          { altText: 'figure', url, fullMatch: node, index: 0 }
        ]);
      }
    );

    it.each([
      'https://example.com/a.png "caption"',
      "https://example.com/a.png 'caption'",
      'https://example.com/a.png (caption)',
      'https://example.com/a.png "caption with ) and ("',
      String.raw`https://example.com/a.png "escaped \"quote\""`,
      '<https://example.com/a.png>',
      '<https://example.com/a.png> "caption"',
      '<https://example.com/a.png> (caption)',
      '  https://example.com/a.png\t"caption"  '
    ])('只提取目的地址并保留完整节点：%s', (destination) => {
      const node = `![figure](${destination})`;
      expect(matchMarkdownImages(`before ${node} after`)).toEqual([
        { altText: 'figure', url: 'https://example.com/a.png', fullMatch: node, index: 7 }
      ]);
    });

    it('尖括号地址中的括号无需配对', () => {
      const node = '![figure](<https://example.com/a).png> "caption")';
      expect(matchMarkdownImages(node)[0]).toMatchObject({
        url: 'https://example.com/a).png',
        fullMatch: node
      });
    });

    it.each([
      '![bad](<https://example.com/a.png)',
      '![bad](<https://example.com/a\n.png>)',
      '![bad](<https://example.com/<a.png>)',
      '![bad](<https://example.com/a.png>"caption")',
      '![bad](https://example.com/a.png invalid)',
      '![bad](https://example.com/a(1 .png)',
      '![bad](https://example.com/a.png "unclosed)',
      '![bad](https://example.com/a.png "caption" extra)',
      '![bad](https://example.com/a.png (nested (title)))',
      '![bad](\n\nhttps://example.com/a.png)',
      '![bad](https://example.com/a.png\n\n"caption")',
      '![bad](https://example.com/a.png "line 1\n\nline 2")'
    ])('忽略不完整节点并继续扫描后续图片：%s', (invalid) => {
      const valid = '![ok](https://example.com/ok.png "ok")';
      const matches = matchMarkdownImages(`${invalid} ${valid}`);
      expect(matches).toEqual([
        {
          altText: 'ok',
          url: 'https://example.com/ok.png',
          fullMatch: valid,
          index: invalid.length + 1
        }
      ]);
    });

    it('目的地址和标题之间至多允许一个换行，标题可跨行但不能包含空行', () => {
      const oneLineEnding = '![figure](https://example.com/a.png\n"caption")';
      expect(matchMarkdownImages(oneLineEnding)).toEqual([
        {
          altText: 'figure',
          url: 'https://example.com/a.png',
          fullMatch: oneLineEnding,
          index: 0
        }
      ]);

      const multilineTitle = '![figure](https://example.com/a.png "line 1\nline 2")';
      expect(matchMarkdownImages(multilineTitle)).toEqual([
        {
          altText: 'figure',
          url: 'https://example.com/a.png',
          fullMatch: multilineTitle,
          index: 0
        }
      ]);
    });

    it.each(['"caption"', "'caption'", '(caption)'])(
      '转存仅替换 URL，保留标题 %s',
      async (title) => {
        const upload = vi.fn().mockResolvedValue({ key: 'dataset/figure.png' });
        const result = await parseMarkdownBase64Images(
          `![figure](https://example.com/a(1).png ${title})`,
          { parseHttp: true, controller: upload }
        );
        expect(upload).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ type: 'http', url: 'https://example.com/a(1).png' })
        );
        expect(result).toBe(`![figure](dataset/figure.png ${title})`);
      }
    );

    it.each([
      ['data:image/png;base64,AAAA', 'dataset/figure.png'],
      ['<data:image/png;base64,AAAA>', '<dataset/figure.png>']
    ])('带标题的 base64 图片可上传，且保留目的地址格式：%s', async (destination, replaced) => {
      const upload = vi.fn().mockResolvedValue({ key: 'dataset/figure.png' });
      const result = await parseMarkdownBase64Images(`![figure](${destination} "caption")`, {
        controller: upload
      });
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'base64', base64: 'AAAA' })
      );
      expect(result).toBe(`![figure](${replaced} "caption")`);
    });

    it('HTTP 转存失败时完整保留标题中的转义字符与括号', async () => {
      const node = String.raw`![figure](<https://example.com/a).png> "escaped \"quote\"")`;
      const result = await parseMarkdownBase64Images(node, {
        parseHttp: true,
        controller: vi.fn().mockRejectedValue(new Error('offline'))
      });
      expect(result).toBe(node);
    });

    it('替换不影响相邻图片，空 key 删除整个节点', () => {
      const nodes = matchDocumentImages(
        '![a](https://example.com/a.png "A") ![b](<https://example.com/b.png> \'B\')'
      );
      expect(nodes.map((node) => node.url)).toEqual([
        'https://example.com/a.png',
        'https://example.com/b.png'
      ]);
      expect(nodes[0].replace('dataset/a.png')).toBe('![a](dataset/a.png "A")');
      expect(nodes[1].replace('dataset/b.png')).toBe("![b](<dataset/b.png> 'B')");
      expect(nodes[0].replace('')).toBe('');
    });

    it('替换 alt 时保留目的地址格式与标题', () => {
      const node = String.raw`![figure](<https://example.com/a\>.png> "caption")`;
      expect(replaceMarkdownImageAltText(node, 'figure - description')).toBe(
        String.raw`![figure - description](<https://example.com/a\>.png> "caption")`
      );
    });
  });

  describe('matchMarkdownImages', () => {
    it('应该正确提取普通 markdown 图片', () => {
      const text = '前置文字 ![avatar](https://example.com/avatar.png) 后置文字';
      const result = matchMarkdownImages(text);

      expect(result).toEqual([
        {
          altText: 'avatar',
          url: 'https://example.com/avatar.png',
          fullMatch: '![avatar](https://example.com/avatar.png)',
          index: 5
        }
      ]);
    });

    it('应该正确处理 URL 中带括号的图片地址，避免在第一个右括号截断', () => {
      const text = '![figure](https://cdn.example.com/figure(1).png)';
      const result = matchMarkdownImages(text);

      expect(result).toEqual([
        {
          altText: 'figure',
          url: 'https://cdn.example.com/figure(1).png',
          fullMatch: '![figure](https://cdn.example.com/figure(1).png)',
          index: 0
        }
      ]);
    });

    it('应该正确处理 URL 中带转义括号的图片地址', () => {
      const text = String.raw`![figure](https://cdn.example.com/figure\(1\).png)`;
      const result = matchMarkdownImages(text);

      expect(result).toEqual([
        {
          altText: 'figure',
          url: String.raw`https://cdn.example.com/figure\(1\).png`,
          fullMatch: String.raw`![figure](https://cdn.example.com/figure\(1\).png)`,
          index: 0
        }
      ]);
    });

    it('应该对 url 进行 trim 处理并保留完整 fullMatch', () => {
      const text = '![img](  https://example.com/space.png  )';
      const result = matchMarkdownImages(text);

      expect(result).toEqual([
        {
          altText: 'img',
          url: 'https://example.com/space.png',
          fullMatch: '![img](  https://example.com/space.png  )',
          index: 0
        }
      ]);
    });

    it('应该提取多个图片节点并忽略普通 markdown 超链接', () => {
      const text = '![a](https://a.com/1.png) [link](https://b.com) ![b](https://c.com/2.png)';
      const result = matchMarkdownImages(text);

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://a.com/1.png');
      expect(result[1].url).toBe('https://c.com/2.png');
    });

    it('alt 文本里成对的方括号不会提前结束图片描述', () => {
      // CommonMark 允许图片描述里出现成对的方括号，`![图 [1]](url)` 是一张图片。
      const text = '见 ![图 [1] 示意](https://example.com/fig1.png) 与 ![b](https://c.com/2.png)';
      const result = matchMarkdownImages(text);

      expect(result).toEqual([
        {
          altText: '图 [1] 示意',
          url: 'https://example.com/fig1.png',
          fullMatch: '![图 [1] 示意](https://example.com/fig1.png)',
          index: 2
        },
        {
          altText: 'b',
          url: 'https://c.com/2.png',
          fullMatch: '![b](https://c.com/2.png)',
          index: 46
        }
      ]);
      expect(
        replaceMarkdownImageAltText('![a [b] [c]](https://example.com/x.png "t")', 'next')
      ).toBe('![next](https://example.com/x.png "t")');
    });

    it('alt 文本里未配对或转义的方括号仍按原规则处理', () => {
      // 转义的方括号不参与配对。
      expect(matchMarkdownImages(String.raw`![a \[b](https://example.com/x.png)`)).toEqual([
        {
          altText: String.raw`a \[b`,
          url: 'https://example.com/x.png',
          fullMatch: String.raw`![a \[b](https://example.com/x.png)`,
          index: 0
        }
      ]);
      // 找不到配对的右方括号时，沿用第一个右方括号，保持原有的宽松匹配。
      expect(matchMarkdownImages('![a [b](https://example.com/x.png)')).toEqual([
        {
          altText: 'a [b',
          url: 'https://example.com/x.png',
          fullMatch: '![a [b](https://example.com/x.png)',
          index: 0
        }
      ]);
      // 后文的右方括号能配对但后面不是 `(`，同样沿用第一个右方括号。
      expect(matchMarkdownImages('![a [b](https://example.com/x.png) 见 c]')).toMatchObject([
        { altText: 'a [b', url: 'https://example.com/x.png' }
      ]);
    });

    it('代码跨度里的方括号不参与配对，配对也不跨越空行', async () => {
      // 代码跨度优先于方括号配对：alt 里的 `[` 不应让描述一直延伸到后文的代码示例。
      const text =
        '![a `[`](https://example.com/a.png)\n\nExample: `](data:image/png;base64,AAAA)`';
      expect(matchMarkdownImages(text)).toEqual([
        {
          altText: 'a `[`',
          url: 'https://example.com/a.png',
          fullMatch: '![a `[`](https://example.com/a.png)',
          index: 0
        }
      ]);
      expect(await parseMarkdownBase64Images(text)).toBe(text);

      // alt 含反引号时不做嵌套配对，回到原有的第一个右方括号规则：
      // 含代码 `[` 的图片照常识别，含代码 `]` 的图片和改动前一样不识别，后文不受影响。
      expect(
        matchMarkdownImages(
          '![x `[`](https://a.com/1.png) ![y `]`](https://b.com/2.png) ![z [1]](https://c.com/3.png)'
        )
      ).toMatchObject([
        { altText: 'x `[`', url: 'https://a.com/1.png' },
        { altText: 'z [1]', url: 'https://c.com/3.png' }
      ]);

      // 空行之后的右方括号不和前一段的左方括号配对。
      expect(
        matchMarkdownImages('![a [b](https://a.com/1.png)\n\nc](https://b.com/2.png)')
      ).toMatchObject([{ altText: 'a [b', url: 'https://a.com/1.png' }]);
    });

    it.each([
      ['LF', '\n'],
      ['CRLF', '\r\n'],
      ['CR', '\r']
    ])('%s 空行阻止跨段落配对，保留正文且不上传伪图片', async (_name, lineEnding) => {
      for (const blank of ['', ' \t']) {
        const text = `before ![a [b]${lineEnding}${blank}${lineEnding}c](data:image/png;base64,AAAA) after`;
        const controller = vi.fn(async () => ({ key: 'uploaded-key' }));
        const normalized = text.replace(/\r\n|\r/g, '\n');

        expect(matchMarkdownImages(text)).toEqual([]);
        expect(matchDocumentImages(text)).toEqual([]);
        expect(replaceMarkdownImageAltText(text, 'next')).toBe(text);
        expect(await parseMarkdownBase64Images(text)).toBe(normalized);
        expect(await parseMarkdownBase64Images(text, { controller, parseHttp: true })).toBe(
          normalized
        );
        expect(controller).not.toHaveBeenCalled();
      }
    });

    it.each([
      ['LF', '\n'],
      ['CRLF', '\r\n'],
      ['CR', '\r']
    ])('%s 换行后仍按原文偏移匹配和替换真实图片', async (_name, lineEnding) => {
      const prefix = `before ![a [b]${lineEnding}${lineEnding}c](data:image/png;base64,AAAA) after${lineEnding}`;
      const node = `![图 [1]${lineEnding}示意](data:image/png;base64,BBBB "caption")`;
      const text = `${prefix}${node} end`;
      const controller = vi.fn(async () => ({ key: 'uploaded-key' }));

      expect(matchMarkdownImages(text)).toEqual([
        {
          altText: `图 [1]${lineEnding}示意`,
          url: 'data:image/png;base64,BBBB',
          fullMatch: node,
          index: prefix.length
        }
      ]);
      expect(matchDocumentImages(text)[0].replace('uploaded-key')).toBe(
        node.replace('data:image/png;base64,BBBB', 'uploaded-key')
      );
      expect(replaceMarkdownImageAltText(node, 'next')).toBe(
        '![next](data:image/png;base64,BBBB "caption")'
      );
      expect(await parseMarkdownBase64Images(text, { controller })).toBe(
        `${prefix}${node.replace('data:image/png;base64,BBBB', 'uploaded-key')} end`.replace(
          /\r\n|\r/g,
          '\n'
        )
      );
      expect(controller).toHaveBeenCalledTimes(1);
      expect(controller).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'data:image/png;base64,BBBB', index: prefix.length })
      );
    });

    it.each([
      ['LF', '\n'],
      ['CRLF', '\r\n'],
      ['CR', '\r']
    ])('%s 换行后的块级标记阻止配对跨越正文块', async (_name, lineEnding) => {
      for (const block of [
        '# Heading',
        '---',
        '===',
        '***',
        '___',
        '- item',
        '+ item',
        '1. item',
        '1) item',
        '> quote',
        `~~~${lineEnding}code${lineEnding}~~~`
      ]) {
        const text = `before ![a [b]${lineEnding}  ${block}${lineEnding}c](data:image/png;base64,AAAA) after`;
        const controller = vi.fn(async () => ({ key: 'uploaded-key' }));

        expect(matchMarkdownImages(text)).toEqual([]);
        expect(await parseMarkdownBase64Images(text, { controller })).toBe(
          simpleMarkdownText(text)
        );
        expect(controller).not.toHaveBeenCalled();
      }
    });

    it('块边界两侧及反斜杠硬换行都不会扩展图片，块内完整图片仍可识别', async () => {
      for (const lineEnding of ['\n', '\r\n', '\r']) {
        for (const text of [
          `# before ![a [b]${lineEnding}c](data:image/png;base64,AAAA) after`,
          `before ![a [b]\\${lineEnding}${lineEnding}c](data:image/png;base64,AAAA) after`
        ]) {
          const controller = vi.fn(async () => ({ key: 'uploaded-key' }));
          expect(matchMarkdownImages(text)).toEqual([]);
          expect(await parseMarkdownBase64Images(text, { controller })).toBe(
            simpleMarkdownText(text)
          );
          expect(controller).not.toHaveBeenCalled();
        }

        const node = '![图 [1]](https://example.com/a.png)';
        expect(matchMarkdownImages(`# ${node}${lineEnding}after`)).toEqual([
          { altText: '图 [1]', url: 'https://example.com/a.png', fullMatch: node, index: 2 }
        ]);
      }
    });

    it('HTML 标签或前文标题里的反引号不改变图片边界', async () => {
      // HTML 属性值里的 `[` 不参与配对，图片仍在第一个右方括号结束，正文不丢失。
      const html =
        '![a <span title="[">](https://example.com/a.png) and ](data:image/png;base64,AAAA) end';
      expect(matchMarkdownImages(html)).toMatchObject([
        { altText: 'a <span title="[">', url: 'https://example.com/a.png' }
      ]);
      expect(await parseMarkdownBase64Images(html)).toBe(html);

      // 第一张图片标题里的反引号不会和后文的反引号配成代码跨度，第二张图片照常识别。
      const titled =
        '![first](https://example.com/a.png "literal `") ![second [1]](data:image/png;base64,AAAA) trailing ` end';
      expect(matchMarkdownImages(titled)).toMatchObject([
        { altText: 'first', url: 'https://example.com/a.png' },
        { altText: 'second [1]', url: 'data:image/png;base64,AAAA' }
      ]);
      const uploaded: string[] = [];
      const result = await parseMarkdownBase64Images(titled, {
        controller: async (image) => {
          uploaded.push(image.url);
          return { key: 'uploaded-key' };
        }
      });
      expect(uploaded).toEqual(['data:image/png;base64,AAAA']);
      expect(result).toContain('![second [1]](uploaded-key)');
    });

    it('描述里的普通小于号不影响嵌套方括号配对', async () => {
      // `x < y` 里的 `<` 后面不是字母、/、! 或 ?，不会开始 HTML 标签。
      const text = '![图 [1]，x < y 的情况](data:image/png;base64,AAAA "caption")';
      expect(matchMarkdownImages(text)).toMatchObject([
        { altText: '图 [1]，x < y 的情况', url: 'data:image/png;base64,AAAA' }
      ]);
      const uploaded: string[] = [];
      const result = await parseMarkdownBase64Images(text, {
        controller: async (image) => {
          uploaded.push(image.url);
          return { key: 'uploaded-key' };
        }
      });
      expect(uploaded).toEqual(['data:image/png;base64,AAAA']);
      expect(result).toBe('![图 [1]，x < y 的情况](uploaded-key "caption")');
    });

    it('描述里嵌套链接的地址含有 ]( 时不从地址里构造图片', async () => {
      const text =
        'before ![outer [link](https://example.com/a](data:image/png;base64,AAAA).png)](https://example.com/real.png) after';
      // 外层配对不记录，回到第一个右方括号的原规则：地址不是 base64，正文原样保留。
      for (const match of matchMarkdownImages(text)) {
        expect(match.url.startsWith('data:')).toBe(false);
      }
      const controller = vi.fn(async () => ({ key: 'uploaded-key' }));
      expect(await parseMarkdownBase64Images(text, { controller })).toBe(text);
      expect(controller).not.toHaveBeenCalled();
    });

    it('普通和嵌套描述混排时保留地址、标题及原文偏移', () => {
      const nodes = [
        '![plain](https://example.com/a.png "first")',
        '![图 [1]](https://example.com/b.png "second")',
        '![](https://example.com/c.png "third")'
      ];
      const text = nodes.join(' text ');

      expect(matchMarkdownImages(text)).toEqual(
        nodes.map((node, index) => ({
          altText: ['plain', '图 [1]', ''][index],
          url: `https://example.com/${['a', 'b', 'c'][index]}.png`,
          fullMatch: node,
          index: text.indexOf(node)
        }))
      );
      expect(matchDocumentImages(text).map((image) => image.replace('next-key'))).toEqual([
        '![plain](next-key "first")',
        '![图 [1]](next-key "second")',
        '![](next-key "third")'
      ]);
    });

    it('无效候选共用右括号时仍能找到后续有效图片', () => {
      const prefix = 'before ![broken ![also broken] not-image ';
      const node = '![valid](https://example.com/a.png)';

      expect(matchMarkdownImages(`${prefix}${node}`)).toEqual([
        {
          altText: 'valid',
          url: 'https://example.com/a.png',
          fullMatch: node,
          index: prefix.length
        }
      ]);
    });

    it('大量未闭合候选不会重复扫描同一个右括号或剩余全文', () => {
      const noClosing = '![unclosed '.repeat(20000);
      const sharedClosing = `${'![unclosed '.repeat(4000)}${'x'.repeat(100000)}] not-image`;

      const started = performance.now();
      expect(matchMarkdownImages(noClosing)).toEqual([]);
      expect(matchMarkdownImages(sharedClosing)).toEqual([]);
      // 逐候选重扫后缀需数秒，缓存右括号并及时终止后只需一次线性扫描。
      expect(performance.now() - started).toBeLessThan(500);
    });

    it('多种长度且不闭合的反引号串不会反复扫描后文', () => {
      const runs = Array.from({ length: 400 }, (_, i) => '`'.repeat(i + 1)).join(' ');
      const text = `![a [1]](https://example.com/a.png) ${runs} ${'x'.repeat(1_000_000)}`;

      const started = performance.now();
      expect(matchMarkdownImages(text)).toMatchObject([
        { altText: 'a [1]', url: 'https://example.com/a.png' }
      ]);
      // 每种长度各扫一遍剩余文本时约需数秒；单次线性扫描远低于这个上限。
      expect(performance.now() - started).toBeLessThan(500);
    });

    it('大量未配对 alt 的图片仍按线性时间扫描', () => {
      const count = 20000;
      const unpaired = Array.from(
        { length: count },
        (_, i) => `![a [b](https://example.com/${i}.png)`
      ).join(' ');
      const withCode = Array.from(
        { length: count },
        (_, i) => `![array \`[\`](https://example.com/${i}.png)`
      ).join(' ');

      const started = performance.now();
      expect(matchMarkdownImages(unpaired)).toHaveLength(count);
      expect(matchMarkdownImages(withCode)).toHaveLength(count);
      // 逐图重扫剩余全文时 20000 张需要数十秒；线性扫描远低于这个上限。
      expect(performance.now() - started).toBeLessThan(5000);
    });

    it('传入空字符串或非法输入时不报错且返回空数组', () => {
      expect(matchMarkdownImages('')).toEqual([]);
      expect(matchMarkdownImages(null as any)).toEqual([]);
      expect(matchMarkdownImages(undefined as any)).toEqual([]);
    });
  });
});
