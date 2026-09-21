import { getSystemModelDetail } from '@/web/core/ai/config';
import { getChannelList, putChannel } from '@/web/core/ai/channel';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { AdminSystemModelListItem } from '@fastgpt/global/openapi/admin/system/model/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useMemo, useRef, useState } from 'react';
import type { ModelConfigFormGetValues } from './ModelConfigForm';
import { submitUpdatedSystemModel } from './submit';
import { useModelChannelTest } from './useModelChannelTest';

export type ModelEditWorkflowProps = {
  model: AdminSystemModelListItem;
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
  const { t } = useClientTranslation('config_model');
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
  } = useRequest(() => getSystemModelDetail(model.modelId, channelType), { manual: false });

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
    const channels = await getChannelList({ channelType });
    const currentAssociatedSet = new Set(
      detail.channels.filter((c) => c.isAssociated).map((c) => c.id)
    );
    const nextSelectedSet = new Set(nextSelectedIds);

    // 需新增绑定的渠道
    const toAdd = channels.filter(
      (c) => nextSelectedSet.has(c.id) && !currentAssociatedSet.has(c.id)
    );
    // 需解绑的渠道
    const toRemove = channels.filter(
      (c) => !nextSelectedSet.has(c.id) && currentAssociatedSet.has(c.id)
    );

    await Promise.all([
      ...toAdd.map((c) =>
        putChannel({
          ...c,
          models: [...new Set([...(c.models || []), detail.model.model])],
          channelType
        })
      ),
      ...toRemove.map((c) =>
        putChannel({
          ...c,
          models: (c.models || []).filter((m) => m !== detail.model.model),
          channelType
        })
      )
    ]);

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
  const refreshAfterChannelCreated = async () => {
    await Promise.all([
      refreshDetail().catch(() => {}),
      Promise.resolve(onSuccess()).catch(() => {})
    ]);
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
