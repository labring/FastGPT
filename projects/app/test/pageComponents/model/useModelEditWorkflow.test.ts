import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  AdminSystemModelListItem,
  GetAdminSystemModelDetailResponse
} from '@fastgpt/global/openapi/admin/system/model/api';

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
  putSystemModel: vi.fn()
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(value: T) => [value, vi.fn()],
  useMemo: <T>(fn: () => T) => fn(),
  useEffect: vi.fn()
}));

const channelMocks = vi.hoisted(() => ({
  getChannelList: vi.fn(),
  putChannel: vi.fn()
}));

vi.mock('@/web/core/ai/channel', () => ({
  getChannelList: channelMocks.getChannelList,
  putChannel: channelMocks.putChannel
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

import { useModelEditWorkflow } from '@/pageComponents/model/useModelEditWorkflow';

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

  it('immediately updates AI Proxy channel models on removeChannel', async () => {
    const mockChannel = {
      id: 7,
      name: 'Edited model channel',
      type: 1,
      base_url: 'https://api.openai.com',
      models: ['saved-tts', 'other-model']
    };
    channelMocks.getChannelList.mockResolvedValue([mockChannel]);
    channelMocks.putChannel.mockResolvedValue(undefined);

    const workflow = useModelEditWorkflow({ model, onClose: vi.fn(), onSuccess: vi.fn() });
    await workflow.removeChannel(7);

    expect(channelMocks.getChannelList).toHaveBeenCalledWith({ channelType: 'system' });
    expect(channelMocks.putChannel).toHaveBeenCalledWith({
      ...mockChannel,
      models: ['other-model'],
      channelType: 'system'
    });
    expect(mocks.refreshDetail).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'success',
      title: 'config_model:channel_disassociate_success'
    });
  });

  it('immediately persists new associations on associateChannels', async () => {
    const channel1 = { id: 7, name: 'ch1', type: 1, models: ['saved-tts'] };
    const channel2 = { id: 8, name: 'ch2', type: 1, models: [] };
    channelMocks.getChannelList.mockResolvedValue([channel1, channel2]);
    channelMocks.putChannel.mockResolvedValue(undefined);

    const workflow = useModelEditWorkflow({ model, onClose: vi.fn(), onSuccess: vi.fn() });
    // Associates channel 8 (new), keeps 7
    await workflow.associateChannels([7, 8]);

    expect(channelMocks.putChannel).toHaveBeenCalledWith({
      ...channel2,
      models: ['saved-tts'],
      channelType: 'system'
    });
    expect(mocks.refreshDetail).toHaveBeenCalled();
  });
});
