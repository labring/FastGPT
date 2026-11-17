import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import {
  attachSynonymMappingsToSearchResults,
  searchSynonymSnapshot,
  type SearchSynonymSnapshot
} from '@fastgpt/service/core/dataset/synonym/searchResult';
import { buildSynonymMatcher } from '@fastgpt/service/core/dataset/synonym/utils';
import { serviceEnv } from '@fastgpt/service/env';

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;
const mocks = vi.hoisted(() => ({
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
  serviceEnv.DATASET_SYNONYM_ENABLED = true;
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

afterAll(() => {
  serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
});

describe('synonym search result enrichment', () => {
  it('does not query or create mappings when disabled, and removes internal snapshots', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    const [result] = await run();
    expect(result).not.toHaveProperty('synonymMappings');
    expect(Object.getOwnPropertySymbols(result)).toEqual([]);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.matcher).not.toHaveBeenCalled();
  });
  it('preserves actual case variants and groups matcher loads by version', async () => {
    const results = await run([item(), item(), item('alias', 2)]);
    expect(results[0].synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });
    expect(results[1].synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });
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
  it('caps mappings deterministically without internal metadata', async () => {
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
    expect(JSON.stringify(result)).not.toContain('mappingId');
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
      synonymMappings: { alias: 'standard' }
    };
    const [result] = await run([decorated]);
    expect(result).toMatchObject({
      synonymMappings: { alias: 'standard' }
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

  /**
   * 回归背景（2026-11 同义词验证）：用户问题命中同义词（如「枕瓜」→「冬瓜」），但分块
   * 正文只写标准词「冬瓜」，分块自身不会命中任何原词，此前 synonymMappings 为空，
   * 回答模型拿不到「问题措辞 → 正文标准词」的对齐信息。现在把问题侧命中的映射
   * 反向匹配到分块：标准词确实出现在该分块正文里才加入，去重后并入 synonymMappings。
   */
  it('adds query-hit mappings to chunks whose body only contains the standard term', async () => {
    const results = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('standard-1 body only')],
      queries: ['alias question']
    });
    expect(results[0].synonymMappings).toEqual({ alias: 'standard-1' });
  });

  it('does not add query-hit mappings to chunks without the standard term', async () => {
    const results = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('unrelated body')],
      queries: ['alias question']
    });
    expect(results[0].synonymMappings).toEqual({});
  });

  it('merges query-hit mappings without duplicating chunk-side entries', async () => {
    // 分块正文同时含原词 alias 与标准词 standard-1：分块侧给出 ALIAS/alias 两条，
    // 问题侧 alias 与之分块侧重复，合并后不得出现第三条或覆盖分块侧大小写保留。
    const results = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item()],
      queries: ['alias question']
    });
    expect(results[0].synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });
  });

  it('ignores empty or blank queries', async () => {
    const results = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item()],
      queries: ['', '   ']
    });
    expect(results[0].synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });
  });

  /**
   * 2x2 矩阵回归（2026-11 验证口径）：query 带不带标准词 × 分块带不带标准词。
   * 锁住三条边界：①问题侧反向匹配只落到正文含标准词的分块；②问题只含标准词时
   * 不产出自映射（冬瓜→冬瓜 这类噪音）；③问题原词+标准词同时出现时仍只一条映射。
   */
  it('adds query-hit mappings only when the chunk body contains the standard term (2x2)', async () => {
    // query 带原词（不带标准词）
    const aliasOnly = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('standard-1 body only'), item('unrelated body')],
      queries: ['alias question']
    });
    expect(aliasOnly[0].synonymMappings).toEqual({ alias: 'standard-1' });
    expect(aliasOnly[1].synonymMappings).toEqual({});

    // query 只带标准词：标准词命中不产出映射（无 冬瓜→冬瓜 式自映射噪音）
    const standardOnly = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('standard-1 body only'), item('unrelated body')],
      queries: ['standard-1 question']
    });
    expect(standardOnly[0].synonymMappings).toEqual({});
    expect(standardOnly[1].synonymMappings).toEqual({});

    // query 原词 + 标准词都在：仍只一条，不因标准词命中多出条目
    const mixed = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('standard-1 body only')],
      queries: ['alias standard-1 question']
    });
    expect(mixed[0].synonymMappings).toEqual({ alias: 'standard-1' });
  });

  /**
   * 回归背景（2026-11 同义词验证）：分块侧映射只由分块正文决定，与提问无关。
   * 提问完全没命中词表、或只带标准词时，分块正文里的原词映射必须原样保留返回——
   * 问题侧只追加、不清掉已有映射。
   */
  it('keeps chunk-side mappings when the query misses the vocabulary or has only the standard term', async () => {
    // query 与词表完全无关
    const unrelated = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item()],
      queries: ['unrelated question']
    });
    expect(unrelated[0].synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });

    // query 只带标准词（标准词命中不产出映射，也不影响分块侧）
    const standardOnly = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item()],
      queries: ['standard-1 question']
    });
    expect(standardOnly[0].synonymMappings).toEqual({ ALIAS: 'standard-1', alias: 'standard-1' });
  });

  /**
   * F2 边界（2026-11-17 Codex review）：问题侧反向匹配的标准词命中必须复用
   * matcher 的归一化与词边界语义，不能用 includes——否则英文大小写变体漏配
   * （「REFUND」vs「Refund」），词中子串误配（cat ⊂ concatenate）。
   * 测试用 standard-1 作为标准词、alias 作为别名的既有 mock matcher。
   */
  it('matches the standard term with matcher normalization and word boundaries', async () => {
    // 大小写变体：正文写 STANDARD-1（大写），matcher 归一化后应命中
    const caseVariant = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('STANDARD-1 policies')],
      queries: ['alias question']
    });
    expect(caseVariant[0].synonymMappings).toEqual({ alias: 'standard-1' });

    // 词中子串：正文 standard-10 里包含 standard-1 前缀，但边界不合法（后随数字）
    // → 不得注入映射
    const prefixInsideWord = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('standard-10 policies')],
      queries: ['alias question']
    });
    expect(prefixInsideWord[0].synonymMappings).toEqual({});

    // 连字符本身是边界的一部分：standard-1x 也不算命中
    const letterSuffix = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('standard-1x policies')],
      queries: ['alias question']
    });
    expect(letterSuffix[0].synonymMappings).toEqual({});

    // 完整独立词：正常命中
    const standalone = await attachSynonymMappingsToSearchResults({
      teamId,
      datasetIds: [datasetId],
      results: [item('the standard-1 reference')],
      queries: ['alias question']
    });
    expect(standalone[0].synonymMappings).toEqual({ alias: 'standard-1' });
  });
});
