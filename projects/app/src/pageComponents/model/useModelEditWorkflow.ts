import { getModelDetail } from '@/web/core/ai/model/api';
import { getChannelList, putChannel } from '@/web/core/ai/channel';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { SystemModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useMemo, useRef, useState } from 'react';
import type { ModelConfigFormGetValues } from './ModelConfigForm';
import { submitUpdatedSystemModel } from './submit';
import { useModelChannelTest } from './useModelChannelTest';

export type ModelEditWorkflowProps = {
  model: SystemModelListItem;
  channelType?: 'system' | 'team';
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
};

/** 编辑工作流统一持有详情、渠道即时联动、测试和离开确认；UI 仅消费状态与操作。 */
export const useModelEditWorkflow = ({
  model,
  channelType = 'system',
  onSuccess,
  onClose
}: ModelEditWorkflowProps) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [draftModel, setDraftModel] = useState(model.model);
  const modelFormGetValuesRef = useRef<ModelConfigFormGetValues | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAssociateChannel, setShowAssociateChannel] = useState(false);
  const { openConfirm: openLeaveConfirm, ConfirmModal: LeaveConfirmModal } = useConfirm();

  // 详情一次返回模型参数和渠道展示数据
  const {
    data: detail,
    runAsync: refreshDetail,
    loading: loadingModelData
  } = useRequest(() => getModelDetail(model.modelId, channelType), { manual: false });

  const { testingChannelIds, testModelChannel } = useModelChannelTest({
    target: { source: 'draft', getModelData: () => modelFormGetValuesRef.current?.() },
    channels: detail?.channels ?? []
  });

  const selectedChannelIds = useMemo(
    () =>
      new Set(
        detail?.channels.filter((channel) => channel.isAssociated).map((channel) => channel.id) ??
          []
      ),
    [detail?.channels]
  );

  /** 即时解除渠道与当前模型的关联并持久化到 AI Proxy */
  const removeChannel = async (channelId: number) => {
    if (!detail) return;
    const channels = await getChannelList({ channelType });
    const targetChannel = channels.find((channel) => channel.id === channelId);
    if (!targetChannel) return;

    const nextModels = (targetChannel.models || []).filter((m) => m !== detail.model.model);
    await putChannel({
      ...targetChannel,
      models: nextModels,
      channelType
    });

    await refreshDetail();
    toast({
      status: 'success',
      title: t('config_model:channel_disassociate_success')
    });
  };

  /** 即时关联已有渠道到当前模型并持久化到 AI Proxy */
  const associateChannels = async (nextSelectedIds: number[]) => {
    if (!detail) return;
    const channels = await getChannelList({ channelType, pageSize: 1000 });
    const currentAssociatedIds = new Set(
      detail.channels.filter((c) => c.isAssociated).map((c) => c.id)
    );
    const nextSelectedSet = new Set(nextSelectedIds);
    const modelName = detail.model.model;

    const toAdd = channels.filter(
      (c) => nextSelectedSet.has(c.id) && !currentAssociatedIds.has(c.id)
    );
    const toRemove = channels.filter(
      (c) => !nextSelectedSet.has(c.id) && currentAssociatedIds.has(c.id)
    );

    const updates = [
      ...toAdd.map((c) => ({
        ...c,
        models: Array.from(new Set([...(c.models || []), modelName]))
      })),
      ...toRemove.map((c) => ({
        ...c,
        models: (c.models || []).filter((m) => m !== modelName)
      }))
    ];

    await Promise.all(updates.map((update) => putChannel({ ...update, channelType })));

    await refreshDetail();
    setShowAssociateChannel(false);
    toast({
      status: 'success',
      title: t('common:Success')
    });
  };

  const submitModel = async (data: SystemModelDocumentDataType) => {
    await submitUpdatedSystemModel({
      modelId: model.modelId,
      modelData: data,
      channelType
    });
  };

  /** 新建渠道成功后刷新 */
  const refreshAfterChannelCreated = () => {
    refreshDetail();
    onSuccess();
  };

  const navigateToChannelManagement = () => {
    onClose();
    void router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, modelTab: 'channel' }
      },
      undefined,
      { shallow: true }
    );
  };

  const goToChannelManagement = () => {
    if (!isFormDirty) {
      navigateToChannelManagement();
      return;
    }

    openLeaveConfirm({
      title: t('config_model:confirm_go_to_channel_management'),
      customContent: t('config_model:unsaved_model_config_leave_tip'),
      confirmButtonVariant: 'dangerFill',
      onConfirm: navigateToChannelManagement
    })();
  };

  return {
    t,
    detail,
    loadingModelData,
    submitting,
    setSubmitting,
    draftModel,
    setDraftModel,
    modelFormGetValuesRef,
    selectedChannelIds,
    showCreateChannel,
    setShowCreateChannel,
    showAssociateChannel,
    setShowAssociateChannel,
    goToChannelManagement,
    testModelChannel,
    testingChannelIds,
    setIsFormDirty,
    submitModel,
    removeChannel,
    associateChannels,
    refreshAfterChannelCreated,
    LeaveConfirmModal
  };
};
