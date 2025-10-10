import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

// Use absolute import for the handler, matching the repo structure
import { handler } from '@/pages/api/core/app/httpTools/create';

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: vi.fn()
}));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAppLimit: vi.fn()
}));
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn()
}));
vi.mock('@fastgpt/global/core/app/httpTools/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/core/app/httpTools/utils')>();
  return {
    ...actual,
    getHTTPToolSetRuntimeNode: vi.fn()
  };
});
vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: {
    createApp: vi.fn()
  }
}));

describe('handler', () => {
  const mockRes = {} as ApiResponseType<string>;
  const mockTeamId = 'team123';
  const mockTmbId = 'tmb456';
  const mockUserId = 'user789';
  const mockHttpToolsetId = 'http-toolset-id';

  const baseBody = {
    name: 'Test HTTP Toolset',
    avatar: 'avatar.png',
    intro: 'Intro',
    parentId: undefined as string | undefined,
    createType: 'manual' as 'manual' | 'batch'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create http toolset with manual createType (no parentId)', async () => {
    const { authUserPer } = await import('@fastgpt/service/support/permission/user/auth');
    const { checkTeamAppLimit } = await import('@fastgpt/service/support/permission/teamLimit');
    const { mongoSessionRun } = await import('@fastgpt/service/common/mongo/sessionRun');
    const { getHTTPToolSetRuntimeNode } = await import('@fastgpt/global/core/app/httpTools/utils');
    const { pushTrack } = await import('@fastgpt/service/common/middle/tracks/utils');

    // Mock permission
    vi.mocked(authUserPer).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      userId: mockUserId
    });

    // Mock limit check
    vi.mocked(checkTeamAppLimit).mockResolvedValue(undefined);

    // Mock getHTTPToolSetRuntimeNode
    vi.mocked(getHTTPToolSetRuntimeNode).mockReturnValue({
      id: 'mod-1',
      name: baseBody.name,
      avatar: baseBody.avatar,
      toolList: []
    });

    // Mock onCreateApp inside mongoSessionRun
    vi.mocked(mongoSessionRun).mockImplementation(async (fn: any) => {
      return await fn('fake-session');
    });

    // Patch onCreateApp to return mockHttpToolsetId
    const { onCreateApp } = await import('@/pages/api/core/app/create');
    vi.spyOn(await import('@/pages/api/core/app/create'), 'onCreateApp').mockResolvedValue(
      mockHttpToolsetId
    );

    // Prepare req
    const req = {
      body: { ...baseBody }
    } as ApiRequestProps<any, any>;

    const result = await handler(req, mockRes);

    expect(authUserPer).toHaveBeenCalledWith({ req, authToken: true, per: expect.anything() });
    expect(checkTeamAppLimit).toHaveBeenCalledWith(mockTeamId);
    expect(getHTTPToolSetRuntimeNode).toHaveBeenCalledWith({
      name: baseBody.name,
      avatar: baseBody.avatar,
      toolList: []
    });
    expect(result).toBe(mockHttpToolsetId);

    // Should call track
    expect(pushTrack.createApp).toHaveBeenCalledWith({
      type: AppTypeEnum.httpToolSet,
      appId: mockHttpToolsetId,
      uid: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId
    });
  });

  it('should create http toolset with batch createType (no parentId)', async () => {
    const { authUserPer } = await import('@fastgpt/service/support/permission/user/auth');
    const { checkTeamAppLimit } = await import('@fastgpt/service/support/permission/teamLimit');
    const { mongoSessionRun } = await import('@fastgpt/service/common/mongo/sessionRun');
    const { getHTTPToolSetRuntimeNode } = await import('@fastgpt/global/core/app/httpTools/utils');
    const { pushTrack } = await import('@fastgpt/service/common/middle/tracks/utils');

    vi.mocked(authUserPer).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      userId: mockUserId
    });
    vi.mocked(checkTeamAppLimit).mockResolvedValue(undefined);

    // Should be called with additional batch fields
    vi.mocked(getHTTPToolSetRuntimeNode).mockReturnValue({
      id: 'mod-batch',
      name: baseBody.name,
      avatar: baseBody.avatar,
      toolList: [],
      baseUrl: '',
      apiSchemaStr: '',
      customHeaders: '{}',
      headerSecret: {}
    });

    vi.mocked(mongoSessionRun).mockImplementation(async (fn: any) => {
      return await fn('fake-session');
    });

    vi.spyOn(await import('@/pages/api/core/app/create'), 'onCreateApp').mockResolvedValue(
      mockHttpToolsetId
    );

    const req = {
      body: { ...baseBody, createType: 'batch' }
    } as ApiRequestProps<any, any>;

    const result = await handler(req, mockRes);

    expect(getHTTPToolSetRuntimeNode).toHaveBeenCalledWith({
      name: baseBody.name,
      avatar: baseBody.avatar,
      toolList: [],
      baseUrl: '',
      apiSchemaStr: '',
      customHeaders: '{}',
      headerSecret: {}
    });
    expect(result).toBe(mockHttpToolsetId);
    expect(pushTrack.createApp).toHaveBeenCalled();
  });

  it('should use authApp when parentId is provided', async () => {
    const { authApp } = await import('@fastgpt/service/support/permission/app/auth');
    const { checkTeamAppLimit } = await import('@fastgpt/service/support/permission/teamLimit');
    const { mongoSessionRun } = await import('@fastgpt/service/common/mongo/sessionRun');
    const { getHTTPToolSetRuntimeNode } = await import('@fastgpt/global/core/app/httpTools/utils');

    vi.mocked(authApp).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      userId: mockUserId
    });
    vi.mocked(checkTeamAppLimit).mockResolvedValue(undefined);
    vi.mocked(getHTTPToolSetRuntimeNode).mockReturnValue({
      id: 'mod-2',
      name: baseBody.name,
      avatar: baseBody.avatar,
      toolList: []
    });
    vi.mocked(mongoSessionRun).mockImplementation(async (fn: any) => {
      return await fn('fake-session');
    });
    vi.spyOn(await import('@/pages/api/core/app/create'), 'onCreateApp').mockResolvedValue(
      mockHttpToolsetId
    );

    const req = {
      body: { ...baseBody, parentId: 'parent-app-id' }
    } as ApiRequestProps<any, any>;

    const result = await handler(req, mockRes);

    expect(authApp).toHaveBeenCalledWith({
      req,
      appId: 'parent-app-id',
      per: expect.anything(),
      authToken: true
    });
    expect(result).toBe(mockHttpToolsetId);
  });

  it('should throw if checkTeamAppLimit throws', async () => {
    const { authUserPer } = await import('@fastgpt/service/support/permission/user/auth');
    const { checkTeamAppLimit } = await import('@fastgpt/service/support/permission/teamLimit');

    vi.mocked(authUserPer).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      userId: mockUserId
    });
    vi.mocked(checkTeamAppLimit).mockRejectedValue(new Error('limit reached'));

    const req = {
      body: { ...baseBody }
    } as ApiRequestProps<any, any>;

    await expect(handler(req, mockRes)).rejects.toThrow('limit reached');
  });

  it('should propagate errors from onCreateApp', async () => {
    const { authUserPer } = await import('@fastgpt/service/support/permission/user/auth');
    const { checkTeamAppLimit } = await import('@fastgpt/service/support/permission/teamLimit');
    const { mongoSessionRun } = await import('@fastgpt/service/common/mongo/sessionRun');
    const { getHTTPToolSetRuntimeNode } = await import('@fastgpt/global/core/app/httpTools/utils');

    vi.mocked(authUserPer).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      userId: mockUserId
    });
    vi.mocked(checkTeamAppLimit).mockResolvedValue(undefined);
    vi.mocked(getHTTPToolSetRuntimeNode).mockReturnValue({
      id: 'mod-err',
      name: baseBody.name,
      avatar: baseBody.avatar,
      toolList: []
    });
    vi.mocked(mongoSessionRun).mockImplementation(async (fn: any) => {
      return await fn('fake-session');
    });
    vi.spyOn(await import('@/pages/api/core/app/create'), 'onCreateApp').mockRejectedValue(
      new Error('db error')
    );

    const req = {
      body: { ...baseBody }
    } as ApiRequestProps<any, any>;

    await expect(handler(req, mockRes)).rejects.toThrow('db error');
  });
});
