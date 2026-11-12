import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OgClient } from '@fastgpt/service/common/vectorDB/opengauss/controller';
import { OpenGaussVectorCtrl } from '@fastgpt/service/common/vectorDB/opengauss';

const txClient = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('@fastgpt/service/common/vectorDB/opengauss/controller', () => ({
  connectOg: vi.fn(async () => ({ connect: async () => txClient })),
  OgClient: { query: vi.fn() }
}));

describe('OpenGaussVectorCtrl.init', () => {
  it('creates the vector and BM25 full-text schema and indexes on init', async () => {
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue({ rows: [] } as any);
    await new OpenGaussVectorCtrl().init();
    expect(OgClient.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH (m = 32, ef_construction = 256)')
    );
    expect(OgClient.query).toHaveBeenCalledWith(expect.stringContaining('storage_type=ASTORE'));
    expect(OgClient.query).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE modeldata ADD COLUMN fulltext_tokens TEXT;')
    );
    expect(OgClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE INDEX modeldata_fulltext ON modeldata USING bm25(fulltext_tokens);'
      )
    );

    vi.mocked(OgClient.query)
      .mockReset()
      .mockImplementation(async (sql) => {
        if (String(sql).includes('USING bm25')) {
          throw new Error('bm25 access method unsupported');
        }
        return { rows: [] } as any;
      });
    await expect(new OpenGaussVectorCtrl().init()).resolves.toBeUndefined();
  });
});

describe('OpenGaussVectorCtrl.embRecall', () => {
  beforeEach(() => {
    global.systemEnv = {} as any;
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue([{}, { rows: [] }] as any);
  });

  it.each([undefined, 100])('scopes the query and applies search width %j', async (configured) => {
    if (configured !== undefined) global.systemEnv.hnswEfSearch = configured;
    await new OpenGaussVectorCtrl().embRecall({
      teamId: 'team-a',
      datasetIds: ['dataset-a', 'dataset-b'],
      vector: [0.1, 0.2],
      limit: 20,
      forbidCollectionIdList: [],
      filterCollectionIdList: undefined
    });

    expect(OgClient.query).toHaveBeenCalledOnce();
    const [query] = vi.mocked(OgClient.query).mock.calls[0];
    expect(query).toMatchObject({ query_timeout: 120_000 });
    const sql = typeof query === 'string' ? query : query.text;
    expect(sql).toContain(`SET LOCAL hnsw.ef_search = ${configured ?? 200};`);
    expect(sql).toMatch(
      /WHERE\s+team_id = 'team-a'\s+AND dataset_id IN \('dataset-a','dataset-b'\)/
    );
  });
});

describe('OpenGaussVectorCtrl.refreshCreateTime', () => {
  beforeEach(() => {
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue({ rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] });
  });

  it('updates only the selected team and IDs through bound parameters', async () => {
    await new OpenGaussVectorCtrl().refreshCreateTime({ teamId: "team'", idList: ['1', '2'] });
    expect(OgClient.query).toHaveBeenCalledWith(
      'UPDATE modeldata SET createtime = CURRENT_TIMESTAMP WHERE team_id = $1 AND id = ANY($2::bigint[])',
      ["team'", ['1', '2']]
    );
  });

  it('skips empty lists and propagates database errors', async () => {
    const ctrl = new OpenGaussVectorCtrl();
    await ctrl.refreshCreateTime({ teamId: 'team', idList: [] });
    expect(OgClient.query).not.toHaveBeenCalled();
    vi.mocked(OgClient.query).mockRejectedValue(new Error('offline'));
    await expect(ctrl.refreshCreateTime({ teamId: 'team', idList: ['1'] })).rejects.toThrow(
      'offline'
    );
  });
});

describe('OpenGaussVectorCtrl native text writes', () => {
  it('writes analyzed tokens and vector in the same bound insert with stable ID order', async () => {
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue({
        rows: [{ id: '1' }, { id: '2' }],
        rowCount: 2,
        command: 'INSERT',
        oid: 0,
        fields: []
      });
    const props = {
      teamId: 't',
      datasetId: 'd',
      collectionId: 'c',
      vectors: [
        [1, 0],
        [0, 1]
      ],
      texts: ["O'Reilly 中文", '']
    };
    expect(await new OpenGaussVectorCtrl().insert(props)).toEqual({ insertIds: ['1', '2'] });
    const [sql, values] = vi.mocked(OgClient.query).mock.calls[0];
    expect(sql).not.toContain(props.texts[0]);
    expect(sql).toContain('(vector,team_id,dataset_id,collection_id,fulltext_tokens)');
    // 外置分析器输出：jieba 搜索模式 + 小写 + 停用词过滤
    expect(values).toEqual(['[1,0]', 't', 'd', 'c', "o ' reilly 中文", '[0,1]', 't', 'd', 'c', '']);
    await expect(new OpenGaussVectorCtrl().insert({ ...props, texts: [] })).rejects.toThrow(
      'match vector'
    );
    expect(await new OpenGaussVectorCtrl().insert({ ...props, texts: [], vectors: [] })).toEqual({
      insertIds: []
    });

    let nextId = 1;
    txClient.release.mockReset();
    txClient.query.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO')) {
        const tupleCount = sql.split('VALUES')[1].split('($').length - 1;
        return {
          rows: Array.from({ length: tupleCount }, () => ({ id: String(nextId++) }))
        };
      }
      return { rows: [] };
    });
    const batchResult = await new OpenGaussVectorCtrl().insert({
      teamId: 't',
      datasetId: 'd',
      collectionId: 'c',
      vectors: Array.from({ length: 502 }, () => [1, 0]),
      texts: Array.from({ length: 502 }, () => '')
    });
    expect(batchResult.insertIds).toHaveLength(502);
    expect(txClient.query.mock.calls.map(([sql]) => String(sql))[0]).toBe('BEGIN');
    expect(txClient.query.mock.calls.map(([sql]) => String(sql)).at(-1)).toBe('COMMIT');
    expect(txClient.release).toHaveBeenCalledOnce();
  });
});
