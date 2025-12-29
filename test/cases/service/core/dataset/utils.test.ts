import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replaceS3KeyToPreviewUrl } from '@fastgpt/service/core/dataset/utils';

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  jwtSignS3ObjectKey: vi.fn(
    (objectKey: string) => `https://example.com/api/system/file/mock-jwt-token-${objectKey}`
  ),
  isS3ObjectKey: vi.fn((key: string, source: string) => {
    if (!key) return false;
    return key.startsWith(`${source}/`);
  })
}));

vi.mock('@fastgpt/service/common/s3/type', () => ({
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
    it('空字符串应返回空字符串', () => {
      const result = replaceS3KeyToPreviewUrl('', expiredTime);
      expect(result).toBe('');
    });

    it('null 应返回 null', () => {
      const result = replaceS3KeyToPreviewUrl(null as unknown as string, expiredTime);
      expect(result).toBe(null);
    });

    it('undefined 应返回 undefined', () => {
      const result = replaceS3KeyToPreviewUrl(undefined as unknown as string, expiredTime);
      expect(result).toBe(undefined);
    });

    it('非字符串类型应原样返回', () => {
      const result = replaceS3KeyToPreviewUrl(123 as unknown as string, expiredTime);
      expect(result).toBe(123);
    });
  });

  // 测试不包含 S3 链接的普通文本
  describe('普通文本处理', () => {
    it('纯文本不做任何替换', () => {
      const text = '这是一段普通文本，不包含任何图片链接';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toBe(text);
    });

    it('普通 HTTP 链接不做替换', () => {
      const text = '![image](https://example.com/image.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toBe(text);
    });

    it('普通 markdown 链接不做替换', () => {
      const text = '[链接文本](https://example.com/page)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toBe(text);
    });
  });

  // 测试 dataset 前缀的 S3 链接替换
  describe('dataset S3 链接替换', () => {
    it('应替换 dataset 图片链接', () => {
      const text =
        '![image.png](dataset/68fee42e1d416bb5ddc85b19/6901c3071ba2bea567e8d8db/aZos7D-214afce5-4d42-4356-9e05-8164d51c59ae.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
      expect(result).toContain('dataset/68fee42e1d416bb5ddc85b19');
      expect(result).toMatch(/!\[image\.png\]\(https:\/\/example\.com/);
    });

    it('应替换 dataset 普通链接（非图片）', () => {
      const text = '[文档](dataset/68fee42e1d416bb5ddc85b19/6901c3071ba2bea567e8d8db/document.pdf)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
      expect(result).toMatch(/\[文档\]\(https:\/\/example\.com/);
    });
  });

  // 测试 chat 前缀的 S3 链接替换
  describe('chat S3 链接替换', () => {
    it('应替换 chat 图片链接', () => {
      const text =
        '![screenshot.png](chat/691ae29d404d0468717dd747/68ad85a7463006c96379a07/jXfXy8yfGAFs9WJpcWRbAhV2/parsed/9a0f4fed-4edf-4613-a8d6-533af5ae51dc.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
      expect(result).toContain('chat/691ae29d404d0468717dd747');
    });
  });

  // 测试多个链接替换
  describe('多个链接替换', () => {
    it('应正确替换多个 S3 链接', () => {
      const text = `这是一段包含多个图片的文本：
![图片1](dataset/team1/collection1/image1.png)
一些中间文字
![图片2](chat/app1/user1/chat1/image2.jpg)
更多文字
![外部图片](https://external.com/image3.png)`;

      const result = replaceS3KeyToPreviewUrl(text, expiredTime);

      // dataset 和 chat 链接应被替换
      expect(result).toContain('mock-jwt-token-dataset/team1/collection1/image1.png');
      expect(result).toContain('mock-jwt-token-chat/app1/user1/chat1/image2.jpg');
      // 外部链接不应被替换
      expect(result).toContain('https://external.com/image3.png');
    });
  });

  // 测试不支持的 S3 前缀
  describe('不支持的 S3 前缀', () => {
    it('avatar 前缀不应被替换（只支持 dataset 和 chat）', () => {
      const text = '![头像](avatar/team1/user-avatar.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      // avatar 的 isS3ObjectKey 返回 false（因为只检查 dataset 和 chat）
      expect(result).toBe(text);
    });

    it('temp 前缀不应被替换', () => {
      const text = '![临时文件](temp/team1/temp-file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toBe(text);
    });
  });

  // 测试特殊字符处理
  describe('特殊字符处理', () => {
    // 中文字符
    it('文件名包含中文应正常处理', () => {
      const text = '![中文图片名.png](dataset/team1/collection1/中文文件名.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
    });

    it('alt 文本为空应正常处理', () => {
      const text = '![](dataset/team1/collection1/no-alt.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[\]\(https:\/\/example\.com/);
    });

    // 日韩文字符
    it('文件名包含日文应正常处理', () => {
      const text = '![日本語ファイル](dataset/team1/日本語テスト.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/日本語テスト.png');
    });

    it('文件名包含韩文应正常处理', () => {
      const text = '![한국어](dataset/team1/한국어파일.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/한국어파일.png');
    });

    // Emoji 表情符号
    it('文件名包含 emoji 应正常处理', () => {
      const text = '![🎉 celebration](dataset/team1/🎉emoji🚀test.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/🎉emoji🚀test.png');
    });

    it('alt 文本包含多个 emoji 应正常处理', () => {
      const text = '![🔥💯🎯](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[🔥💯🎯\]\(https:\/\/example\.com/);
    });

    // 特殊符号
    it('文件名包含下划线和连字符应正常处理', () => {
      const text = '![image](dataset/team1/my_file-name_v2.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/my_file-name_v2.png');
    });

    it('文件名包含 @ 符号应正常处理', () => {
      const text = '![email](dataset/team1/user@example.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/user@example.png');
    });

    it('文件名包含 # 符号应正常处理', () => {
      const text = '![hash](dataset/team1/file#1.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/file#1.png');
    });

    it('文件名包含 $ 符号应正常处理', () => {
      const text = '![dollar](dataset/team1/price$100.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/price$100.png');
    });

    it('文件名包含 % 符号应正常处理', () => {
      const text = '![percent](dataset/team1/50%off.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/50%off.png');
    });

    it('文件名包含 + 符号应正常处理', () => {
      const text = '![plus](dataset/team1/a+b.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/a+b.png');
    });

    it('文件名包含 = 符号应正常处理', () => {
      const text = '![equals](dataset/team1/x=1.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/x=1.png');
    });

    // 多个点号
    it('文件名包含多个点号应正常处理', () => {
      const text = '![dots](dataset/team1/file.name.v1.2.3.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/file.name.v1.2.3.png');
    });

    // 空格相关
    it('alt 文本包含空格应正常处理', () => {
      const text = '![image with spaces](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[image with spaces\]\(https:\/\/example\.com/);
    });

    it('文件名包含 URL 编码的空格 %20 应正常处理', () => {
      const text = '![encoded](dataset/team1/file%20name.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/file%20name.png');
    });

    // 括号类字符
    it('alt 文本包含转义方括号不匹配正则，不做替换', () => {
      // 由于 markdown 正则 [^\]]* 不匹配包含 ] 的 alt 文本，这种情况不会被替换
      const text = '![image \\[1\\]](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      // 预期不做替换
      expect(result).toBe(text);
    });

    it('alt 文本包含圆括号应正常处理', () => {
      const text = '![image (1)](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
    });

    it('文件名包含花括号应正常处理', () => {
      const text = '![braces](dataset/team1/file{1}.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/file{1}.png');
    });

    it('文件名包含方括号应正常处理', () => {
      const text = '![braces](dataset/team1/file[1].png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/file[1].png');
    });

    // 引号
    it('alt 文本包含单引号应正常处理', () => {
      const text = "![it's a test](dataset/team1/file.png)";
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[it's a test\]\(https:\/\/example\.com/);
    });

    it('alt 文本包含双引号应正常处理', () => {
      const text = '![say "hello"](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
    });

    // 反斜杠
    it('alt 文本包含反斜杠应正常处理', () => {
      const text = '![path\\to\\file](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
    });

    // 特殊 markdown 字符
    it('alt 文本包含星号应正常处理', () => {
      const text = '![*important*](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[\*important\*\]\(https:\/\/example\.com/);
    });

    it('alt 文本包含下划线强调应正常处理', () => {
      const text = '![_emphasis_](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[_emphasis_\]\(https:\/\/example\.com/);
    });

    it('alt 文本包含反引号应正常处理', () => {
      const text = '![`code`](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toMatch(/!\[`code`\]\(https:\/\/example\.com/);
    });

    // 数字和字母混合
    it('文件名是纯 UUID 格式应正常处理', () => {
      const text = '![uuid](dataset/team1/550e8400-e29b-41d4-a716-446655440000.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain(
        'mock-jwt-token-dataset/team1/550e8400-e29b-41d4-a716-446655440000.png'
      );
    });

    it('文件名是纯数字应正常处理', () => {
      const text = '![numbers](dataset/team1/123456789.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/123456789.png');
    });

    // 超长文件名
    it('超长文件名应正常处理', () => {
      const longName = 'a'.repeat(200);
      const text = `![long](dataset/team1/${longName}.png)`;
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain(`mock-jwt-token-dataset/team1/${longName}.png`);
    });

    // 阿拉伯文和希伯来文（RTL 文字）
    it('文件名包含阿拉伯文应正常处理', () => {
      const text = '![عربي](dataset/team1/ملف.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/ملف.png');
    });

    // 俄文
    it('文件名包含俄文应正常处理', () => {
      const text = '![русский](dataset/team1/файл.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/файл.png');
    });

    // 泰文
    it('文件名包含泰文应正常处理', () => {
      const text = '![ไทย](dataset/team1/ไฟล์.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/ไฟล์.png');
    });

    // 特殊扩展名
    it('无扩展名的文件应正常处理', () => {
      const text = '![noext](dataset/team1/README)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/README');
    });

    it('双扩展名的文件应正常处理', () => {
      const text = '![tarball](dataset/team1/archive.tar.gz)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/archive.tar.gz');
    });

    // 管道符和其他 shell 特殊字符
    it('文件名包含管道符应正常处理', () => {
      const text = '![pipe](dataset/team1/a|b.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/a|b.png');
    });

    it('文件名包含波浪号应正常处理', () => {
      const text = '![tilde](dataset/team1/~user.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/~user.png');
    });

    it('文件名包含 & 符号应正常处理', () => {
      const text = '![ampersand](dataset/team1/a&b.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/a&b.png');
    });

    // 换行符
    it('alt 文本不包含换行符时应正常处理', () => {
      const text = '![single line](dataset/team1/file.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
    });

    // 特殊组合
    it('文件名包含多种特殊字符组合应正常处理', () => {
      const text = '![complex](dataset/team1/file_v1.2-beta@test#1$100%off.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/file_v1.2-beta@test#1$100%off.png');
    });

    it('中英文混合 alt 和文件名应正常处理', () => {
      const text = '![测试image图片](dataset/team1/test测试file文件.png)';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);
      expect(result).toContain('mock-jwt-token-dataset/team1/test测试file文件.png');
    });
  });

  // 测试链接格式边界情况
  describe('链接格式边界情况', () => {
    it('链接中有空格应正常处理', () => {
      const text = '![image](  dataset/team1/collection1/image.png  )';
      const result = replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain('https://example.com/api/system/file/mock-jwt-token-');
    });

    it('混合文本和链接应只替换 S3 链接', () => {
      const text = `# 标题

普通段落文字 ![S3图片](dataset/team1/file.png) 后续文字

[普通链接](https://google.com)

\`\`\`code
代码块
\`\`\``;

      const result = replaceS3KeyToPreviewUrl(text, expiredTime);

      expect(result).toContain(
        'https://example.com/api/system/file/mock-jwt-token-dataset/team1/file.png'
      );
      expect(result).toContain('https://google.com');
      expect(result).toContain('# 标题');
    });
  });
});
