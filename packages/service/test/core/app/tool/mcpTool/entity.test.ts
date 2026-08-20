import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMongoAppFind, mockMongoAppVersionAggregate, mockMongoAppVersionFind } = vi.hoisted(
  () => ({
    mockMongoAppFind: vi.fn(),
    mockMongoAppVersionAggregate: vi.fn(),
    mockMongoAppVersionFind: vi.fn()
  })
);

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    find: mockMongoAppFind
  }
}));

vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: {
    find: mockMongoAppVersionFind,
    aggregate: mockMongoAppVersionAggregate
  }
}));

import { getMcpToolsets } from '@fastgpt/service/core/app/tool/mcpTool/entity';

beforeEach(() => {
  vi.clearAllMocks();
  mockMongoAppVersionAggregate.mockResolvedValue([]);
  mockMongoAppVersionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
});

describe('getMcpToolsets', () => {
  it('returns toolset metadata without attaching workflow nodes', async () => {
    mockMongoAppFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'id1', publishedVersionId: 'version-id' }])
    });
    const res = await getMcpToolsets({
      teamId: 'team1',
      ids: ['id1'],
      field: { _id: true }
    });

    expect(mockMongoAppFind).toHaveBeenCalledWith(
      { teamId: 'team1', _id: { $in: ['id1'] } },
      { _id: true, publishedVersionId: true }
    );
    expect(res).toEqual([{ _id: 'id1', publishedVersionId: 'version-id' }]);
    expect(mockMongoAppVersionFind).not.toHaveBeenCalled();
  });
});
