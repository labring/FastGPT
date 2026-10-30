import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DatasetSearchProps,
  DatasetSearchUsage
} from '@fastgpt/service/core/dataset/search/type';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  rate: vi.fn(),
  balance: vi.fn(),
  price: vi.fn(),
  bill: vi.fn(),
  keyUsage: vi.fn(),
  audit: vi.fn(),
  model: vi.fn()
}));
vi.mock('@fastgpt/service/core/dataset/search/service', () => ({ search: mocks.search }));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.model
}));
vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  assertTeamFrequencyLimit: mocks.rate,
  LimitTypeEnum: { chat: 'chat' }
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: mocks.balance
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: mocks.price
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({ createUsage: mocks.bill }));
vi.mock('@fastgpt/service/support/openapi/tools', () => ({ updateApiKeyUsage: mocks.keyUsage }));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mocks.audit,
  getI18nDatasetType: (type: string) => type
}));
import { searchDatasetForApi } from '@/service/core/dataset/search';

const auth = { teamId: 'team', tmbId: 'member', isRoot: false, apikey: 'test-key' };
const params = { scope: { datasetIds: ['507f1f77bcf86cd799439011'] }, query: { text: 'q' } };
const model: EmbeddingModelDataType = {
  provider: 'test',
  model: 'embedding',
  name: 'Embedding',
  modelId: 'model',
  scope: ModelScopeEnum.system,
  type: ModelTypeEnum.embedding,
  config: { defaultToken: 512, maxToken: 8192, weight: 0 }
};
let usage: DatasetSearchUsage;

beforeEach(() => {
  vi.clearAllMocks();
  usage = {
    items: [
      { phase: 'embedding', model, inputTokens: 10, outputTokens: 0, usedUserOpenAIKey: false }
    ]
  };
  mocks.price.mockImplementation(({ inputTokens, outputTokens }) => ({
    totalPoints: inputTokens + outputTokens
  }));
  mocks.search.mockImplementation(async ({ deps }: DatasetSearchProps) => {
    await deps.beforeSearch();
    await deps.onUsage(usage);
    await deps.onSearched?.({
      datasets: [{ _id: 'dataset', name: 'Knowledge', type: DatasetTypeEnum.dataset }],
      resultCount: 0,
      durationMs: 1
    });
    return { list: [] };
  });
});

describe('search API business adapter', () => {
  it('checks policies before recording actual use and updates API Key consumption once', async () => {
    await searchDatasetForApi({ params, auth });
    expect(mocks.rate).toHaveBeenCalledExactlyOnceWith({ teamId: 'team', type: 'chat' });
    expect(mocks.balance).toHaveBeenCalledExactlyOnceWith('team');
    expect(mocks.bill).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: 'api',
        totalPoints: 10,
        list: [expect.objectContaining({ modelId: 'model', inputTokens: 10, amount: 10 })]
      })
    );
    expect(mocks.keyUsage).toHaveBeenCalledExactlyOnceWith({ apikey: 'test-key', totalPoints: 10 });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it('does not bill empty usage or bill user-provided model credentials', async () => {
    usage = { items: [] };
    await searchDatasetForApi({ params, auth });
    expect(mocks.bill).not.toHaveBeenCalled();
    usage = {
      items: [
        {
          phase: 'queryExtension',
          model,
          inputTokens: 10,
          outputTokens: 20,
          usedUserOpenAIKey: true
        }
      ]
    };
    await searchDatasetForApi({ params, auth: { ...auth, apikey: '' } });
    expect(mocks.bill).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'fastgpt', totalPoints: 0 })
    );
    expect(mocks.keyUsage).not.toHaveBeenCalled();
    expect(mocks.price).not.toHaveBeenCalled();
  });

  it('does not charge when frequency or balance policy fails, and audit failures do not invalidate a result', async () => {
    mocks.rate.mockRejectedValueOnce(new Error('rate limit'));
    await expect(searchDatasetForApi({ params, auth })).rejects.toThrow('rate limit');
    expect(mocks.bill).not.toHaveBeenCalled();
    mocks.balance.mockRejectedValueOnce(new Error('balance'));
    await expect(searchDatasetForApi({ params, auth })).rejects.toThrow('balance');
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    expect(await searchDatasetForApi({ params, auth })).toEqual({ list: [] });
  });
});
