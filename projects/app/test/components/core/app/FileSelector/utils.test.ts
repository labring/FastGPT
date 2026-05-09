import { describe, expect, it } from 'vitest';
import type { FileSelectorRenderItemType } from '@/components/core/app/FileSelector/type';
import {
  getFileSelectorDisplayIcon,
  inferFileSelectorType,
  isFileSelectorCleanValueEcho,
  isFileSelectorPreviewUrlMissing,
  isFileSelectorUploading,
  markFileSelectorUploadError,
  markFileSelectorUploading,
  markFileSelectorUploadSuccess,
  sanitizeFileSelectValue
} from '@/components/core/app/FileSelector/utils';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('sanitizeFileSelectValue', () => {
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

describe('FileSelector upload state', () => {
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
