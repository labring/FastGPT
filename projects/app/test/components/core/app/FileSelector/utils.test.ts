import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileSelectorRenderItemType } from '@/components/core/app/FileSelector/type';
import {
  getFileSelectorDisplayIcon,
  hasFileSelectorError,
  inferFileSelectorType,
  isFileSelectorCleanValueEcho,
  isFileSelectorPreviewUrlMissing,
  isFileSelectorUploading,
  markFileSelectorUploadError,
  markFileSelectorUploading,
  markFileSelectorUploadSuccess,
  mergeFileSelectorExternalValue,
  probeFileSelectorLinkFilename,
  sanitizeFileSelectValue
} from '@/components/core/app/FileSelector/utils';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

describe('sanitizeFileSelectValue', () => {
  it('retains uploaded preview URLs only for temporary debug values', () => {
    const files = [
      {
        key: 'file-key',
        url: 'https://example.com/preview.pdf',
        name: 'file.pdf',
        type: ChatFileTypeEnum.file
      }
    ];
    expect(sanitizeFileSelectValue(files, true)).toEqual(files);
    expect(sanitizeFileSelectValue(files)[0]).not.toHaveProperty('url');
    expect(
      sanitizeFileSelectValue([{ ...files[0], url: 'data:application/pdf;base64,abc' }], true)[0]
    ).not.toHaveProperty('url');
  });
  it('清洗 S3 文件对象，移除 base64 预览和上传态字段', () => {
    expect(
      sanitizeFileSelectValue([
        {
          id: 'file-id',
          key: 'apps/app/chat/file.png',
          url: 'https://signed-url.example.com/file.png',
          name: 'file.png',
          type: ChatFileTypeEnum.image,
          icon: 'data:image/png;base64,abc',
          rawFile: new File(['file'], 'file.png'),
          process: 100,
          status: 1,
          error: 'ignored'
        }
      ])
    ).toEqual([
      {
        key: 'apps/app/chat/file.png',
        name: 'file.png',
        type: ChatFileTypeEnum.image
      }
    ]);
  });

  it('保留 URL 上传文件的 url，并兼容非 base64 字符串 URL', () => {
    expect(
      sanitizeFileSelectValue([
        {
          id: 'url-id',
          url: 'https://example.com/file.pdf',
          name: 'https://example.com/file.pdf',
          type: ChatFileTypeEnum.file,
          icon: 'common/link'
        },
        'https://example.com/legacy.pdf',
        'data:image/png;base64,abc'
      ])
    ).toEqual([
      {
        url: 'https://example.com/file.pdf',
        name: 'https://example.com/file.pdf',
        type: ChatFileTypeEnum.file
      },
      {
        url: 'https://example.com/legacy.pdf',
        name: 'https://example.com/legacy.pdf',
        type: ChatFileTypeEnum.file
      }
    ]);
  });

  it('兼容缺少 type 的历史文件对象，并按文件名推断图片类型', () => {
    expect(
      sanitizeFileSelectValue([
        {
          key: 'chat/files/image.png',
          name: 'image.png'
        },
        {
          url: 'https://example.com/report.pdf',
          name: 'report.pdf'
        },
        'https://example.com/legacy.jpg'
      ])
    ).toEqual([
      {
        key: 'chat/files/image.png',
        name: 'image.png',
        type: ChatFileTypeEnum.image
      },
      {
        url: 'https://example.com/report.pdf',
        name: 'report.pdf',
        type: ChatFileTypeEnum.file
      },
      {
        url: 'https://example.com/legacy.jpg',
        name: 'https://example.com/legacy.jpg',
        type: ChatFileTypeEnum.image
      }
    ]);
  });

  it('过滤仅存在于组件内部上传态的未完成文件', () => {
    expect(
      sanitizeFileSelectValue([
        {
          id: 'uploading',
          name: 'uploading.png',
          type: ChatFileTypeEnum.image,
          icon: 'data:image/png;base64,abc',
          rawFile: new File(['file'], 'uploading.png'),
          status: 0,
          process: 30
        }
      ])
    ).toEqual([]);
  });

  it('空数组返回空数组', () => {
    expect(sanitizeFileSelectValue([])).toEqual([]);
  });

  it('兼容历史脏数据中的 null 和 undefined 文件项', () => {
    expect(sanitizeFileSelectValue([null, undefined])).toEqual([]);
  });
});

describe('inferFileSelectorType', () => {
  it('按 URL 或文件名扩展名推断图片类型，未知类型兜底普通文件', () => {
    expect(inferFileSelectorType('https://example.com/image.png?token=1')).toBe(
      ChatFileTypeEnum.image
    );
    expect(inferFileSelectorType('report.unknown')).toBe(ChatFileTypeEnum.file);
  });
});

describe('probeFileSelectorLinkFilename', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ['https://example.com/audio.mp3?token=1', 'audio.mp3'],
    ['https://example.com/encoded%2Epdf', 'encoded.pdf'],
    ['https://example.com/download?filename=video.mp4', 'video.mp4'],
    ['https://example.com/report.unknown', 'report.unknown'],
    ['https://example.com/download?filename=opaque', 'opaque'],
    ['https://example.com/bad%.pdf', 'bad%.pdf']
  ])('链接有文件名时不请求远端：%s', async (url, filename) => {
    expect(await probeFileSelectorLinkFilename({ url, signal: new AbortController().signal })).toBe(
      filename
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['audio/mpeg', 'file.mpga'],
    [' VIDEO/MP4 ; charset=utf-8', 'file.mp4'],
    ['image/png', 'file.png'],
    ['application/pdf', 'file.pdf'],
    ['text/plain', 'file.txt'],
    ['application/octet-stream', undefined],
    ['', undefined]
  ])('HEAD 复用 MIME 库推断文件后缀：%s', async (contentType, filename) => {
    fetchMock.mockResolvedValue(new Response(null, { headers: { 'Content-Type': contentType } }));
    const url = 'https://example.com/directory.pdf/opaque?filename=';
    expect(await probeFileSelectorLinkFilename({ url, signal: new AbortController().signal })).toBe(
      filename
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(url, {
      method: 'HEAD',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: expect.any(AbortSignal)
    });
  });

  it.each(['', '/relative', 'not a URL', 'data:audio/wav;base64,abc', 'ftp://example.com/audio'])(
    '非 HTTP(S) 链接不探测：%s',
    async (url) => {
      expect(
        await probeFileSelectorLinkFilename({ url, signal: new AbortController().signal })
      ).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['', 'attachment; filename="report.pdf"', 'report.pdf'],
    ['application/octet-stream', 'attachment; filename="report.docx"', 'report.docx'],
    ['application/pdf', 'attachment; filename="recording.mp3"', 'file.pdf']
  ])('复用响应文件名解析，明确 MIME 优先：%s / %s', async (contentType, disposition, filename) => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: { 'Content-Type': contentType, 'Content-Disposition': disposition }
      })
    );
    expect(
      await probeFileSelectorLinkFilename({
        url: 'https://example.com/opaque',
        signal: new AbortController().signal
      })
    ).toBe(filename);
  });

  it.each([
    ['audio/ogg', 'file/fill/audio'],
    ['audio/aac', 'file/fill/audio'],
    ['video/quicktime', 'file/fill/video'],
    ['image/avif', 'image'],
    ['image/heic', 'image']
  ])('HEAD 后缀交给公共图标函数，媒体别名不降级：%s', async (contentType, icon) => {
    fetchMock.mockResolvedValue(new Response(null, { headers: { 'Content-Type': contentType } }));
    const filename = await probeFileSelectorLinkFilename({
      url: 'https://example.com/opaque',
      signal: new AbortController().signal
    });
    expect(getFileIcon(filename)).toBe(icon);
  });

  it.each([new TypeError('Failed to fetch'), new DOMException('Aborted', 'AbortError')])(
    'fetch 拒绝时静默返回：%s',
    async (error) => {
      fetchMock.mockRejectedValue(error);
      expect(
        await probeFileSelectorLinkFilename({
          url: 'https://example.com/opaque',
          signal: new AbortController().signal
        })
      ).toBeUndefined();
    }
  );

  it('HTTP 失败静默返回', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 405 }));
    expect(
      await probeFileSelectorLinkFilename({
        url: 'https://example.com/opaque',
        signal: new AbortController().signal
      })
    ).toBeUndefined();
  });

  it.each(['timeout', 'cancel'] as const)('%s 会中止 HEAD 并清理定时器和监听', async (mode) => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = probeFileSelectorLinkFilename({
      url: 'https://example.com/opaque',
      signal: controller.signal
    });
    if (mode === 'timeout') await vi.advanceTimersByTimeAsync(3000);
    else controller.abort();
    expect(await pending).toBeUndefined();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(mode === 'cancel');
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('已取消的请求不发起网络访问', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await probeFileSelectorLinkFilename({
        url: 'https://example.com/opaque',
        signal: controller.signal
      })
    ).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'cancel'] as const)('%s 后迟到的成功响应不更新图标', async (mode) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let complete: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    const pending = probeFileSelectorLinkFilename({
      url: 'https://example.com/opaque',
      signal: controller.signal
    });
    if (mode === 'timeout') await vi.advanceTimersByTimeAsync(3000);
    else controller.abort();
    complete(new Response(null, { headers: { 'Content-Type': 'audio/wav' } }));
    expect(await pending).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fetch 同步抛错或响应头读取抛错时仍静默返回', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('Blocked fetch');
    });
    expect(
      await probeFileSelectorLinkFilename({
        url: 'https://example.com/opaque',
        signal: new AbortController().signal
      })
    ).toBeUndefined();
    const response = new Response(null);
    vi.spyOn(response.headers, 'get').mockImplementation(() => {
      throw new Error('Unreadable headers');
    });
    fetchMock.mockResolvedValue(response);
    expect(
      await probeFileSelectorLinkFilename({
        url: 'https://example.com/opaque',
        signal: new AbortController().signal
      })
    ).toBeUndefined();
  });
});

describe('FileSelector upload state', () => {
  it('仅在存在上传错误时阻止表单提交', () => {
    expect(hasFileSelectorError([{ error: 'upload failed' }, {}])).toBe(true);
    expect(hasFileSelectorError([{}, { error: '' }])).toBe(false);
  });

  it('外部空值刷新时保留本地上传中和失败文件', () => {
    const uploadingFile: FileSelectorRenderItemType = {
      id: 'uploading',
      name: 'uploading.pdf',
      type: ChatFileTypeEnum.file,
      rawFile: new File(['file'], 'uploading.pdf'),
      status: 1,
      process: 30
    };
    const failedFile: FileSelectorRenderItemType = {
      id: 'failed',
      name: 'failed.pdf',
      type: ChatFileTypeEnum.file,
      rawFile: new File(['file'], 'failed.pdf'),
      status: 1,
      error: 'upload failed'
    };

    expect(
      mergeFileSelectorExternalValue({
        currentFiles: [uploadingFile, failedFile],
        externalFiles: []
      })
    ).toEqual([uploadingFile, failedFile]);
  });

  it('外部持久化值刷新时不会重复保留已完成文件', () => {
    const completedFile: FileSelectorRenderItemType = {
      id: 'completed',
      key: 'chat/files/completed.pdf',
      name: 'completed.pdf',
      type: ChatFileTypeEnum.file,
      status: 1
    };
    const externalFile: FileSelectorRenderItemType = {
      ...completedFile,
      id: 'external'
    };

    expect(
      mergeFileSelectorExternalValue({
        currentFiles: [completedFile],
        externalFiles: [externalFile]
      })
    ).toEqual([externalFile]);
  });

  it('仅将本次待上传文件置为上传态，不影响已完成文件', () => {
    const doneFile: FileSelectorRenderItemType = {
      id: 'done',
      key: 'apps/app/chat/done.png',
      name: 'done.png',
      type: ChatFileTypeEnum.image,
      status: 1,
      process: 100
    };
    const pendingFile: FileSelectorRenderItemType = {
      id: 'pending',
      name: 'pending.html',
      type: ChatFileTypeEnum.file,
      status: 0,
      process: 80,
      error: 'old error',
      rawFile: new File(['html'], 'pending.html')
    };
    const files = [doneFile, pendingFile];

    const uploadingFiles = markFileSelectorUploading(files);

    expect(uploadingFiles.map((file) => file.id)).toEqual(['pending']);
    expect(doneFile.process).toBe(100);
    expect(doneFile.status).toBe(1);
    expect(pendingFile.status).toBe(1);
    expect(pendingFile.process).toBe(0);
    expect(pendingFile.error).toBeUndefined();
  });

  it('有 key 或 url 的文件即使保留历史 process，也不应显示上传中', () => {
    expect(
      isFileSelectorUploading({
        status: 1,
        key: 'apps/app/chat/file.png',
        process: 100
      })
    ).toBe(false);
    expect(
      isFileSelectorUploading({
        status: 1,
        url: 'https://example.com/file.png',
        process: 100
      })
    ).toBe(false);
    expect(
      isFileSelectorUploading({
        status: 1,
        process: 30
      })
    ).toBe(true);
    expect(
      isFileSelectorUploading({
        status: 1,
        error: 'upload failed',
        process: 30
      })
    ).toBe(false);
  });

  it('上传成功或失败后清理 process，避免完成文件继续显示 loading', () => {
    const files: FileSelectorRenderItemType[] = [
      {
        id: 'file-id',
        name: 'file.png',
        type: ChatFileTypeEnum.image,
        status: 1,
        process: 100
      }
    ];

    markFileSelectorUploadSuccess({
      files,
      id: 'file-id',
      key: 'apps/app/chat/file.png',
      url: 'https://signed-url.example.com/file.png'
    });

    expect(files[0]).toMatchObject({
      key: 'apps/app/chat/file.png',
      url: 'https://signed-url.example.com/file.png'
    });
    expect(files[0].process).toBeUndefined();
    expect(isFileSelectorUploading(files[0])).toBe(false);

    files[0].process = 60;
    markFileSelectorUploadError({
      files,
      id: 'file-id',
      error: 'upload failed'
    });

    expect(files[0].error).toBe('upload failed');
    expect(files[0].process).toBeUndefined();
    expect(isFileSelectorUploading(files[0])).toBe(false);
  });

  it('刚选择的本地文件即使还没有 process，也应视为上传中', () => {
    expect(
      isFileSelectorUploading({
        status: 0,
        rawFile: new File(['file'], 'image.png')
      })
    ).toBe(true);
  });
});

describe('FileSelector display icon', () => {
  it('图片历史值缺少预览 url 时，使用文件名图标兜底', () => {
    expect(
      getFileSelectorDisplayIcon({
        type: ChatFileTypeEnum.image,
        name: 'image.png',
        key: 'chat/files/image.png'
      })
    ).toBe('image');
  });

  it('非图片 URL 文件缺少名称时，使用 URL 推断文件图标', () => {
    expect(
      getFileSelectorDisplayIcon({
        type: ChatFileTypeEnum.file,
        name: '',
        url: 'https://example.com/demo.pdf'
      })
    ).toBe('file/fill/pdf');
  });
});

describe('FileSelector preview url', () => {
  it('只有 key 但缺少 url 的有效文件需要补预览链接', () => {
    expect(
      isFileSelectorPreviewUrlMissing({
        key: 'apps/app/chat/image.png'
      })
    ).toBe(true);

    expect(
      isFileSelectorPreviewUrlMissing({
        key: 'apps/app/chat/image.png',
        url: 'https://signed-url.example.com/image.png'
      })
    ).toBe(false);

    expect(
      isFileSelectorPreviewUrlMissing({
        key: 'apps/app/chat/image.png',
        error: 'upload failed'
      })
    ).toBe(false);
  });
});

describe('FileSelector external sync', () => {
  it('后端补充同 key 的预览字段时，不应被当成清洗值回写跳过', () => {
    const cleanedValue = [
      {
        id: 'file-id',
        key: 'apps/app/chat/image.png',
        name: 'image.png',
        type: ChatFileTypeEnum.image
      }
    ];

    expect(
      isFileSelectorCleanValueEcho({
        value: cleanedValue,
        cleanedValue,
        lastEmittedValue: cleanedValue
      })
    ).toBe(true);

    expect(
      isFileSelectorCleanValueEcho({
        value: [
          {
            ...cleanedValue[0],
            url: 'https://signed-url.example.com/image.png'
          }
        ],
        cleanedValue,
        lastEmittedValue: cleanedValue
      })
    ).toBe(false);
  });
});
