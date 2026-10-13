import { getModelDetail, postUpdateModelChannels } from '@/web/core/ai/model/api';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useMemo, useRef, useState } from 'react';
import type { ModelConfigFormGetValues } from './ModelConfigForm';
import { submitUpdatedModel } from './submit';
import { useModelChannelTest } from './useModelChannelTest';

type ModelEditWorkflowProps = {
  model: ModelConfigListItem;
  channelType: ChannelType;
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
};

/** 编辑工作流统一持有详情、渠道即时联动、测试和离开确认；UI 仅消费状态与操作。 */
export const useModelEditWorkflow = ({
  model,
  channelType,
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
    channels: detail?.channels ?? [],
    channelType
  });

  const selectedChannelIds = useMemo(
    () =>
      new Set(
        detail?.channels.filter((channel) => channel.isAssociated).map((channel) => channel.id) ??
          []
      ),
    [detail?.channels]
  );

  /** 即时渠道写入同时刷新详情和父列表；取消编辑不能撤销已经提交的渠道关联。 */
  const refreshChannelBindings = async () => {
    await Promise.all([refreshDetail(), onSuccess()]);
  };

  /** 即时解除渠道与当前模型的关联，由服务端原子清理渠道内的模型映射 */
  const removeChannel = async (channelId: number) => {
    if (!detail) return;
    await postUpdateModelChannels({
      modelId: model.modelId,
      channelType,
      removeChannelIds: [channelId]
    });

    await refreshChannelBindings();
    toast({
      status: 'success',
      title: t('config_model:channel_disassociate_success')
    });
  };

  /** 即时调整当前模型关联的渠道，差集计算与渠道写回都由服务端完成 */
  const associateChannels = async (nextSelectedIds: number[]) => {
    if (!detail) return;
    const currentAssociatedIds = new Set(
      detail.channels.filter((c) => c.isAssociated).map((c) => c.id)
    );
    const nextSelectedSet = new Set(nextSelectedIds);

    await postUpdateModelChannels({
      modelId: model.modelId,
      channelType,
      addChannelIds: nextSelectedIds.filter((id) => !currentAssociatedIds.has(id)),
      removeChannelIds: [...currentAssociatedIds].filter((id) => !nextSelectedSet.has(id))
    });

    await refreshChannelBindings();
    setShowAssociateChannel(false);
    toast({
      status: 'success',
      title: t('common:Success')
    });
  };

  const submitModel = async (data: AIModelDocumentDataType) => {
    await submitUpdatedModel({
      modelId: model.modelId,
      modelData: data,
      channelType
    });
  };

  /** 新建渠道成功后刷新 */
  const refreshAfterChannelCreated = refreshChannelBindings;

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
