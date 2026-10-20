import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import {
  attachSynonymMappingsToSearchResults,
  searchSynonymSnapshot,
  type SearchSynonymSnapshot
} from '@fastgpt/service/core/dataset/synonym/searchResult';
import { buildSynonymMatcher } from '@fastgpt/service/core/dataset/synonym/utils';

const mocks = vi.hoisted(() => ({
  enabled: true,
  find: vi.fn(),
  select: vi.fn(),
  lean: vi.fn(),
  matcher: vi.fn(),
  config: vi.fn()
}));
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: { find: mocks.find }
}));
vi.mock('@fastgpt/service/core/dataset/data/controller', () => ({
  formatDatasetDataTextValue: ({ q, a }: { q: string; a?: string }) => ({ q, a })
}));
vi.mock('@fastgpt/service/core/dataset/synonym/entity', () => ({
  isDatasetSynonymEnabled: () => mocks.enabled,
  getDatasetSynonymMatcher: mocks.matcher,
  getCachedDatasetSynonymConfig: mocks.config
}));

const teamId = '654a4107c32f3bf5f998452f';
const datasetId = '654a4107c32f3bf5f9984530';
const id = '654a4107c32f3bf5f9984531';
const item = (
  q = 'ALIAS alias',
  version: number | undefined = 1
): SearchDataResponseItemType & { [searchSynonymSnapshot]: SearchSynonymSnapshot } => ({
  id,
  q,
  a: '',
  datasetId,
  collectionId: id,
  updateTime: new Date(),
  sourceName: 'source',
  chunkIndex: 0,
  score: [],
  [searchSynonymSnapshot]: { teamId, datasetId, synonymVersion: version, q, a: '' }
});
const run = (results = [item()]) =>
  attachSynonymMappingsToSearchResults({ teamId, datasetIds: [datasetId], results });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.find.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ lean: mocks.lean });
  mocks.lean.mockResolvedValue([]);
  mocks.config.mockResolvedValue(null);
  mocks.matcher.mockImplementation(async ({ fileVersion }: { fileVersion: number }) => ({
    ...buildSynonymMatcher([
      {
        logicalMappingId: id,
        datasetId,
        fileVersion,
        standardizedTerm: `standard-${fileVersion}`,
        normalizedStandardizedTerm: `standard-${fileVersion}`,
        synonymTerms: ['alias'],
        normalizedSynonymTerms: ['alias']
      }
    ]),
    hasMappings: true
  }));
});

describe('synonym search result enrichment', () => {
  it('does not query or create mappings when disabled, and removes internal snapshots', async () => {
    mocks.enabled = false;
    const [result] = await run();
    expect(result).not.toHaveProperty('synonymMappings');
    expect(Object.getOwnPropertySymbols(result)).toEqual([]);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.matcher).not.toHaveBeenCalled();
  });
  it('preserves actual case variants and groups matcher loads by version', async () => {
    const results = await run([item(), item(), item('alias', 2)]);
    expect(results[0].synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });
    expect(results[2].synonymMappings).toEqual({ alias: 'standard-2' });
    expect(mocks.matcher).toHaveBeenCalledTimes(2);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(Object.getOwnPropertySymbols(results[0])).toEqual([]);
  });
  it('returns an empty map for reliable snapshots without matches or an index version', async () => {
    const results = await run([item('no matches'), item('alias', 0)]);
    expect(results.map((result) => result.synonymMappings)).toEqual([{}, {}]);
  });
  it('does not invent mappings for unavailable versions or matcher errors', async () => {
    mocks.matcher
      .mockResolvedValueOnce({ hasMappings: false })
      .mockRejectedValueOnce(new Error('unavailable'));
    expect(
      (await run([item(), item('alias', 2)])).every(
        (result) => result.synonymMappings === undefined
      )
    ).toBe(true);
  });
  it('does not enrich a snapshot outside the requested tenant or datasets', async () => {
    const value = {
      ...item(),
      [searchSynonymSnapshot]: { teamId: 'other', datasetId, q: 'alias', synonymVersion: 1 }
    };
    expect((await run([value]))[0].synonymMappings).toBeUndefined();
    expect(mocks.matcher).not.toHaveBeenCalled();
  });
  it('checks external content against tenant-scoped database snapshots', async () => {
    const { [searchSynonymSnapshot]: snapshot, ...external } = item();
    mocks.lean.mockResolvedValue([{ _id: id, ...snapshot, updateTime: external.updateTime }]);
    const [result] = await run([external]);
    expect(result.synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });
    expect(mocks.find).toHaveBeenCalledWith({
      teamId,
      datasetId: { $in: [datasetId] },
      _id: { $in: [id] }
    });
    expect((await run([{ ...external, q: 'stale body' }]))[0].synonymMappings).toBeUndefined();
    const variants = await run([
      external,
      { ...external, q: 'stale body' },
      { ...external, updateTime: new Date(0) }
    ]);
    expect(variants[0].synonymMappings).toBeDefined();
    expect(variants[1].synonymMappings).toBeUndefined();
    expect(variants[2].synonymMappings).toBeUndefined();
  });
  it('does not fabricate fields for pseudo ids or database read failures', async () => {
    const { [searchSynonymSnapshot]: snapshot, ...external } = item();
    expect((await run([{ ...external, id: 'sql-result' }]))[0].synonymMappings).toBeUndefined();
    expect(mocks.find).not.toHaveBeenCalled();
    mocks.lean.mockRejectedValue(new Error('read failed'));
    expect((await run([external]))[0].synonymMappings).toBeUndefined();
  });
  it('caps mappings deterministically and exposes truncation without internal metadata', async () => {
    mocks.matcher.mockResolvedValue({
      hasMappings: true,
      transform: () => ({
        usedMappings: Array.from({ length: 101 }, (_, index) => ({
          matchedTerm: `term-${index}`,
          standardizedTerm: 'standard'
        }))
      })
    });
    const [result] = await run();
    expect(Object.keys(result.synonymMappings ?? {})).toHaveLength(100);
    expect(result.synonymMappingsTruncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain('mappingId');
  });
  it('caps serialized UTF-8 bytes without returning a partial mapping value', async () => {
    mocks.matcher.mockResolvedValue({
      hasMappings: true,
      transform: () => ({
        usedMappings: [
          { matchedTerm: 'first', standardizedTerm: 'standard' },
          { matchedTerm: 'large', standardizedTerm: '词'.repeat(6000) }
        ]
      })
    });
    const [result] = await run();
    expect(result.synonymMappings).toEqual({ first: 'standard' });
    expect(Buffer.byteLength(JSON.stringify(result.synonymMappings), 'utf8')).toBeLessThanOrEqual(
      16 * 1024
    );
    expect(result.synonymMappingsTruncated).toBe(true);
  });

  it('handles prototype-like terms without prototype pollution', async () => {
    mocks.matcher.mockResolvedValue({
      hasMappings: true,
      transform: () => ({
        usedMappings: [{ matchedTerm: '__proto__', standardizedTerm: 'standard' }]
      })
    });
    const [result] = await run();
    expect(Object.getPrototypeOf(result.synonymMappings)).toBeNull();
    expect(JSON.parse(JSON.stringify(result.synonymMappings))).toEqual({
      ['__proto__']: 'standard'
    });
  });

  it('passes through results already decorated upstream without querying or recomputing', async () => {
    const decorated = {
      ...item(),
      synonymMappings: { alias: 'standard' },
      synonymMappingsTruncated: true
    };
    const [result] = await run([decorated]);
    expect(result).toMatchObject({
      synonymMappings: { alias: 'standard' },
      synonymMappingsTruncated: true
    });
    expect(Object.getOwnPropertySymbols(result)).toEqual([]);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.matcher).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it('passes through external empty mappings instead of treating them as unresolved', async () => {
    const { [searchSynonymSnapshot]: snapshot, ...external } = item();
    const [result] = await run([{ ...external, synonymMappings: {} }]);
    expect(result.synonymMappings).toEqual({});
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('ignores upstream mappings that belong to a dataset outside the requested scope', async () => {
    const { [searchSynonymSnapshot]: snapshot, ...external } = item();
    const [result] = await run([
      { ...external, datasetId: '654a4107c32f3bf5f9984532', synonymMappings: { alias: 'other' } }
    ]);
    expect(result.synonymMappings).toBeUndefined();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.matcher).not.toHaveBeenCalled();
  });

  it('treats the current disabled vocabulary version as a reliable empty mapping', async () => {
    mocks.matcher.mockResolvedValueOnce({ hasMappings: false });
    mocks.config.mockResolvedValue({ teamId, datasetId, version: 1, enabled: false });
    const [result] = await run();
    expect(result.synonymMappings).toEqual({});
    expect(mocks.config).toHaveBeenCalledWith({ teamId, datasetId });
  });

  it('keeps other empty versions distinct from a disabled vocabulary', async () => {
    mocks.matcher.mockResolvedValueOnce({ hasMappings: false });
    mocks.config.mockResolvedValue({ teamId, datasetId, version: 2, enabled: false });
    expect((await run())[0].synonymMappings).toBeUndefined();
  });
});
