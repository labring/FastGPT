import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { ChatFileTypeEnum as FileType } from '@fastgpt/global/core/chat/constants';
import { axios } from '@fastgpt/service/common/api/axios';
import {
  parseUrlToChatFileType,
  prepareChatFiles,
  validateChatFileInput,
  type PreparedChatFile
} from '@fastgpt/service/core/chat/file/service';

const url = 'https://files.example.com/download';

/** 用内存登记表实现 Context 合约；只记录登记调用，不替换分类和身份计算。 */
const createContext = () => {
  const files = new Map<string, PreparedChatFile>();
  const context = {
    resolveChatFile: (url: string) => files.get(url),
    getIdentity: (url: string) => (files.has(url) ? `registered:${url}` : undefined),
    registerExternalFile: vi.fn((file: PreparedChatFile) => {
      files.set(file.url, file);
      return { name: file.name || 'file', type: file.type, modelUrl: file.url };
    })
  };
  return { context, files };
};

let savedEnv: typeof global.systemEnv;
beforeEach(() => {
  savedEnv = global.systemEnv;
  global.systemEnv = { ...savedEnv, fileUrlWhitelist: [] };
  vi.spyOn(axios, 'head').mockResolvedValue({ headers: { 'content-type': 'image/png' } });
  vi.spyOn(axios, 'get').mockImplementation(async () => ({
    headers: {},
    data: Readable.from([]),
    status: 200
  }));
});
afterEach(() => {
  global.systemEnv = savedEnv;
  vi.restoreAllMocks();
});

describe('parseUrlToChatFileType', () => {
  it.each(['/api/system/file/d/', '/f/', '/'])(
    '短链 %s 使用响应元数据分类，不把签名中的点号当成文件后缀',
    async (prefix) => {
      const shortUrl = `https://files.example.com${prefix}workflowFileAlias.hscf3.ExampleSignatureValue1234`;
      vi.mocked(axios.head).mockResolvedValueOnce({
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': 'inline; filename="test_file.txt"'
        }
      });

      expect(
        await parseUrlToChatFileType({ url: shortUrl, name: shortUrl, type: FileType.file })
      ).toEqual({
        url: shortUrl,
        name: shortUrl,
        type: FileType.file,
        filename: 'test_file.txt'
      });
      expect(axios.head).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['data:IMAGE/PNG;base64,abc', undefined, FileType.image, 'image.png'],
    ['data:image/jpeg;base64,abc', '头像', FileType.image, '头像'],
    ['chat/nested/photo.jpg', undefined, FileType.image, 'photo.jpg'],
    ['chat/report.pdf', undefined, FileType.file, 'report.pdf'],
    ['/static/my.file.PNG', undefined, FileType.image, 'my.file.PNG'],
    ['http://files.example.com/a.mp3?token=1#part', undefined, FileType.audio, 'a.mp3'],
    [`${url}.mp4`, undefined, FileType.video, 'download.mp4'],
    [`${url}.pdf`, '报告', FileType.file, '报告'],
    [`${url}.png?filename=report.pdf`, undefined, FileType.file, 'report.pdf'],
    [`${url}.png?filename=`, undefined, FileType.image, 'download.png'],
    ['https://files.example.com/file%20name.jpg', undefined, FileType.image, 'file name.jpg'],
    ['https://files.example.com/record%2Emp3?token=1', undefined, FileType.audio, 'record.mp3'],
    [
      'https://files.example.com/literal%2520name.pdf',
      undefined,
      FileType.file,
      'literal%20name.pdf'
    ],
    [`${url}?filename=literal%2520name.pdf`, undefined, FileType.file, 'literal%20name.pdf'],
    ['relative', undefined, FileType.file, 'relative'],
    ['http://[invalid', '保留名称', FileType.file, '保留名称'],
    ['chat/%invalid.png', undefined, FileType.file, 'chat/%invalid.png']
  ])('本地分类和名称规则：%s', async (url, name, type, expectedName) => {
    expect(await parseUrlToChatFileType({ url, name })).toEqual({ url, name: expectedName, type });
    expect(axios.head).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123, 'data:invalid', 'data:application/pdf;base64,abc'])(
    '忽略不可分类的输入 %s',
    async (url) => {
      // @ts-expect-error 验证未经过类型边界的运行时输入。
      expect(await parseUrlToChatFileType({ url })).toBeUndefined();
      expect(axios.head).not.toHaveBeenCalled();
    }
  );

  it.each([
    [`${url}.php?id=42`, 'download.php'],
    [`${url}.BIN#fragment`, 'download.BIN'],
    [`${url}.?token=signed`, 'download.'],
    [`${url}?filename=LICENSE`, 'LICENSE'],
    [`${url}?filename=report.unknown`, 'report.unknown'],
    [`${url}.png?filename=unknown`, 'unknown']
  ])('链接已有文件名时未知后缀也不探测：%s', async (url, name) => {
    expect(await parseUrlToChatFileType({ url, type: FileType.file })).toEqual({
      url,
      name,
      type: FileType.file
    });
    expect(axios.head).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('目录和显式显示名称的后缀不能替代链接自身的文件名', async () => {
    const inputUrl = 'https://files.example.com/path.with.dots/download';
    expect(
      await parseUrlToChatFileType({ url: inputUrl, name: 'display.php', type: FileType.file })
    ).toEqual({
      url: inputUrl,
      name: 'display.php',
      type: FileType.image,
      filename: 'download.png'
    });
    expect(axios.head).toHaveBeenCalledTimes(1);
  });

  it('空白 filename 参数不阻止无文件名链接探测', async () => {
    const inputUrl = `${url}?filename=%20%20`;
    expect(await parseUrlToChatFileType({ url: inputUrl })).toEqual({
      url: inputUrl,
      name: inputUrl,
      type: FileType.image,
      filename: 'file.png'
    });
    expect(axios.head).toHaveBeenCalledTimes(1);
  });

  it.each([
    [FileType.video, { contentType: 'audio/mpeg', filename: 'photo.png' }, FileType.video],
    [
      FileType.file,
      { contentType: 'AUDIO/MPEG; charset=binary', filename: 'photo.png' },
      FileType.audio
    ],
    [undefined, { contentType: 'video/mp4' }, FileType.video],
    [undefined, { contentType: 'image/png' }, FileType.image],
    [undefined, { filename: 'photo.PNG' }, FileType.image],
    [undefined, { filename: 'unknown', contentType: 'application/octet-stream' }, FileType.video]
  ])(
    '类型优先级：显式媒体 > 对象 MIME > 对象名称 > URL 后缀（%s, %j）',
    async (type, metadata, expected) => {
      expect((await parseUrlToChatFileType({ url: 'chat/object.mp4', type, metadata }))?.type).toBe(
        expected
      );
      expect(axios.head).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['image/png', FileType.image, 'download.png'],
    ['audio/mpeg', FileType.audio, 'download.mpga'],
    ['video/mp4', FileType.video, 'download.mp4'],
    ['application/pdf', FileType.file, 'report.pdf'],
    [undefined, FileType.file, 'download']
  ])('未知链接使用系统推测 MIME %s，普通 file 提示不阻止探测', async (mime, expected, filename) => {
    vi.mocked(axios.head).mockResolvedValueOnce({
      headers: {
        'content-type': mime,
        ...(mime === 'application/pdf'
          ? { 'content-disposition': 'attachment; filename="report.pdf"' }
          : {})
      }
    });
    expect(await parseUrlToChatFileType({ url, type: FileType.file })).toEqual({
      url,
      name: url,
      ...(filename ? { filename } : {}),
      type: expected
    });
    expect(axios.head).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        __safeAxios: { validateUrl: expect.any(Function) }
      })
    );
  });

  it.each(['success', 'failure'] as const)(
    '同 Context 复用并发及已完成的 %s 探测，显示名称和显式类型不缓存，探测文件名可复用',
    async (outcome) => {
      if (outcome === 'failure') vi.mocked(axios.head).mockRejectedValue(new Error('offline'));
      const { context, files } = createContext();
      const expected = outcome === 'success' ? FileType.image : FileType.file;
      const results = await Promise.all(
        ['first', 'second'].map((name) =>
          parseUrlToChatFileType({ url: `${url}#${name}`, name, fileContext: context })
        )
      );
      expect(results.map((file) => [file?.name, file?.type])).toEqual([
        ['first', expected],
        ['second', expected]
      ]);
      const filename = outcome === 'success' ? 'download.png' : undefined;
      expect(results.map((file) => file?.filename)).toEqual([filename, filename]);
      expect(await parseUrlToChatFileType({ url, fileContext: context })).toEqual({
        url,
        name: url,
        type: expected,
        ...(filename ? { filename } : {})
      });
      expect(
        (await parseUrlToChatFileType({ url, type: FileType.audio, fileContext: context }))?.type
      ).toBe(FileType.audio);
      expect(axios.head).toHaveBeenCalledTimes(1);
      expect(files.size).toBe(0);
      expect(context.registerExternalFile).not.toHaveBeenCalled();
      await parseUrlToChatFileType({ url: `${url}?signature=other`, fileContext: context });
      await parseUrlToChatFileType({ url, fileContext: createContext().context });
      expect(axios.head).toHaveBeenCalledTimes(3);
    }
  );

  it('已登记结果优先于冲突提示，包括探测期间完成的登记', async () => {
    const { context, files } = createContext();
    let finish!: () => void;
    vi.mocked(axios.head).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { headers: { 'content-type': 'image/png' } };
    });
    const pending = parseUrlToChatFileType({ url, fileContext: context });
    await vi.waitFor(() => expect(finish).toBeDefined());
    const registered = { url, name: '录音', type: FileType.audio };
    files.set(url, registered);
    finish();
    expect(await pending).toBe(registered);
    expect(await parseUrlToChatFileType({ url, type: FileType.video, fileContext: context })).toBe(
      registered
    );
    expect(axios.head).toHaveBeenCalledTimes(1);
  });

  it('分类被域名策略拒绝的未知链接时不探测', async () => {
    global.systemEnv.fileUrlWhitelist = ['allowed.example.com'];
    expect((await parseUrlToChatFileType({ url }))?.type).toBe(FileType.file);
    expect(axios.head).not.toHaveBeenCalled();
  });
});

describe('validateChatFileInput', () => {
  it.each([
    [url, false, true],
    ['/relative.pdf', false, false],
    ['data:image/png;base64,abc', false, false],
    ['data:image/png;base64,abc', true, true]
  ])('准入 %s（allowDataUrl=%s）', (url, allowDataUrl, expected) => {
    expect(validateChatFileInput({ url, allowDataUrl })).toBe(expected);
  });

  it('已登记签名域名可用，但不能放行其他被阻止的文件', () => {
    global.systemEnv.fileUrlWhitelist = ['allowed.example.com'];
    const { context, files } = createContext();
    files.set(url, { url, name: '报告', type: FileType.file });
    expect(validateChatFileInput({ url, fileContext: context })).toBe(true);
    expect(() => validateChatFileInput({ url: `${url}/other`, fileContext: context })).toThrow(
      'Invalid file URL domain'
    );
    expect(axios.head).not.toHaveBeenCalled();
  });
});

describe('prepareChatFiles', () => {
  it('清理空输入，按 Context 身份去重并在校验、探测、登记前截断', async () => {
    global.systemEnv.fileUrlWhitelist = ['files.example.com'];
    const { context } = createContext();
    context.getIdentity = (input) => (input.includes('/alias') ? 'same-object' : undefined);
    const result = await prepareChatFiles({
      files: [
        { url: '' },
        { url: '   ' },
        // @ts-expect-error 验证非法运行时输入被过滤。
        { url: 123 },
        { url: `${url}/alias-one ` },
        { url: `${url}/alias-two` },
        { url: `${url}#one` },
        { url: `${url}#two` },
        { url: 'https://blocked.example.com/excess' }
      ],
      maxFiles: 2,
      fileContext: context
    });
    expect(result.map((file) => file.url)).toEqual([`${url}/alias-one`, `${url}#one`]);
    expect(axios.head).toHaveBeenCalledTimes(2);
    expect(context.registerExternalFile).toHaveBeenCalledTimes(2);
    await expect(
      prepareChatFiles({
        files: [{ url: 'https://blocked.example.com/rejected' }],
        maxFiles: 1,
        fileContext: context
      })
    ).rejects.toThrow('Invalid file URL domain');
    expect(context.registerExternalFile).toHaveBeenCalledTimes(2);
  });

  it('使用登记器返回的最终名称、类型和模型 URL，已有 Ref 不重复登记', async () => {
    const { context, files } = createContext();
    const registered = { url: `${url}/signed`, name: '已授权', type: FileType.audio };
    files.set(registered.url, registered);
    context.registerExternalFile.mockReturnValueOnce({
      name: '最终名称',
      type: FileType.video,
      modelUrl: `${url}/model`
    });
    expect(
      await prepareChatFiles({
        files: [{ url }, { url: registered.url, type: FileType.image }],
        maxFiles: 2,
        fileContext: context
      })
    ).toEqual([{ name: '最终名称', type: FileType.video, url: `${url}/model` }, registered]);
    expect(context.registerExternalFile).toHaveBeenCalledTimes(1);
  });

  it('允许图片 Data URL 但不登记，跳过不支持的 Data URL 和相对地址', async () => {
    const { context } = createContext();
    const dataUrl = 'data:image/png;base64,abc';
    const files = [
      { url: dataUrl },
      { url: 'data:text/plain;base64,abc' },
      { url: '/relative.pdf' }
    ];
    expect(
      await prepareChatFiles({ files, maxFiles: 3, allowDataUrl: true, fileContext: context })
    ).toEqual([{ url: dataUrl, name: 'image.png', type: FileType.image }]);
    expect(context.registerExternalFile).not.toHaveBeenCalled();
    expect(await prepareChatFiles({ files, maxFiles: 3 })).toEqual([]);
    expect(axios.head).not.toHaveBeenCalled();
  });

  it('不提供登记器也能准备文件', async () => {
    expect(await prepareChatFiles({ files: [{ url }], maxFiles: 1 })).toEqual([
      { url, name: url, type: FileType.image }
    ]);
  });

  it.each([false, true])('多个独立调用共享最多 5 个探测槽（Context=%s）', async (withContext) => {
    const fileContext = withContext ? createContext().context : undefined;
    const releases: (() => void)[] = [];
    let active = 0;
    let peak = 0;
    vi.mocked(axios.head).mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return { headers: { 'content-type': 'image/png' } };
    });
    const urls = Array.from({ length: 12 }, (_, index) => `${url}/${index}`);
    const pending = Promise.all(
      urls.map((url) => prepareChatFiles({ files: [{ url }], maxFiles: 1, fileContext }))
    );
    for (const count of [5, 5, 2]) {
      await vi.waitFor(() => expect(releases).toHaveLength(count));
      releases.splice(0).forEach((release) => release());
    }
    expect((await pending).flat().map((file) => file.url)).toEqual(urls);
    expect(peak).toBe(5);
  });
});
