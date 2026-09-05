import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import type {
  AdminSystemModelListItem,
  GetAdminSystemModelDetailResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

const mocks = vi.hoisted(() => ({
  getSystemModelDetail: vi.fn(),
  getTestModel: vi.fn(),
  postTestDraftModel: vi.fn(),
  toast: vi.fn(),
  refreshDetail: vi.fn(),
  detail: undefined as GetAdminSystemModelDetailResponse | undefined,
  loading: false
}));

vi.mock('@/web/core/ai/config', () => ({
  getSystemModelDetail: mocks.getSystemModelDetail,
  getTestModel: mocks.getTestModel,
  postTestDraftModel: mocks.postTestDraftModel,
  postSystemModel: vi.fn(),
  putReplaceSystemModelChannels: vi.fn(),
  putSystemModel: vi.fn()
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(value: T) => [value, vi.fn()],
  useEffect: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({
    data: mocks.detail,
    loading: mocks.loading,
    runAsync: mocks.refreshDetail
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: vi.fn(() => vi.fn()), ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/i18n/useClientTranslation', () => ({
  useClientTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/config/model', query: {}, push: vi.fn() })
}));

import { useModelEditWorkflow } from '@/pageComponents/account/model/useModelEditWorkflow';

describe('useModelEditWorkflow draft test wiring', () => {
  const model: AdminSystemModelListItem = {
    modelId: '68ad85a7463006c963799a05',
    scope: ModelScopeEnum.system,
    type: ModelTypeEnum.tts,
    provider: 'OpenAI',
    model: 'saved-tts',
    name: 'Saved model',
    config: { voices: [{ label: 'Saved voice', value: 'saved-voice' }] },
    channels: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loading = false;
    mocks.detail = {
      model,
      channels: [
        {
          id: 7,
          name: 'Edited model channel',
          status: 1,
          isAssociated: true,
          protocol: {
            name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
            avatar: 'model/openai'
          }
        }
      ]
    };
    mocks.postTestDraftModel.mockReset().mockResolvedValue(undefined);
    mocks.getTestModel.mockReset().mockResolvedValue(undefined);
  });

  it('exposes loaded detail and reads the attached current form rather than persisted model data', async () => {
    const workflow = useModelEditWorkflow({ model, onClose: vi.fn(), onSuccess: vi.fn() });
    expect(workflow.detail).toBe(mocks.detail);
    expect(workflow.loadingModelData).toBe(false);

    let draft: SystemModelDocumentDataType = {
      scope: ModelScopeEnum.system,
      type: ModelTypeEnum.tts,
      provider: 'Edited provider',
      model: '  form-model-id  ',
      name: 'Edited alias',
      requestUrl: 'https://draft.example.com/audio',
      requestAuth: 'edited-auth',
      config: { voices: [{ label: 'Edited voice', value: 'edited-voice' }] }
    };
    workflow.modelFormGetValuesRef.current = () => draft;

    await workflow.testModelChannel(7);

    expect(mocks.postTestDraftModel).toHaveBeenLastCalledWith({
      modelData: { ...draft, model: 'form-model-id' },
      channelId: 7
    });

    draft = {
      ...draft,
      requestAuth: 'second-edit',
      config: { voices: [{ label: 'New', value: 'new' }] }
    };
    await workflow.testModelChannel(7);

    expect(mocks.postTestDraftModel).toHaveBeenCalledTimes(2);
    expect(mocks.postTestDraftModel).toHaveBeenLastCalledWith({
      modelData: { ...draft, model: 'form-model-id' },
      channelId: 7
    });
    expect(mocks.getTestModel).not.toHaveBeenCalled();
  });

  it('never falls back to a saved model while the form has not attached its reader', async () => {
    const workflow = useModelEditWorkflow({ model, onClose: vi.fn(), onSuccess: vi.fn() });

    await workflow.testModelChannel(7);

    expect(mocks.getTestModel).not.toHaveBeenCalled();
    expect(mocks.postTestDraftModel).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'config_model:fill_model_id_before_test'
    });
  });

  it('exposes loading detail without requiring channel metadata to exist', async () => {
    mocks.detail = undefined;
    mocks.loading = true;
    const workflow = useModelEditWorkflow({ model, onClose: vi.fn(), onSuccess: vi.fn() });

    expect(workflow.detail).toBeUndefined();
    expect(workflow.loadingModelData).toBe(true);
    await workflow.testModelChannel(7);
    expect(mocks.getTestModel).not.toHaveBeenCalled();
    expect(mocks.postTestDraftModel).not.toHaveBeenCalled();
  });
});
