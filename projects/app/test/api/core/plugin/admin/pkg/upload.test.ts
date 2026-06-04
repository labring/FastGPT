import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRes } from '@fastgpt/service/common/response';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getLocale: vi.fn(),
  resolveMultipleFormData: vi.fn(),
  clearDiskTempFiles: vi.fn(),
  uploadPlugin: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/common/middle/i18n', () => ({
  getLocale: mocks.getLocale
}));

vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: {
    resolveMultipleFormData: mocks.resolveMultipleFormData,
    clearDiskTempFiles: mocks.clearDiskTempFiles
  }
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: {
    uploadPlugin: mocks.uploadPlugin
  }
}));

import handler from '@/pages/api/core/plugin/admin/pkg/upload';

const mockJsonRes = vi.mocked(jsonRes);

const pkgPath = '/virtual-fastgpt-plugin-upload-test/tool-a.pkg';
const zipPath = '/virtual-fastgpt-plugin-upload-test/tools.zip';

describe('POST /api/core/plugin/admin/pkg/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      if (filePath === pkgPath) return Buffer.from('pkg-a');
      if (filePath === zipPath) return Buffer.from('zip-content');
      return Buffer.from('');
    });

    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.getLocale.mockReturnValue('zh-CN');
    mocks.resolveMultipleFormData.mockResolvedValue({
      data: {},
      fileMetadata: [
        {
          path: pkgPath,
          mimetype: 'application/octet-stream',
          originalname: encodeURIComponent('tool-a.pkg')
        },
        {
          path: zipPath,
          mimetype: 'application/zip',
          originalname: encodeURIComponent('tools.zip')
        }
      ]
    });
    mocks.uploadPlugin.mockResolvedValue({
      plugins: [
        {
          pluginId: 'tool-a',
          version: '1.0.0',
          etag: 'etag-a',
          type: 'tool',
          name: {
            en: 'Tool A',
            'zh-CN': '工具 A'
          },
          icon: 'https://example.com/tool-a.svg'
        },
        {
          pluginId: 'tool-b',
          version: '1.0.0',
          etag: 'etag-b',
          type: 'tool',
          name: {
            en: 'Tool B',
            'zh-CN': '工具 B'
          },
          icon: 'https://example.com/tool-b.svg'
        }
      ],
      failed: [
        {
          fileName: 'broken.pkg',
          reason: {
            en: 'Invalid plugin package',
            'zh-CN': '插件包无效'
          }
        },
        {
          fileName: 'tools.zip',
          reason: {
            en: 'Partial zip package failed',
            'zh-CN': '部分 zip 包解析失败'
          }
        }
      ]
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('批量读取 .pkg 和 .zip，并一次性调用新版 SDK uploadPlugin', async () => {
    const req = {
      method: 'POST'
    } as any;
    const res = {} as any;

    await handler(req, res);

    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
    expect(mocks.resolveMultipleFormData).toHaveBeenCalledWith({
      request: req,
      allowedExtensions: ['.pkg', '.zip']
    });
    expect(mocks.uploadPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.uploadPlugin).toHaveBeenCalledWith([
      {
        file: expect.any(Blob),
        filename: 'tool-a.pkg'
      },
      {
        file: expect.any(Blob),
        filename: 'tools.zip'
      }
    ]);
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 200,
      data: {
        plugins: [
          {
            pluginId: 'tool-a',
            version: '1.0.0',
            etag: 'etag-a',
            type: 'tool',
            name: {
              en: 'Tool A',
              'zh-CN': '工具 A'
            },
            icon: 'https://example.com/tool-a.svg'
          },
          {
            pluginId: 'tool-b',
            version: '1.0.0',
            etag: 'etag-b',
            type: 'tool',
            name: {
              en: 'Tool B',
              'zh-CN': '工具 B'
            },
            icon: 'https://example.com/tool-b.svg'
          }
        ],
        failed: [
          {
            fileName: 'broken.pkg',
            reason: {
              en: 'Invalid plugin package',
              'zh-CN': '插件包无效'
            }
          },
          {
            fileName: 'tools.zip',
            reason: {
              en: 'Partial zip package failed',
              'zh-CN': '部分 zip 包解析失败'
            }
          }
        ]
      }
    });
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith([pkgPath, zipPath]);
  });
});
