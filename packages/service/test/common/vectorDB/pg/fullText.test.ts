import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  assertPgFullTextCapability,
  fillPgFullText,
  getPgFullTextMetadata,
  PG_FULL_TEXT_ANALYZER_VERSION,
  preparePgFullText,
  preflightPgFullText,
  searchPgFullText
} from '@fastgpt/service/common/vectorDB/pg/fullText';
import {
  assertSqlFullText,
  splitSqlFullTextRows,
  SQL_FULL_TEXT_MAX_BYTES
} from '@fastgpt/service/common/vectorDB/fullText/utils';
import { PgClient } from '@fastgpt/service/common/vectorDB/pg/controller';
import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';

// 测试环境默认替换 PG 向量控制器，这里需要真实实现来检查写入的词串
vi.unmock('@fastgpt/service/common/vectorDB/pg');
const client = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('@fastgpt/service/common/vectorDB/pg/controller', () => ({
  PgClient: { query: vi.fn() },
  connectPg: async () => ({ connect: async () => client })
}));
const identity = {
  targetId: randomUUID(),
  schemaVersion: 1,
  analyzerVersion: 'pg-search-0.26.6-whitespace-fastgpt-jieba-search-v1'
};
const definition =
  'CREATE INDEX modeldata_fulltext ON public.modeldata USING paradedb (id, ((fulltext_tokens)::pdb.whitespace), ((team_id)::pdb.literal), ((dataset_id)::pdb.literal), ((collection_id)::pdb.literal))';
// 外置分析器（jieba 搜索模式 + 小写 + 停用词）对测试原文的实际输出
const rawText = "O'Reilly 中文";
const rawTokens = "o ' reilly 中文";

beforeEach(() => {
  vi.mocked(PgClient.query)
    .mockReset()
    .mockResolvedValue({ rows: [], rowCount: 0 } as never);
  client.query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.startsWith('SHOW')) return { rows: [{ server_version_num: '150019' }] };
    if (sql.startsWith('SELECT extversion')) return { rows: [{ extversion: '0.26.6' }] };
    return { rows: [] };
  });
  client.release.mockReset();
});

describe('PG full-text contracts', () => {
  it('uses the analyzer version declared by the shared metadata schema', () => {
    expect(PG_FULL_TEXT_ANALYZER_VERSION).toBe(identity.analyzerVersion);
  });

  it('preflights tokenized values with bound parameters and permits NULL tokens without writes', async () => {
    const row = { vectorId: '1', teamId: 't', datasetId: 'd', collectionId: 'c', text: rawText };
    vi.mocked(PgClient.query).mockResolvedValueOnce({ rows: [{ id: '1' }] } as never);
    expect(await preflightPgFullText([row])).toEqual(['1']);
    expect(PgClient.query).toHaveBeenCalledOnce();
    const [sql, values] = vi.mocked(PgClient.query).mock.calls[0];
    expect(sql).toContain(
      'm.id IS NULL OR (m.fulltext_tokens IS NOT NULL AND m.fulltext_tokens IS DISTINCT FROM v.tokens)'
    );
    expect(sql).toContain('m.collection_id=v.collection_id');
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/);
    expect(values).toEqual(['1', 't', 'd', 'c', rawTokens]);
    expect(await preflightPgFullText([row])).toEqual([]);
    await expect(preflightPgFullText([{ ...row, vectorId: '01' }])).rejects.toThrow('bigint');
    await expect(preflightPgFullText([{ ...row, text: 'a\0b' }])).rejects.toThrow('null character');
    expect(PgClient.query).toHaveBeenCalledTimes(2);
  });

  it('preserves empty text, quotes and Unicode; enforces bytes and forbids null characters', () => {
    for (const text of ['', "中文 O'Reilly 🦆", 'a'.repeat(SQL_FULL_TEXT_MAX_BYTES)])
      expect(() => assertSqlFullText(text)).not.toThrow();
    expect(() => assertSqlFullText('中'.repeat(Math.ceil(SQL_FULL_TEXT_MAX_BYTES / 3)))).toThrow(
      '1 MiB'
    );
    expect(() => assertSqlFullText('a\0b')).toThrow('null character');
  });

  it('validates target metadata instead of accepting an incompatible schema', async () => {
    vi.mocked(PgClient.query).mockResolvedValueOnce({ rows: [identity] } as never);
    expect(await getPgFullTextMetadata()).toEqual(identity);
    for (const stale of [
      { ...identity, schemaVersion: 2 },
      { ...identity, analyzerVersion: 'pg-search-0.26.6-jieba-v1' }
    ]) {
      vi.mocked(PgClient.query).mockResolvedValueOnce({ rows: [stale] } as never);
      await expect(getPgFullTextMetadata()).rejects.toThrow();
    }
  });

  it.each([
    undefined,
    { extversion: '0.26.5', indisvalid: true, definition },
    { extversion: '0.26.6', indisvalid: false, definition },
    {
      extversion: '0.26.6',
      indisvalid: true,
      definition: definition.replace('pdb.literal', 'pdb.simple')
    },
    {
      extversion: '0.26.6',
      indisvalid: true,
      definition: definition.replace('pdb.whitespace', 'pdb.jieba')
    }
  ])('rejects incompatible or invalid indexes', async (row) => {
    vi.mocked(PgClient.query).mockResolvedValueOnce({ rows: row ? [row] : [] } as never);
    await expect(assertPgFullTextCapability()).rejects.toThrow('supported configuration');
  });

  it('prepares append-only DDL for the token column and whitespace index', async () => {
    vi.mocked(PgClient.query)
      .mockResolvedValueOnce({
        rows: [{ extversion: '0.26.6', indisvalid: true, definition }]
      } as never)
      .mockResolvedValueOnce({ rows: [identity] } as never);
    expect(await preparePgFullText()).toEqual(identity);
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toContain(
      'ALTER TABLE modeldata ADD COLUMN IF NOT EXISTS fulltext_tokens TEXT'
    );
    const createIndex = statements.find((sql) => sql.startsWith('CREATE INDEX'))!;
    expect(createIndex).toContain('modeldata_fulltext');
    expect(createIndex).toContain('fulltext_tokens::pdb.whitespace');
    expect(createIndex).not.toContain('key_field');
    expect(statements.some((sql) => sql.includes('VALUES (true, $1, 1, $2)'))).toBe(true);
    expect(statements).toContain('COMMIT');
    expect(statements.some((sql) => /DROP|DELETE|TRUNCATE/.test(sql))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back before building the index when existing metadata has an incompatible generation', async () => {
    const query = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ regclass: 'fastgpt_fulltext_metadata' }] };
      if (sql.includes('target_id AS "targetId"'))
        return { rows: [{ ...identity, schemaVersion: 99 }] };
      return query(sql);
    });
    await expect(preparePgFullText()).rejects.toThrow();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith('CREATE INDEX'))).toBe(
      false
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each(['150014', '160000'])(
    'rolls back unsupported PG version %s before changing modeldata',
    async (server_version_num) => {
      client.query.mockImplementation(async (sql: string) => ({
        rows: sql.startsWith('SHOW') ? [{ server_version_num }] : []
      }));
      await expect(preparePgFullText()).rejects.toThrow('15.19');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.query.mock.calls.some(([sql]) => sql.startsWith('ALTER TABLE'))).toBe(false);
      expect(client.release).toHaveBeenCalledOnce();
    }
  );

  it('rolls back when the extension version differs', async () => {
    const query = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT extversion')) return { rows: [{ extversion: '0.25.0' }] };
      return query(sql);
    });
    await expect(preparePgFullText()).rejects.toThrow('0.26.6');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('fills only NULL tokens with bound values, classifies mismatches and can validate without writing', async () => {
    const row = { vectorId: '123', teamId: 't', datasetId: 'd', collectionId: 'c', text: rawText };
    vi.mocked(PgClient.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: '123' }] } as never);
    expect(await fillPgFullText([row])).toEqual(['123']);
    const [sql, values] = vi.mocked(PgClient.query).mock.calls[0];
    expect(sql).toContain('SET fulltext_tokens = v.tokens');
    expect(sql).toContain('m.fulltext_tokens IS NULL');
    expect(sql).not.toContain(rawTokens);
    expect(values).toEqual(['123', 't', 'd', 'c', rawTokens]);
    vi.mocked(PgClient.query).mockClear();
    expect(await fillPgFullText([row], true)).toEqual([]);
    expect(PgClient.query).toHaveBeenCalledOnce();
    expect(vi.mocked(PgClient.query).mock.calls[0][0]).not.toContain('UPDATE');
    expect(vi.mocked(PgClient.query).mock.calls[0][0]).toContain(
      'm.fulltext_tokens IS DISTINCT FROM v.tokens'
    );
  });

  it('bounds token batches by both row count and UTF-8 bytes', async () => {
    const base = { vectorId: '123', teamId: 't', datasetId: 'd', collectionId: 'c' };
    const large = { ...base, tokens: '中'.repeat(200000) };
    expect([...splitSqlFullTextRows([large, large])].map((chunk) => chunk.length)).toEqual([1, 1]);
    const empty = Array.from({ length: 51 }, () => ({ ...base, tokens: '' }));
    expect([...splitSqlFullTextRows(empty)].map((chunk) => chunk.length)).toEqual([50, 1]);
    expect(await fillPgFullText([])).toEqual([]);
    expect(PgClient.query).not.toHaveBeenCalled();
  });

  it('short-circuits empty scopes and stopword-only queries, binding analyzed terms before Top-K', async () => {
    const props = {
      teamId: 't',
      datasetIds: ['d'],
      query: "' OR 1=1; 中文",
      limit: 10,
      forbidCollectionIdList: ['hidden']
    };
    for (const extra of [
      { query: ' ' },
      { query: '是什么意思？' },
      { limit: 0 },
      { datasetIds: [] },
      { filterCollectionIdList: [] },
      { filterCollectionIdList: ['hidden'] }
    ])
      expect(await searchPgFullText({ ...props, ...extra })).toEqual([]);
    expect(PgClient.query).not.toHaveBeenCalled();
    await searchPgFullText({ ...props, filterCollectionIdList: ['allowed', 'hidden'] });
    const [sql, values] = vi.mocked(PgClient.query).mock.calls[0];
    expect(sql).toContain('fulltext_tokens ||| $1::text[]');
    expect(sql).not.toContain(props.query);
    expect(values).toEqual([["'", '1', '=', ';', '中文'], 't', ['d'], ['allowed'], ['hidden'], 10]);
  });

  it('writes analyzed tokens, not raw text, in the same insert as the vectors', async () => {
    vi.mocked(PgClient.query).mockResolvedValueOnce({
      rows: [{ id: '1' }, { id: '2' }]
    } as never);
    const props = {
      teamId: 't',
      datasetId: 'd',
      collectionId: 'c',
      vectors: [
        [1, 0],
        [0, 1]
      ],
      texts: [rawText, '']
    };
    expect(await new PgVectorCtrl().insert(props)).toEqual({ insertIds: ['1', '2'] });
    const [sql, values] = vi.mocked(PgClient.query).mock.calls[0];
    expect(sql).toContain('(vector,team_id,dataset_id,collection_id,fulltext_tokens)');
    expect(values).toEqual(['[1,0]', 't', 'd', 'c', rawTokens, '[0,1]', 't', 'd', 'c', '']);
    await expect(new PgVectorCtrl().insert({ ...props, texts: [] })).rejects.toThrow(
      'match vector'
    );

    // 超过 500 行时在同一事务内分批绑定写入，避免超出 PG 协议参数上限
    let nextId = 1;
    client.query.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO')) {
        const tupleCount = sql.split('VALUES')[1].split('($').length - 1;
        return {
          rows: Array.from({ length: tupleCount }, () => ({ id: String(nextId++) }))
        };
      }
      return { rows: [] };
    });
    const batchResult = await new PgVectorCtrl().insert({
      teamId: 't',
      datasetId: 'd',
      collectionId: 'c',
      vectors: Array.from({ length: 502 }, () => [1, 0]),
      texts: Array.from({ length: 502 }, () => '')
    });
    expect(batchResult.insertIds).toHaveLength(502);
    expect(batchResult.insertIds[0]).toBe('1');
    expect(batchResult.insertIds[501]).toBe('502');
    const txCalls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(txCalls[0]).toBe('BEGIN');
    expect(txCalls.filter((sql) => sql.includes('INSERT INTO'))).toHaveLength(2);
    expect(txCalls.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
