import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startSqlFullTextIndexBuild, mode } = vi.hoisted(() => ({
  startSqlFullTextIndexBuild: vi.fn(),
  mode: { compatibility: false }
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      get TMP_MIGRATE_FULL_TEXT() {
        return mode.compatibility;
      }
    }
  };
});
vi.mock('@fastgpt/service/common/vectorDB/fullText/controller', () => ({
  startSqlFullTextIndexBuild
}));
import { OgClient } from '@fastgpt/service/common/vectorDB/opengauss/controller';
vi.unmock('@fastgpt/service/common/vectorDB/opengauss');
import { OpenGaussVectorCtrl } from '@fastgpt/service/common/vectorDB/opengauss';

const txClient = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('@fastgpt/service/common/vectorDB/opengauss/controller', () => ({
  connectOg: vi.fn(async () => ({ connect: async () => txClient })),
  OgClient: { query: vi.fn() }
}));

describe('OpenGaussVectorCtrl.init', () => {
  it.each([false, true])(
    'prepares the vector schema with compatibility mode set to %s',
    async (compatibility) => {
      mode.compatibility = compatibility;
      startSqlFullTextIndexBuild.mockClear();
      vi.mocked(OgClient.query)
        .mockReset()
        .mockResolvedValue({ rows: [] } as any);
      await new OpenGaussVectorCtrl().init();
      expect(
        vi.mocked(OgClient.query).mock.calls.some(([sql]) => String(sql).includes('USING hnsw'))
      ).toBe(false);
      expect(OgClient.query).toHaveBeenCalledWith(expect.stringContaining('storage_type=ASTORE'));
      expect(OgClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE modeldata ADD COLUMN fulltext_tokens TEXT;')
      );
      if (compatibility) {
        expect(startSqlFullTextIndexBuild).not.toHaveBeenCalled();
      } else {
        expect(startSqlFullTextIndexBuild).toHaveBeenCalledWith('opengauss');
      }
      expect(
        vi.mocked(OgClient.query).mock.calls.some(([sql]) => String(sql).includes('USING bm25'))
      ).toBe(false);
    }
  );
});

describe('OpenGaussVectorCtrl.embRecall', () => {
  beforeEach(() => {
    vi.mocked(OgClient.query)
      .mockReset()
      .mockResolvedValue({ rows: [] } as any);
    txClient.query.mockReset().mockResolvedValue({ rows: [] });
    txClient.release.mockClear();
  });

  const props = {
    teamId: 'team-a',
    datasetIds: ['dataset-a', 'dataset-b'],
    vector: [0.1, 0.2],
    limit: 20,
    hnswEfSearch: 128,
    forbidCollectionIdList: ['blocked'],
    filterCollectionIdList: ['allowed', 'blocked']
  };

  it('uses the dataset HNSW and exact branches under identical tenant and collection filters', async () => {
    await new OpenGaussVectorCtrl().embRecall({
      ...props,
      datasetVectorData: [
        { datasetId: 'dataset-a', rows: 12000, openGaussIndex: 'ready' },
        { datasetId: 'dataset-b', rows: 500, openGaussIndex: 'none' }
      ]
    });

    expect(txClient.query).toHaveBeenNthCalledWith(
      2,
      "SELECT set_config('hnsw_ef_search', $1, true)",
      ['128']
    );
    const [query, values] = txClient.query.mock.calls[2];
    expect(query).toMatchObject({ query_timeout: 120_000 });
    expect(query.text).toContain(
      "WHERE team_id = 'team-a' AND collection_id = ANY($3::varchar[]) AND dataset_id = 'dataset-a'"
    );
    expect(query.text).toContain(
      "WHERE team_id = 'team-a' AND collection_id = ANY($3::varchar[]) AND dataset_id = ANY($4::varchar[])"
    );
    expect(query.text).toContain('UNION ALL');
    expect(values).toEqual(['[0.1,0.2]', 20, ['allowed'], ['dataset-b']]);
    expect(txClient.release).toHaveBeenCalledWith(false);
  });

  it('uses exact search until the index has been validated', async () => {
    await new OpenGaussVectorCtrl().embRecall(props);
    expect(OgClient.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('ORDER BY (vector <#> $1::vector) + 0')
      }),
      ['[0.1,0.2]', 20, ['allowed'], ['dataset-a', 'dataset-b']]
    );
    expect(txClient.query).not.toHaveBeenCalled();
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
