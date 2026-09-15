import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createS3KeysPreviewUrlMap,
  getS3ObjectKeysFromTexts,
  replaceS3KeysWithPreviewUrlMap,
  replaceS3KeysToPreviewUrls,
  replaceS3KeyToPreviewUrl
} from '@fastgpt/service/common/s3/utils/preview';

const mockCreateS3DownloadAccessUrls = vi.hoisted(() =>
  vi.fn(async (params: Array<{ objectKey: string }>) =>
    params.map(
      ({ objectKey }) => `https://example.com/api/system/file/d/mock-short-link-${objectKey}`
    )
  )
);

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  isS3ObjectKey: vi.fn((key: string, source: string) => {
    if (!key) return false;
    return key.startsWith(`${source}/`);
  })
}));

vi.mock('@fastgpt/service/common/s3/accessLink', () => ({
  createS3DownloadAccessUrls: mockCreateS3DownloadAccessUrls
}));

vi.mock('@fastgpt/service/common/s3/config/constants', () => ({
  S3Buckets: { private: 'private' }
}));

vi.mock('@fastgpt/service/common/s3/contracts/type', () => ({
  S3Sources: {
    avatar: 'avatar',
    chat: 'chat',
    dataset: 'dataset',
    temp: 'temp',
    rawText: 'rawText'
  }
}));

describe('replaceS3KeyToPreviewUrl', () => {
  const expiredTime = new Date('2025-12-31');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('边界情况处理', () => {
    it('空字符串应返回空字符串', async () => {
      const result = await replaceS3KeyToPreviewUrl('', expiredTime);
      expect(result).toBe('');
    });

    it('null 应返回 null', async () => {
      const result = await replaceS3KeyToPreviewUrl(null as unknown as string, expiredTime);
      expect(result).toBe(null);
    });

    it('undefined 应返回 undefined', async () => {
      const result = await replaceS3KeyToPreviewUrl(undefined as unknown as string, expiredTime);
      expect(result).toBe(undefined);
    });

    it('非字符串类型应原样返回', async () => {
      const result = await replaceS3KeyToPreviewUrl(123 as unknown as string, expiredTime);
      expect(result).toBe(123);
    });
  });

  // 测试不包含 S3 链接的普通文本
  describe('普通文本处理', () => {
    it('纯文本不做任何替换', async () => {
      const text = '这是一段普通文本，不包含任何图片链接';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toBe(text);
    });

    it('普通 HTTP 链接不做替换', async () => {
      const text = '![image](https://example.com/image.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toBe(text);
    });

    it('普通 markdown 链接不做替换', async () => {
      const text = '[链接文本](https://example.com/page)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toBe(text);
    });
  });

  // 测试 dataset 前缀的 S3 链接替换
  describe('dataset S3 链接替换', () => {
    it('应替换 dataset 图片链接', async () => {
      const text =
        '![image.png](dataset/68fee42e1d416bb5ddc85b19/6901c3071ba2bea567e8d8db/aZos7D-214afce5-4d42-4356-9e05-8164d51c59ae.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
      expect(result).toContain('dataset/68fee42e1d416bb5ddc85b19');
      expect(result).toMatch(/!\[image\.png\]\(https:\/\/example\.com/);
    });

    it('应替换 dataset 普通链接（非图片）', async () => {
      const text = '[文档](dataset/68fee42e1d416bb5ddc85b19/6901c3071ba2bea567e8d8db/document.pdf)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
      expect(result).toMatch(/\[文档\]\(https:\/\/example\.com/);
    });

    it('应替换 Turndown 使用尖括号包装的含空格 S3 key', async () => {
      const objectKey = 'dataset/team1/新建 DOCX 文档 [2]_parsed/image.png';
      const result = await replaceS3KeyToPreviewUrl(`![image](<${objectKey}>)`, expiredTime);

      expect(result).toContain(`mock-short-link-${objectKey}`);
      expect(result).not.toContain('<');
    });

    it('应保留 Markdown 链接 title，并只为 destination 签发短链', async () => {
      const text = '![image](dataset/team1/image.png "preview title")';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(mockCreateS3DownloadAccessUrls.mock.calls[0]?.[0]).toEqual([
        {
          objectKey: 'dataset/team1/image.png',
          bucketName: 'private',
          expiredTime
        }
      ]);
      expect(result).toBe(
        '![image](https://example.com/api/system/file/d/mock-short-link-dataset/team1/image.png "preview title")'
      );

      const wrappedText = "![image](<dataset/team1/image with spaces.png> 'wrapped title')";
      await expect(replaceS3KeyToPreviewUrl(wrappedText, expiredTime)).resolves.toBe(
        "![image](https://example.com/api/system/file/d/mock-short-link-dataset/team1/image with spaces.png 'wrapped title')"
      );
    });

    it('对象键包含大于号时应正常处理', async () => {
      const objectKey = 'dataset/team1/a>b.png';
      const result = await replaceS3KeyToPreviewUrl(`![image](<${objectKey}>)`, expiredTime);

      expect(result).toContain(`mock-short-link-${objectKey}`);
    });
  });

  // 测试 chat 前缀的 S3 链接替换
  describe('chat S3 链接替换', () => {
    it('应替换 chat 图片链接', async () => {
      const text =
        '![screenshot.png](chat/691ae29d404d0468717dd747/68ad85a7463006c96379a07/jXfXy8yfGAFs9WJpcWRbAhV2/parsed/9a0f4fed-4edf-4613-a8d6-533af5ae51dc.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
      expect(result).toContain('chat/691ae29d404d0468717dd747');
    });
  });

  // 测试多个链接替换
  describe('多个链接替换', () => {
    it('应正确替换多个 S3 链接', async () => {
      const text = `这是一段包含多个图片的文本：
![图片1](dataset/team1/collection1/image1.png)
一些中间文字
![图片2](chat/app1/user1/chat1/image2.jpg)
更多文字
![外部图片](https://external.com/image3.png)`;

      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);

      // dataset 和 chat 链接应被替换
      expect(result).toContain('mock-short-link-dataset/team1/collection1/image1.png');
      expect(result).toContain('mock-short-link-chat/app1/user1/chat1/image2.jpg');
      // 外部链接不应被替换
      expect(result).toContain('https://external.com/image3.png');
    });
  });

  // 测试不支持的 S3 前缀
  describe('不支持的 S3 前缀', () => {
    it('avatar 前缀不应被替换（只支持 dataset、chat 和 temp）', async () => {
      const text = '![头像](avatar/team1/user-avatar.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      // avatar 的 isS3ObjectKey 返回 false（因为只检查 dataset 和 chat）
      expect(result).toBe(text);
    });

    it('temp 前缀应被替换', async () => {
      const text = '![临时文件](temp/team1/temp-file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
      expect(result).toContain('temp/team1/temp-file.png');
    });
  });

  // 测试特殊字符处理
  describe('特殊字符处理', () => {
    // 中文字符
    it('文件名包含中文应正常处理', async () => {
      const text = '![中文图片名.png](dataset/team1/collection1/中文文件名.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
    });

    it('alt 文本为空应正常处理', async () => {
      const text = '![](dataset/team1/collection1/no-alt.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[\]\(https:\/\/example\.com/);
    });

    // 日韩文字符
    it('文件名包含日文应正常处理', async () => {
      const text = '![日本語ファイル](dataset/team1/日本語テスト.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/日本語テスト.png');
    });

    it('文件名包含韩文应正常处理', async () => {
      const text = '![한국어](dataset/team1/한국어파일.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/한국어파일.png');
    });

    // Emoji 表情符号
    it('文件名包含 emoji 应正常处理', async () => {
      const text = '![🎉 celebration](dataset/team1/🎉emoji🚀test.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/🎉emoji🚀test.png');
    });

    it('alt 文本包含多个 emoji 应正常处理', async () => {
      const text = '![🔥💯🎯](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[🔥💯🎯\]\(https:\/\/example\.com/);
    });

    // 特殊符号
    it('文件名包含下划线和连字符应正常处理', async () => {
      const text = '![image](dataset/team1/my_file-name_v2.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/my_file-name_v2.png');
    });

    it('文件名包含 @ 符号应正常处理', async () => {
      const text = '![email](dataset/team1/user@example.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/user@example.png');
    });

    it('文件名包含 # 符号应正常处理', async () => {
      const text = '![hash](dataset/team1/file#1.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/file#1.png');
    });

    it('文件名包含 $ 符号应正常处理', async () => {
      const text = '![dollar](dataset/team1/price$100.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/price$100.png');
    });

    it('文件名包含 % 符号应正常处理', async () => {
      const text = '![percent](dataset/team1/50%off.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/50%off.png');
    });

    it('文件名包含 + 符号应正常处理', async () => {
      const text = '![plus](dataset/team1/a+b.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/a+b.png');
    });

    it('文件名包含 = 符号应正常处理', async () => {
      const text = '![equals](dataset/team1/x=1.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/x=1.png');
    });

    // 多个点号
    it('文件名包含多个点号应正常处理', async () => {
      const text = '![dots](dataset/team1/file.name.v1.2.3.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/file.name.v1.2.3.png');
    });

    // 空格相关
    it('alt 文本包含空格应正常处理', async () => {
      const text = '![image with spaces](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[image with spaces\]\(https:\/\/example\.com/);
    });

    it('文件名包含 URL 编码的空格 %20 应正常处理', async () => {
      const text = '![encoded](dataset/team1/file%20name.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/file%20name.png');
    });

    // 括号类字符
    it('alt 文本包含转义方括号不匹配正则，不做替换', async () => {
      // 由于 markdown 正则 [^\]]* 不匹配包含 ] 的 alt 文本，这种情况不会被替换
      const text = '![image \\[1\\]](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      // 预期不做替换
      expect(result).toBe(text);
    });

    it('alt 文本包含圆括号应正常处理', async () => {
      const text = '![image (1)](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
    });

    it('文件名包含花括号应正常处理', async () => {
      const text = '![braces](dataset/team1/file{1}.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/file{1}.png');
    });

    it('文件名包含方括号应正常处理', async () => {
      const text = '![braces](dataset/team1/file[1].png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/file[1].png');
    });

    // 引号
    it('alt 文本包含单引号应正常处理', async () => {
      const text = "![it's a test](dataset/team1/file.png)";
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[it's a test\]\(https:\/\/example\.com/);
    });

    it('alt 文本包含双引号应正常处理', async () => {
      const text = '![say "hello"](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
    });

    // 反斜杠
    it('alt 文本包含反斜杠应正常处理', async () => {
      const text = '![path\\to\\file](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
    });

    // 特殊 markdown 字符
    it('alt 文本包含星号应正常处理', async () => {
      const text = '![*important*](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[\*important\*\]\(https:\/\/example\.com/);
    });

    it('alt 文本包含下划线强调应正常处理', async () => {
      const text = '![_emphasis_](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[_emphasis_\]\(https:\/\/example\.com/);
    });

    it('alt 文本包含反引号应正常处理', async () => {
      const text = '![`code`](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[`code`\]\(https:\/\/example\.com/);
    });

    // 数字和字母混合
    it('文件名是纯 UUID 格式应正常处理', async () => {
      const text = '![uuid](dataset/team1/550e8400-e29b-41d4-a716-446655440000.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain(
        'mock-short-link-dataset/team1/550e8400-e29b-41d4-a716-446655440000.png'
      );
    });

    it('文件名是纯数字应正常处理', async () => {
      const text = '![numbers](dataset/team1/123456789.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/123456789.png');
    });

    // 超长文件名
    it('超长文件名应正常处理', async () => {
      const longName = 'a'.repeat(200);
      const text = `![long](dataset/team1/${longName}.png)`;
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain(`mock-short-link-dataset/team1/${longName}.png`);
    });

    // 阿拉伯文和希伯来文（RTL 文字）
    it('文件名包含阿拉伯文应正常处理', async () => {
      const text = '![عربي](dataset/team1/ملف.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/ملف.png');
    });

    // 俄文
    it('文件名包含俄文应正常处理', async () => {
      const text = '![русский](dataset/team1/файл.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/файл.png');
    });

    // 泰文
    it('文件名包含泰文应正常处理', async () => {
      const text = '![ไทย](dataset/team1/ไฟล์.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/ไฟล์.png');
    });

    // 特殊扩展名
    it('无扩展名的文件应正常处理', async () => {
      const text = '![noext](dataset/team1/README)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/README');
    });

    it('双扩展名的文件应正常处理', async () => {
      const text = '![tarball](dataset/team1/archive.tar.gz)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/archive.tar.gz');
    });

    // 管道符和其他 shell 特殊字符
    it('文件名包含管道符应正常处理', async () => {
      const text = '![pipe](dataset/team1/a|b.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/a|b.png');
    });

    it('文件名包含波浪号应正常处理', async () => {
      const text = '![tilde](dataset/team1/~user.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/~user.png');
    });

    it('文件名包含 & 符号应正常处理', async () => {
      const text = '![ampersand](dataset/team1/a&b.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/a&b.png');
    });

    // 换行符
    it('alt 文本不包含换行符时应正常处理', async () => {
      const text = '![single line](dataset/team1/file.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
    });

    // 特殊组合
    it('文件名包含多种特殊字符组合应正常处理', async () => {
      const text = '![complex](dataset/team1/file_v1.2-beta@test#1$100%off.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/file_v1.2-beta@test#1$100%off.png');
    });

    it('中英文混合 alt 和文件名应正常处理', async () => {
      const text = '![测试image图片](dataset/team1/test测试file文件.png)';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-short-link-dataset/team1/test测试file文件.png');
    });
  });

  // 测试链接格式边界情况
  describe('链接格式边界情况', () => {
    it('链接中有空格应正常处理', async () => {
      const text = '![image](  dataset/team1/collection1/image.png  )';
      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/d/mock-short-link-');
    });

    it('混合文本和链接应只替换 S3 链接', async () => {
      const text = `# 标题

普通段落文字 ![S3图片](dataset/team1/file.png) 后续文字

[普通链接](https://google.com)

\`\`\`code
代码块
\`\`\``;

      const result = await replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain(
        'https://example.com/api/system/file/d/mock-short-link-dataset/team1/file.png'
      );
      expect(result).toContain('https://google.com');
      expect(result).toContain('# 标题');
    });
  });
});

describe('批量 S3 预览 URL 格式化', () => {
  const expiredTime = new Date('2025-12-31');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应跨多段文本提取并去重 key', () => {
    expect(
      new Set(
        getS3ObjectKeysFromTexts([
          '![a](dataset/team/a.png) ![a2](dataset/team/a.png)',
          '[b](chat/app/b.pdf) ![external](https://example.com/c.png)',
          '![avatar](avatar/team/avatar.png)'
        ])
      )
    ).toEqual(new Set(['dataset/team/a.png', 'chat/app/b.pdf']));
  });

  it('应提取 Markdown 与 HTML img 中的 key 并去重', () => {
    expect(
      new Set(
        getS3ObjectKeysFromTexts([
          [
            '<img alt="first" src="dataset/team/html-first.png">',
            '![second](chat/app/markdown-second.png)',
            "<IMG SRC='temp/session/html-third.png' class='preview'>",
            '<img src=dataset/team/unquoted-fourth.png>',
            '<img src="dataset/team/html-first.png">'
          ].join('\n')
        ])
      )
    ).toEqual(
      new Set([
        'dataset/team/html-first.png',
        'chat/app/markdown-second.png',
        'temp/session/html-third.png',
        'dataset/team/unquoted-fourth.png'
      ])
    );
  });

  it('提取 Markdown key 时不应把可选 title 当作对象键', () => {
    expect(
      getS3ObjectKeysFromTexts([
        '![quoted](dataset/team/quoted.png "quoted title")',
        '[parenthesized](dataset/team/parenthesized.png (parenthesized title))'
      ])
    ).toEqual(['dataset/team/quoted.png', 'dataset/team/parenthesized.png']);
  });

  it('应忽略 HTML img 中的外部 URL、data URL、非白名单 key 和 data-src', () => {
    expect(
      getS3ObjectKeysFromTexts([
        [
          '<img src="https://example.com/image.png">',
          '<img src="data:image/png;base64,abc">',
          '<img src="avatar/team/avatar.png">',
          '<img data-src="dataset/team/lazy.png">'
        ].join('\n')
      ])
    ).toEqual([]);
  });

  it('应只读取 HTML img 的 src 属性，不读取其他属性中的 src 文本', () => {
    const text = [
      '<img alt="description src=dataset/team/fake.png" src="https://example.com/original.png">',
      '<img data-src="dataset/team/lazy.png" src="dataset/team/actual.png">'
    ].join('\n');

    expect(getS3ObjectKeysFromTexts([text])).toEqual(['dataset/team/actual.png']);

    expect(
      replaceS3KeysWithPreviewUrlMap(
        text,
        new Map([['dataset/team/actual.png', 'https://preview.test/actual']])
      )
    ).toBe(
      [
        '<img alt="description src=dataset/team/fake.png" src="https://example.com/original.png">',
        '<img data-src="dataset/team/lazy.png" src="https://preview.test/actual">'
      ].join('\n')
    );
  });

  it('应替换 HTML img src 并保留标签大小写、引号和其他属性', () => {
    const previewUrlMap = new Map([
      ['dataset/team/double.png', 'https://preview.test/double'],
      ['chat/app/single.png', 'https://preview.test/single'],
      ['temp/session/unquoted.png', 'https://preview.test/unquoted']
    ]);
    const text = [
      '<img class="double" src="dataset/team/double.png" alt="a > b">',
      "<IMG SRC='chat/app/single.png' loading='lazy'>",
      '<img src=temp/session/unquoted.png>',
      '<img data-src="dataset/team/lazy.png" src="https://example.com/original.png">'
    ].join('\n');

    expect(replaceS3KeysWithPreviewUrlMap(text, previewUrlMap)).toBe(
      [
        '<img class="double" src="https://preview.test/double" alt="a > b">',
        "<IMG SRC='https://preview.test/single' loading='lazy'>",
        '<img src="https://preview.test/unquoted">',
        '<img data-src="dataset/team/lazy.png" src="https://example.com/original.png">'
      ].join('\n')
    );
  });

  it('应在一次替换中同时处理 Markdown 和 HTML 图片', () => {
    const previewUrlMap = new Map([
      ['dataset/team/markdown.png', 'https://preview.test/markdown'],
      ['dataset/team/html.png', 'https://preview.test/html']
    ]);
    const text =
      '![markdown](dataset/team/markdown.png) <img src="dataset/team/html.png" alt="html">';

    expect(replaceS3KeysWithPreviewUrlMap(text, previewUrlMap)).toBe(
      '![markdown](https://preview.test/markdown) <img src="https://preview.test/html" alt="html">'
    );
  });

  it('预览 URL 映射为空时应直接返回原文', () => {
    const text = '![markdown](dataset/team/markdown.png)';
    expect(replaceS3KeysWithPreviewUrlMap(text, new Map())).toBe(text);
  });

  it('HTML img 应复用现有批量签发流程', async () => {
    const result = await replaceS3KeysToPreviewUrls(
      [
        '<img src="dataset/team/a.png">',
        '<img src="dataset/team/a.png"><img src="chat/app/b.png">'
      ],
      expiredTime
    );

    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0].map((item) => item.objectKey)).toEqual([
      'dataset/team/a.png',
      'chat/app/b.png'
    ]);
    expect(result).toEqual([
      '<img src="https://example.com/api/system/file/d/mock-short-link-dataset/team/a.png">',
      '<img src="https://example.com/api/system/file/d/mock-short-link-dataset/team/a.png"><img src="https://example.com/api/system/file/d/mock-short-link-chat/app/b.png">'
    ]);
  });

  it('应支持自闭合 img，并忽略无 src 或空 src 的 img', () => {
    expect(
      getS3ObjectKeysFromTexts([
        ['<img src="dataset/team/self-close.png" />', '<img alt="no-src">', '<img src="">'].join(
          '\n'
        )
      ])
    ).toEqual(['dataset/team/self-close.png']);
  });

  it('没有可预览 key 时不应发起 S3 请求', async () => {
    const texts = ['plain text', '<img src="https://example.com/image.png">'];

    await expect(replaceS3KeysToPreviewUrls(texts, expiredTime)).resolves.toEqual(texts);
    expect(mockCreateS3DownloadAccessUrls).not.toHaveBeenCalled();
  });

  it('创建预览 URL 映射时应去重输入 key', async () => {
    const result = await createS3KeysPreviewUrlMap({
      objectKeys: ['dataset/team/a.png', 'dataset/team/a.png', 'chat/app/b.pdf'],
      expiredTime
    });

    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0]).toHaveLength(2);
    expect(result.size).toBe(2);
    expect(result.get('dataset/team/a.png')).toContain('mock-short-link-dataset/team/a.png');
    expect(result.get('chat/app/b.pdf')).toContain('mock-short-link-chat/app/b.pdf');
  });

  it('多段文本中的重复 key 应只进入一次批量签发', async () => {
    const result = await replaceS3KeysToPreviewUrls(
      ['first ![a](dataset/team/a.png)', 'second [same](dataset/team/a.png) [b](chat/app/b.pdf)'],
      expiredTime
    );

    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(
      new Set(mockCreateS3DownloadAccessUrls.mock.calls[0][0].map((item) => item.objectKey))
    ).toEqual(new Set(['dataset/team/a.png', 'chat/app/b.pdf']));
    expect(result).toEqual([
      'first ![a](https://example.com/api/system/file/d/mock-short-link-dataset/team/a.png)',
      'second [same](https://example.com/api/system/file/d/mock-short-link-dataset/team/a.png) [b](https://example.com/api/system/file/d/mock-short-link-chat/app/b.pdf)'
    ]);
  });

  it('超过批量上限时应分片且完整返回映射', async () => {
    const objectKeys = Array.from({ length: 501 }, (_, index) => `dataset/team/${index}.png`);
    const result = await createS3KeysPreviewUrlMap({ objectKeys, expiredTime });

    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(2);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0]).toHaveLength(500);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[1][0]).toHaveLength(1);
    expect(result.get('dataset/team/500.png')).toContain('mock-short-link-dataset/team/500.png');
  });
});
