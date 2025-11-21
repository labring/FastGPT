import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

// --- MOCKS ---

vi.mock('@fastgpt/service/core/app/tool/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/tool/api')>();
  return {
    ...actual,
    APIGetSystemToolList: vi.fn()
  };
});

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: vi.fn().mockResolvedValue(undefined)
}));

import { handler } from '@/pages/api/core/plugin/admin/marketplace/installed';
import { APIGetSystemToolList } from '@fastgpt/service/core/app/tool/api';

describe('handler (installed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return an empty list if no tools are installed', async () => {
    vi.mocked(APIGetSystemToolList).mockResolvedValueOnce([]);

    const req = {
      query: {}
    } as unknown as ApiRequestProps<{}, { type?: string }>;
    const res = {} as ApiResponseType<any>;

    const result = await handler(req, res);

    expect(result).toEqual({ list: [] });
    expect(APIGetSystemToolList).toHaveBeenCalledTimes(1);
  });

  it('should return the list of installed tools with id and version', async () => {
    vi.mocked(APIGetSystemToolList).mockResolvedValueOnce([
      {
        id: `${AppToolSourceEnum.systemTool}-toolA`,
        version: '1.2.3',
        name: 'Tool A',
        desc: 'desc',
        avatar: '',
        moduleName: '',
        moduleLogo: '',
        showStatus: true,
        status: true,
        isSystem: true
      },
      {
        id: `${AppToolSourceEnum.systemTool}-toolB`,
        version: '4.5.6',
        name: 'Tool B',
        desc: 'desc',
        avatar: '',
        moduleName: '',
        moduleLogo: '',
        showStatus: true,
        status: true,
        isSystem: true
      }
    ]);

    const req = {
      query: {}
    } as unknown as ApiRequestProps<{}, { type?: string }>;
    const res = {} as ApiResponseType<any>;

    const result = await handler(req, res);

    expect(result).toEqual({
      list: [
        { id: 'toolA', version: '1.2.3' },
        { id: 'toolB', version: '4.5.6' }
      ]
    });
    expect(APIGetSystemToolList).toHaveBeenCalledTimes(1);
  });

  it('should remove only the systemTool- prefix from id', async () => {
    vi.mocked(APIGetSystemToolList).mockResolvedValueOnce([
      {
        id: `${AppToolSourceEnum.systemTool}-my-tool-123`,
        version: '0.0.1',
        name: 'My Tool',
        desc: 'desc',
        avatar: '',
        moduleName: '',
        moduleLogo: '',
        showStatus: true,
        status: true,
        isSystem: true
      }
    ]);

    const req = {
      query: { type: 'whatever' }
    } as unknown as ApiRequestProps<{}, { type?: string }>;
    const res = {} as ApiResponseType<any>;

    const result = await handler(req, res);

    expect(result).toEqual({
      list: [{ id: 'my-tool-123', version: '0.0.1' }]
    });
  });

  it('should handle tools with ids not starting with the systemTool- prefix', async () => {
    vi.mocked(APIGetSystemToolList).mockResolvedValueOnce([
      {
        id: 'randomprefix-toolX',
        version: '9.9.9',
        name: 'Tool X',
        desc: 'desc',
        avatar: '',
        moduleName: '',
        moduleLogo: '',
        showStatus: true,
        status: true,
        isSystem: true
      }
    ]);

    const req = {
      query: {}
    } as unknown as ApiRequestProps<{}, { type?: string }>;
    const res = {} as ApiResponseType<any>;

    const result = await handler(req, res);

    expect(result).toEqual({
      list: [{ id: 'randomprefix-toolX', version: '9.9.9' }]
    });
  });
});
