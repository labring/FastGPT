import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  OceanBaseFullTextAdapter,
  assertOceanBaseFullTextVersion
} from '@fastgpt/service/common/vectorDB/oceanbase/fullText';

const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@fastgpt/service/common/vectorDB/oceanbase/controller', () => ({
  ObClass: class {
    query = state.query;
  }
}));

describe.each(['oceanbase', 'seekdb'] as const)('%s native full text', (provider) => {
  let indexExists = false;
  const analyzer =
    provider === 'seekdb'
      ? 'seekdb-space-fastgpt-jieba-search-v1'
      : 'oceanbase-space-fastgpt-jieba-search-v1';
  const metadata = { targetId: randomUUID(), schemaVersion: 1, analyzerVersion: analyzer };
  const version = provider === 'seekdb' ? 'OceanBase seekdb 1.0.1.0' : 'OceanBase_CE 4.3.5.1';
  const definition =
    'CREATE TABLE modeldata (fulltext_tokens longtext, FULLTEXT KEY `modeldata_fulltext` (`fulltext_tokens`) WITH PARSER space PARSER_PROPERTIES=(min_token_size=1))';
  const index = {
    Key_name: 'modeldata_fulltext',
    Index_type: 'FULLTEXT',
    Column_name: 'fulltext_tokens',
    Visible: 'YES',
    Comment: 'available'
  };
  // 外置分析器（jieba 搜索模式 + 小写 + 停用词）对测试原文的实际输出
  const rawText = "O'Reilly 中文";
  const rawTokens = "o ' reilly 中文";
  const adapter = new OceanBaseFullTextAdapter(provider);
  beforeEach(() => {
    indexExists = false;
    state.query.mockReset().mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT @@version_comment'))
        return [[{ version, serverVersion: '5.7.25' }]];
      if (sql.includes('information_schema.columns')) return [[]];
      if (sql.startsWith('SHOW INDEX')) return [indexExists ? [index] : []];
      if (sql.startsWith('CREATE FULLTEXT')) indexExists = true;
      if (sql.startsWith('SHOW CREATE TABLE')) return [[{ 'Create Table': definition }]];
      if (sql.includes('target_id AS targetId')) return [[metadata]];
      return [[]];
    });
  });
  it('prepares a nullable token column, SPACE parser and durable metadata without changing vector contents', async () => {
    expect(await adapter.prepare()).toEqual(metadata);
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN fulltext_tokens LONGTEXT CHARACTER SET utf8mb4')
    );
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE FULLTEXT INDEX modeldata_fulltext ON modeldata(fulltext_tokens) WITH PARSER SPACE PARSER_PROPERTIES=(min_token_size=1)'
      )
    );
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('VALUES(1,?,1,?)'),
      expect.anything()
    );
    expect(
      state.query.mock.calls.some(([sql]) => /DELETE|TRUNCATE|DROP|SET vector/i.test(sql))
    ).toBe(false);
    expect(adapter.analyzerVersion).toBe(analyzer);
  });
  it('rejects incompatible existing metadata before executing heavy column/index DDL', async () => {
    const query = state.query.getMockImplementation()!;
    state.query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [[{ 1: 1 }]];
      if (sql.includes('target_id AS targetId')) return [[{ ...metadata, schemaVersion: 99 }]];
      return query(sql);
    });
    await expect(adapter.prepare()).rejects.toThrow();
    expect(
      state.query.mock.calls.some(
        ([sql]) => String(sql).startsWith('ALTER') || String(sql).startsWith('CREATE FULLTEXT')
      )
    ).toBe(false);
  });
  it('reuses a compatible existing column/index but rejects wrong field types', async () => {
    indexExists = true;
    const query = state.query.getMockImplementation()!;
    state.query.mockImplementation(async (sql: string) =>
      sql.includes('information_schema.columns')
        ? [[{ dataType: 'longtext', nullable: 'YES', charset: 'utf8mb4' }]]
        : query(sql)
    );
    await adapter.prepare();
    expect(
      state.query.mock.calls.some(
        ([sql]) => sql.startsWith('ALTER') || sql.startsWith('CREATE FULLTEXT')
      )
    ).toBe(false);
    state.query.mockImplementation(async (sql: string) =>
      sql.includes('information_schema.columns')
        ? [[{ dataType: 'varchar', nullable: 'NO' }]]
        : query(sql)
    );
    await expect(adapter.prepare()).rejects.toThrow('nullable TEXT');
  });
  it('rejects an absent, invisible, wrong-type or differently tokenized same-name index', async () => {
    for (const row of [
      undefined,
      { ...index, Visible: 'NO' },
      { ...index, Index_type: 'BTREE' },
      { ...index, Column_name: 'other' },
      { ...index, Comment: 'unavailable' }
    ]) {
      state.query.mockResolvedValueOnce([row ? [row] : []]);
      await expect(adapter.assertCapability()).rejects.toThrow('index');
    }
    indexExists = true;
    for (const wrong of [
      definition.replace('WITH PARSER space', 'WITH PARSER ik'),
      definition.replace('WITH PARSER space', 'WITH PARSER custom_parser'),
      definition.replace('min_token_size=1', 'min_token_size=3'),
      definition.replace('min_token_size=1', 'max_token_size=84'),
      definition.replace(' WITH PARSER space PARSER_PROPERTIES=(min_token_size=1)', '')
    ]) {
      state.query
        .mockResolvedValueOnce([[index]])
        .mockResolvedValueOnce([[{ 'Create Table': wrong }]]);
      await expect(adapter.assertCapability()).rejects.toThrow('SPACE');
    }
    // 兼容 MySQL 版本条件注释、额外索引选项（如 BLOCK_SIZE）以及不回显 parser_properties 的产品输出
    for (const compatible of [
      definition.replace(' PARSER_PROPERTIES=(min_token_size=1)', ''),
      'CREATE TABLE `modeldata` (`fulltext_tokens` longtext, FULLTEXT KEY `modeldata_fulltext` (`fulltext_tokens`) BLOCK_SIZE 16384 /*!50100 WITH PARSER `space` */ PARSER_PROPERTIES=(min_token_size=1))'
    ]) {
      state.query
        .mockResolvedValueOnce([[index]])
        .mockResolvedValueOnce([[{ 'Create Table': compatible }]]);
      await expect(adapter.assertCapability()).resolves.toBeUndefined();
    }
  });
  it('rejects metadata from another provider configuration', async () => {
    state.query.mockResolvedValueOnce([
      [{ ...metadata, analyzerVersion: 'pg-search-0.26.6-whitespace-fastgpt-jieba-search-v1' }]
    ]);
    await expect(adapter.getMetadata()).rejects.toThrow('configured provider');
    state.query.mockResolvedValueOnce([[{ ...metadata, schemaVersion: 2 }]]);
    await expect(adapter.getMetadata()).rejects.toThrow();
  });
  it('uses the analyzer version declared by the shared metadata schema', () => {
    expect(adapter.analyzerVersion).toBe(analyzer);
  });
  it('fills only NULL with bound analyzed tokens and compares tokens byte-for-byte', async () => {
    const rows = [
      {
        vectorId: '9007199254740993',
        teamId: 'team',
        datasetId: 'data',
        collectionId: 'col',
        text: rawText
      }
    ];
    state.query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{ id: rows[0].vectorId }]]);
    expect(await adapter.fill(rows)).toEqual([rows[0].vectorId]);
    const [sql, values] = state.query.mock.calls[0];
    expect(sql).toContain('SET m.fulltext_tokens=v.tokens WHERE m.fulltext_tokens IS NULL');
    expect(sql).not.toContain(rawTokens);
    expect(values).toEqual([rows[0].vectorId, 'team', 'data', 'col', rawTokens]);
    expect(state.query.mock.calls[1][0]).toContain('BINARY m.fulltext_tokens <=> BINARY v.tokens');
    state.query.mockClear();
    expect(await adapter.fill(rows, true)).toEqual([]);
    expect(state.query).toHaveBeenCalledOnce();
    expect(state.query.mock.calls[0][0]).not.toContain('UPDATE');
  });
  it('preflights read-only, permits NULL and compares existing tokens byte-for-byte', async () => {
    const row = {
      vectorId: '1',
      teamId: 't',
      datasetId: 'd',
      collectionId: 'c',
      text: rawText
    };
    state.query.mockResolvedValueOnce([[{ id: '1' }]]);
    expect(await adapter.preflight([row])).toEqual(['1']);
    expect(state.query).toHaveBeenCalledOnce();
    const [sql, values] = state.query.mock.calls[0];
    expect(sql).toContain(
      'm.id IS NULL OR (m.fulltext_tokens IS NOT NULL AND NOT (BINARY m.fulltext_tokens <=> BINARY v.tokens))'
    );
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/);
    expect(values).toEqual(['1', 't', 'd', 'c', rawTokens]);
    expect(await adapter.preflight([row])).toEqual([]);
    await expect(adapter.preflight([{ ...row, vectorId: '01' }])).rejects.toThrow('bigint');
    expect(state.query).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed IDs before MySQL casts can coerce them to another row', async () => {
    for (const vectorId of ['bad', '0', '-1', '01', '9223372036854775808'])
      await expect(
        adapter.fill([{ vectorId, teamId: 't', datasetId: 'd', collectionId: 'c', text: 'value' }])
      ).rejects.toThrow('bigint');
    expect(state.query).not.toHaveBeenCalled();
  });
  it('filters before Top-K, binds the analyzed terms and preserves native scores', async () => {
    state.query.mockResolvedValueOnce([
      [{ vectorId: '1', collectionId: 'allowed', score: '1.25' }]
    ]);
    const props = {
      teamId: 'team',
      datasetIds: ['a', 'b'],
      query: "' OR 1=1; 用户查询",
      limit: 7,
      forbidCollectionIdList: ['hidden'],
      filterCollectionIdList: ['allowed', 'hidden']
    };
    expect(await adapter.search(props)).toEqual([
      { vectorId: '1', collectionId: 'allowed', score: 1.25 }
    ]);
    const [sql, values] = state.query.mock.calls[0];
    expect(sql).not.toContain(props.query);
    expect(sql).toContain('MATCH(fulltext_tokens) AGAINST (? IN NATURAL LANGUAGE MODE)');
    expect(sql).toContain('dataset_id IN (?,?)');
    expect(sql).toContain('collection_id NOT IN (?)');
    const terms = "' 1 = ; 用户 查询";
    expect(values).toEqual([terms, terms, 'team', 'a', 'b', 'allowed', 'hidden', 7]);
    state.query.mockClear();
    for (const extra of [
      { query: ' ' },
      { query: '是什么意思？' },
      { limit: 0 },
      { datasetIds: [] },
      { filterCollectionIdList: [] }
    ])
      expect(await adapter.search({ ...props, ...extra })).toEqual([]);
    expect(state.query).not.toHaveBeenCalled();
  });
});

describe('product version gates', () => {
  it.each([
    ['oceanbase', 'OceanBase_CE 4.3.5.1'],
    ['oceanbase', 'OceanBase 4.4.0.0'],
    ['seekdb', '5.7.25-OceanBase-seekdb-v1.0.1.0'],
    ['seekdb', 'OceanBase seekdb 1.4.0.0']
  ] as const)('recognizes %s product version %s', (provider, version) => {
    expect(() => assertOceanBaseFullTextVersion(provider, version)).not.toThrow();
  });
  it.each([
    ['oceanbase', '5.7.25'],
    ['oceanbase', 'OceanBase_CE 4.3.5.0'],
    ['oceanbase', 'OceanBase_CE 4.3.5'],
    ['seekdb', 'OceanBase seekdb 1.0.0.0']
  ] as const)('rejects unknown or insufficient %s version %s', (provider, version) => {
    expect(() => assertOceanBaseFullTextVersion(provider, version)).toThrow();
  });
});
