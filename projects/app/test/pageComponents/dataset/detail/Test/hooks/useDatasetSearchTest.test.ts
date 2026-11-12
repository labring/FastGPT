import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { SearchDatasetBodySchema } from '@fastgpt/global/openapi/core/dataset/search/api';
import type { SearchDatasetResponse } from '@fastgpt/global/openapi/core/dataset/search/api';
import type { SearchTestFormType } from '@/pageComponents/dataset/detail/Test/type';
import type { SearchTestStoreItemType } from '@/web/core/dataset/store/searchTest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  pushHistory: vi.fn(),
  setCurrent: vi.fn(),
  toast: vi.fn(),
  current: undefined as SearchTestStoreItemType | undefined,
  form: undefined as SearchTestFormType | undefined
}));

vi.mock('@/web/common/api/request', () => ({
  POST: mocks.post,
  GET: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn()
}));
vi.mock('@/web/core/dataset/store/searchTest', () => ({
  useSearchTestStore: () => ({ pushDatasetTestItem: mocks.pushHistory })
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: () => [mocks.current, mocks.setCurrent]
}));
vi.mock('react-hook-form', () => ({
  useWatch: () => mocks.form!.inputText,
  useForm: ({ defaultValues }: { defaultValues: SearchTestFormType }) => {
    mocks.form ??= defaultValues;
    return {
      control: {},
      getValues: (key: keyof SearchTestFormType) => mocks.form![key],
      setValue: vi.fn(),
      register: vi.fn(),
      handleSubmit: (submit: (data: SearchTestFormType) => Promise<unknown>) => () =>
        submit(mocks.form!)
    };
  }
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (
    request: (data: SearchTestFormType) => Promise<SearchDatasetResponse>,
    options: { onSuccess: (response: SearchDatasetResponse) => void }
  ) => ({
    runAsync: async (data: SearchTestFormType) => options.onSuccess(await request(data)),
    loading: false
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { useDatasetSearchTest } from '@/pageComponents/dataset/detail/Test/hooks/useDatasetSearchTest';

const datasetId = '507f1f77bcf86cd799439011';
const response: SearchDatasetResponse = {
  list: [
    {
      id: '507f1f77bcf86cd799439012',
      datasetId,
      collectionId: '507f1f77bcf86cd799439013',
      q: 'question',
      a: 'answer',
      chunkIndex: 0,
      updateTime: new Date('2026-11-12T00:00:00Z'),
      sourceName: 'fixture',
      score: []
    }
  ],
  meta: {
    durationMs: 1234,
    searchMode: DatasetSearchModeEnum.embedding,
    maxTokens: 5000,
    similarity: 0,
    usingReRank: false,
    usingSimilarityFilter: true
  }
};

describe('useDatasetSearchTest unified search migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.form = undefined;
    mocks.current = undefined;
    mocks.post.mockResolvedValue(response);
  });

  it('sends the grouped default request and keeps the existing history format', async () => {
    const hook = useDatasetSearchTest({ datasetId, queryImageRefs: [] });
    mocks.form!.inputText = '  question  ';
    await hook.onSubmit();

    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/core/dataset/search', {
      usageScene: 'searchTest',
      scope: { datasetIds: [datasetId] },
      query: { text: 'question', imageKeys: [] },
      retrieval: { mode: 'embedding', embeddingWeight: 0.5 },
      rerank: { enabled: false },
      queryExtension: { enabled: false },
      result: { maxTokens: 5000, similarity: 0 }
    });
    expect(SearchDatasetBodySchema.safeParse(mocks.post.mock.calls[0][1]).success).toBe(true);
    expect(mocks.pushHistory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        datasetId,
        text: 'question',
        results: response.list,
        duration: '1.234s',
        searchMode: 'embedding',
        usingReRank: false,
        limit: 5000,
        similarity: 0,
        queryImageRefs: undefined,
        queryExtensionModel: undefined
      })
    );
    expect(mocks.setCurrent).toHaveBeenCalledWith(mocks.pushHistory.mock.calls[0][0]);
  });

  it('sends model IDs and owned image keys while displaying actual execution metadata', async () => {
    const images = [{ key: 'temp/team/image.png', previewUrl: 'blob:local-preview' }];
    const hook = useDatasetSearchTest({ datasetId, queryImageRefs: images });
    mocks.form = {
      inputText: 'question',
      searchParams: {
        searchMode: DatasetSearchModeEnum.mixedRecall,
        embeddingWeight: 0,
        usingReRank: true,
        rerankModelId: 'rerank-model-id',
        rerankWeight: 0,
        rerankCandidateNum: 10,
        datasetSearchUsingExtensionQuery: true,
        datasetSearchExtensionModelId: 'extension-model-id',
        datasetSearchExtensionBg: 'context',
        limit: 100,
        similarity: 0
      }
    };
    mocks.post.mockResolvedValue({
      ...response,
      meta: {
        ...response.meta,
        maxTokens: 100,
        searchMode: 'mixedRecall',
        usingReRank: false,
        queryExtensionModelId: 'actual-extension-model-id'
      }
    });
    await hook.onSubmit();
    const body = mocks.post.mock.calls[0][1];
    expect(SearchDatasetBodySchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      query: { text: 'question', imageKeys: [images[0].key] },
      retrieval: { mode: 'mixedRecall', embeddingWeight: 0 },
      rerank: { enabled: true, modelId: 'rerank-model-id', weight: 0, candidateNum: 10 },
      queryExtension: { enabled: true, modelId: 'extension-model-id', background: 'context' }
    });
    expect(JSON.stringify(body)).not.toContain('blob:');
    expect(mocks.pushHistory.mock.calls[0][0]).toMatchObject({
      queryImageRefs: images,
      limit: 100,
      searchMode: 'mixedRecall',
      usingReRank: false,
      queryExtensionModel: 'actual-extension-model-id'
    });
  });

  it('omits empty model choices for image-only requests and drops disabled configuration', async () => {
    const hook = useDatasetSearchTest({
      datasetId,
      queryImageRefs: [
        {
          key: 'temp/team/image.png',
          previewUrl: 'blob:local-preview'
        }
      ]
    });
    Object.assign(mocks.form!.searchParams, {
      usingReRank: true,
      rerankModelId: '',
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: '  '
    });
    await hook.onSubmit();
    expect(SearchDatasetBodySchema.parse(mocks.post.mock.calls[0][1])).toMatchObject({
      query: { text: '', imageKeys: ['temp/team/image.png'] },
      rerank: { enabled: true, modelId: undefined },
      queryExtension: { enabled: true, modelId: undefined }
    });
    Object.assign(mocks.form!.searchParams, {
      usingReRank: false,
      rerankModelId: 'stale-rerank',
      datasetSearchUsingExtensionQuery: false,
      datasetSearchExtensionModelId: 'stale-extension'
    });
    await hook.onSubmit();
    expect(mocks.post.mock.calls[1][1]).toMatchObject({
      rerank: { enabled: false },
      queryExtension: { enabled: false }
    });
    expect(SearchDatasetBodySchema.safeParse(mocks.post.mock.calls[1][1]).success).toBe(true);
  });

  it('warns without persisting empty results and leaves failed requests out of history', async () => {
    const hook = useDatasetSearchTest({ datasetId, queryImageRefs: [] });
    mocks.form!.inputText = 'question';
    mocks.post.mockResolvedValue({ ...response, list: [] });
    await hook.onSubmit();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'warning',
      title: 'common:dataset.test.noResult'
    });
    expect(mocks.pushHistory).not.toHaveBeenCalled();
    expect(mocks.setCurrent).not.toHaveBeenCalled();
    mocks.post.mockRejectedValue(new Error('Search failed'));
    await expect(hook.onSubmit()).rejects.toThrow('Search failed');
    expect(mocks.pushHistory).not.toHaveBeenCalled();
  });

  it('only shows a selected history entry for the current dataset', () => {
    mocks.current = { datasetId } as SearchTestStoreItemType;
    expect(useDatasetSearchTest({ datasetId, queryImageRefs: [] }).currentDatasetTestItem).toBe(
      mocks.current
    );
    expect(
      useDatasetSearchTest({ datasetId: 'other-dataset', queryImageRefs: [] })
        .currentDatasetTestItem
    ).toBeUndefined();
  });
});
