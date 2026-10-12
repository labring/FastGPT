import { testModel, testDraftModel } from '@/web/core/ai/model/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { ModelChannelSummary } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useRef, useState } from 'react';
import { prepareDraftModelForTest } from './submit';

type ModelChannelTestTarget =
  | { source: 'draft'; getModelData: () => AIModelDocumentDataType | undefined }
  | { source: 'installed'; modelId: string; model: string };

/**
 * 渠道测试统一读取点击时的草稿，或显式测试已保存实例；两种来源不能隐式回退。
 * 同一渠道只允许一个在途请求，不同渠道独立反馈；不会保存草稿或更新渠道关联。
 */
export const useModelChannelTest = ({
  target,
  channels,
  channelType
}: {
  target?: ModelChannelTestTarget;
  channels: Pick<ModelChannelSummary, 'id' | 'name'>[];
  channelType: ChannelType;
}) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const inFlight = useRef(new Set<number>());
  const [testingChannelIds, setTestingChannelIds] = useState<ReadonlySet<number>>(new Set());

  const testModelChannel = async (channelId: number) => {
    if (!target || inFlight.current.has(channelId)) return;
    const draft = target.source === 'draft' ? target.getModelData() : undefined;
    const modelData = draft ? prepareDraftModelForTest(draft) : undefined;
    const model = target.source === 'installed' ? target.model : modelData?.model;
    if (!model) {
      toast({ status: 'warning', title: t('config_model:fill_model_id_before_test') });
      return;
    }
    if (
      modelData?.type === ModelTypeEnum.tts &&
      (!Array.isArray(modelData.config.voices) || modelData.config.voices.length === 0)
    ) {
      toast({ status: 'warning', title: t('config_model:fill_voice_before_test') });
      return;
    }

    const channel = channels.find((item) => item.id === channelId)?.name ?? '';
    inFlight.current.add(channelId);
    setTestingChannelIds(new Set(inFlight.current));
    try {
      if (target.source === 'installed') {
        await testModel({ modelId: target.modelId, channelId, channelType });
      } else if (modelData) {
        await testDraftModel({ modelData, channelId, channelType });
      }
      toast({
        status: 'success',
        title: t('config_model:model_channel_test_success', { model, channel })
      });
    } catch (error) {
      toast({
        status: 'error',
        title: t('config_model:model_channel_test_failed', {
          model,
          channel,
          reason: getErrText(error)
        })
      });
    } finally {
      inFlight.current.delete(channelId);
      setTestingChannelIds(new Set(inFlight.current));
    }
  };

  return { testingChannelIds, testModelChannel };
};
