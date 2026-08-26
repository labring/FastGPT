import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  updateMany: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  session: { id: 'session-1' }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoSystemModel: {
    updateMany: mocks.updateMany
  }
}));

vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn(async (callback: (session: unknown) => Promise<unknown>) =>
    callback(mocks.session)
  )
}));

import handler from '@/pages/api/core/ai/model/updateDefault';

describe('PUT /api/core/ai/model/updateDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ acknowledged: true });
    mocks.updatedReloadSystemModel.mockResolvedValue(undefined);
  });

  it('updates flattened default flags by model ObjectId', async () => {
    const ids = {
      llm: '68ad85a7463006c963799a01',
      embedding: '68ad85a7463006c963799a02',
      datasetText: '68ad85a7463006c963799a03',
      datasetImage: '68ad85a7463006c963799a04',
      chatTitle: '68ad85a7463006c963799a05'
    };

    await handler({
      body: {
        [ModelTypeEnum.llm]: ids.llm,
        [ModelTypeEnum.embedding]: ids.embedding,
        datasetTextLLMModelId: ids.datasetText,
        datasetImageLLMModelId: ids.datasetImage,
        chatTitleLLMModelId: ids.chatTitle
      }
    } as any);

    expect(mocks.authSystemAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    const [, pipeline, options] = mocks.updateMany.mock.calls[0];
    const set = pipeline[0].$set;

    expect(options).toEqual({ session: mocks.session });
    expect(Object.keys(set)).toEqual([
      'isDefault',
      'isDefaultDatasetTextModel',
      'isDefaultDatasetImageModel',
      'isDefaultChatTitleModel'
    ]);
    expect(set.isDefault.$cond[0].$in[1].map(String)).toEqual([ids.llm, ids.embedding]);
    expect(String(set.isDefaultDatasetTextModel.$cond[0].$eq[1])).toBe(ids.datasetText);
    expect(String(set.isDefaultDatasetImageModel.$cond[0].$eq[1])).toBe(ids.datasetImage);
    expect(String(set.isDefaultChatTitleModel.$cond[0].$eq[1])).toBe(ids.chatTitle);
    expect(JSON.stringify(pipeline)).not.toContain('metadata.');
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledTimes(1);
  });

  it('rejects legacy model names at this non-OpenAPI boundary', async () => {
    await expect(
      handler({
        body: {
          [ModelTypeEnum.llm]: 'gpt-4o'
        }
      } as any)
    ).rejects.toBeInstanceOf(ApiRequestInputParseError);

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });
});
