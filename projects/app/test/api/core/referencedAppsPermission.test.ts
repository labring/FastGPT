import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  authDataset: vi.fn(),
  authApp: vi.fn(),
  findDatasetAndAllChildren: vi.fn(),
  findAppAndAllChildren: vi.fn(),
  findTeamAppsByPublishedResource: vi.fn(),
  formatReadableReferencedApps: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mocks.authDataset
}));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({ authApp: mocks.authApp }));
vi.mock('@fastgpt/service/core/dataset/controller', () => ({
  findDatasetAndAllChildren: mocks.findDatasetAndAllChildren
}));
vi.mock('@fastgpt/service/core/app/controller', () => ({
  findAppAndAllChildren: mocks.findAppAndAllChildren
}));
vi.mock('@fastgpt/service/core/app/resourceLookup', () => ({
  findTeamAppsByPublishedResource: mocks.findTeamAppsByPublishedResource
}));
vi.mock('@/service/core/app/referencedApps', () => ({
  formatReadableReferencedApps: mocks.formatReadableReferencedApps
}));
vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: () => ({ query: { datasetId: 'dataset-1', toolId: 'tool-1' } })
}));

const { default: datasetHandler } = await import('@/pages/api/core/dataset/apps');
const { default: toolHandler } = await import('@/pages/api/core/app/appsByToolId');

describe('referenced app visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'requester',
      permission: { isOwner: false }
    });
    mocks.authDataset.mockResolvedValue({ permission: { isOwner: true } });
    mocks.authApp.mockResolvedValue({ permission: { isOwner: true } });
    mocks.findDatasetAndAllChildren.mockResolvedValue([]);
    mocks.findAppAndAllChildren.mockResolvedValue([]);
    mocks.findTeamAppsByPublishedResource.mockResolvedValue({ apps: [] });
    mocks.formatReadableReferencedApps.mockResolvedValue({ list: [], hiddenCount: 0 });
  });

  it('uses the request team permission, not resource ownership, for dataset referenced apps', async () => {
    await datasetHandler({} as never);

    expect(mocks.formatReadableReferencedApps).toHaveBeenCalledWith(
      expect.objectContaining({ tmbId: 'requester', isTeamOwner: false })
    );
  });

  it('uses the request team permission, not resource ownership, for tool referenced apps', async () => {
    await toolHandler({} as never);

    expect(mocks.formatReadableReferencedApps).toHaveBeenCalledWith(
      expect.objectContaining({ tmbId: 'requester', isTeamOwner: false })
    );
  });

  it('does not query reference relationships when the requester is not the resource owner', async () => {
    mocks.authDataset.mockResolvedValueOnce({ permission: { isOwner: false } });

    await datasetHandler({} as never);

    expect(mocks.findDatasetAndAllChildren).not.toHaveBeenCalled();
    expect(mocks.formatReadableReferencedApps).not.toHaveBeenCalled();
  });
});
