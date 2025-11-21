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
    } as unknown as ApiRequestProps<{}, { type?: 'tool' }>;
    const res = {} as ApiResponseType<any>;

    const result = await handler(req, res);

    expect(result).toEqual({ list: [] });
    expect(APIGetSystemToolList).toHaveBeenCalledTimes(1);
  });

  it('should return the list of installed tools with id and version', async () => {
    vi.mocked(APIGetSystemToolList).mockResolvedValueOnce([
      {
        toolId: 'toolA',
        id: `${AppToolSourceEnum.systemTool}-toolA`,
        version: '1.2.3',
        name: { en: 'Tool A' },
        description: { en: 'desc' },
        icon: '',
        avatar: '',
        parentId: undefined
      },
      {
        toolId: 'toolB',
        id: `${AppToolSourceEnum.systemTool}-toolB`,
        version: '4.5.6',
        name: { en: 'Tool B' },
        description: { en: 'desc' },
        icon: '',
        avatar: '',
        parentId: undefined
      }
    ] as any);

    const req = {
      query: {}
    } as unknown as ApiRequestProps<{}, { type?: 'tool' }>;
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
        toolId: 'my-tool-123',
        id: `${AppToolSourceEnum.systemTool}-my-tool-123`,
        version: '0.0.1',
        name: { en: 'My Tool' },
        description: { en: 'desc' },
        icon: '',
        avatar: '',
        parentId: undefined
      }
    ] as any);

    const req = {
      query: { type: 'tool' }
    } as unknown as ApiRequestProps<{}, { type?: 'tool' }>;
    const res = {} as ApiResponseType<any>;

    const result = await handler(req, res);

    expect(result).toEqual({
      list: [{ id: 'my-tool-123', version: '0.0.1' }]
    });
  });

  it('should handle tools with ids not starting with the systemTool- prefix', async () => {
    vi.mocked(APIGetSystemToolList).mockResolvedValueOnce([
      {
        toolId: 'toolX',
        id: 'randomprefix-toolX',
        version: '9.9.9',
        name: { en: 'Tool X' },
        description: { en: 'desc' },
        icon: '',
        avatar: '',
        parentId: undefined
      }
    ] as any);

    const req = {
      query: {}
    } as unknown as ApiRequestProps<{}, { type?: 'tool' }>;
    const res = {} as ApiResponseType<any>;

    const result = await handler(req, res);

    expect(result).toEqual({
      list: [{ id: 'randomprefix-toolX', version: '9.9.9' }]
    });
  });
});
