import { getSystemModelDetail } from '@/web/core/ai/config';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import type { AdminSystemModelListItem } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import type { ModelConfigFormGetValues } from './ModelConfigForm';
import { submitUpdatedSystemModel } from './submit';
import { useModelChannelTest } from './useModelChannelTest';

export type ModelEditWorkflowProps = {
  model: AdminSystemModelListItem;
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
};

/** 编辑工作流统一持有详情、渠道草稿、测试和离开确认；UI 仅消费状态与操作。 */
export const useModelEditWorkflow = ({ model, onSuccess, onClose }: ModelEditWorkflowProps) => {
  const { t } = useClientTranslation('config_model');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const modelFormGetValuesRef = useRef<ModelConfigFormGetValues | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(new Set());
  const [persistedChannelIds, setPersistedChannelIds] = useState<Set<number>>(new Set());
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAssociateChannel, setShowAssociateChannel] = useState(false);
  const hasInitializedChannels = useRef(false);
  const { openConfirm: openLeaveConfirm, ConfirmModal: LeaveConfirmModal } = useConfirm();

  // 详情一次返回模型参数和渠道展示数据，避免编辑弹窗依赖列表快照或再次请求渠道接口。
  const {
    data: detail,
    runAsync: refreshDetail,
    loading: loadingModelData
  } = useRequest(() => getSystemModelDetail(model.modelId), { manual: false });
  const { testingChannelIds, testModelChannel } = useModelChannelTest({
    target: { source: 'draft', getModelData: () => modelFormGetValuesRef.current?.() },
    channels: detail?.channels ?? []
  });

  useEffect(() => {
    if (!detail || hasInitializedChannels.current) return;

    const associatedChannelIds = new Set(
      detail.channels.filter((channel) => channel.isAssociated).map((channel) => channel.id)
    );
    setSelectedChannelIds(associatedChannelIds);
    setPersistedChannelIds(associatedChannelIds);
    hasInitializedChannels.current = true;
  }, [detail]);

  const hasUnsavedChannelChanges =
    selectedChannelIds.size !== persistedChannelIds.size ||
    [...selectedChannelIds].some((channelId) => !persistedChannelIds.has(channelId));

  const submitModel = async (data: SystemModelDocumentDataType) => {
    await submitUpdatedSystemModel({
      modelId: model.modelId,
      modelData: data,
      channelIds: [...selectedChannelIds]
    });
  };

  /** 新建渠道会立即写入 AI Proxy；使用创建响应中的精确 ID 合并选择，避免列表差集误判。 */
  const refreshAfterChannelCreated = async (createdChannelId?: number) => {
    if (createdChannelId !== undefined) {
      setSelectedChannelIds((current) => new Set([...current, createdChannelId]));
    }

    // 渠道已经创建成功，详情或列表刷新失败不能把写入结果误报为创建失败。
    await Promise.all([
      refreshDetail()
        .then((refreshedDetail) => {
          setPersistedChannelIds(
            new Set(
              refreshedDetail.channels
                .filter((channel) => channel.isAssociated)
                .map((channel) => channel.id)
            )
          );
        })
        .catch(() => {}),
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
    if (!isFormDirty && !hasUnsavedChannelChanges) {
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
    modelFormGetValuesRef,
    selectedChannelIds,
    setSelectedChannelIds,
    showCreateChannel,
    setShowCreateChannel,
    showAssociateChannel,
    setShowAssociateChannel,
    goToChannelManagement,
    testModelChannel,
    testingChannelIds,
    setIsFormDirty,
    submitModel,
    refreshAfterChannelCreated,
    LeaveConfirmModal
  };
};
