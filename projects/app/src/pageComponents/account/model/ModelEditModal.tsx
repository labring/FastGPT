import { getSystemModelDetail, getTestModel } from '@/web/core/ai/config';
import { defaultChannel } from '@/global/aiproxy/constants';
import { Button } from '@chakra-ui/react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/provider';
import type { AdminSystemModelListItem } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useSet } from 'ahooks';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import ModelConfigForm from './ModelConfigForm';
import ModelLinkedChannels from './ModelLinkedChannels';
import { submitUpdatedSystemModel } from './submit';

const EditChannelModal = dynamic(() => import('./Channel/EditChannelModal'), { ssr: false });
const ModelChannelModal = dynamic(() => import('./ModelChannelModal'), { ssr: false });

const formId = 'system-model-edit-form';

/** 编辑弹窗只持有稳定 modelId，参数字段统一交给通用表单渲染和校验。 */
const ModelEditModal = ({
  model,
  providers,
  onSuccess,
  onClose
}: {
  model: AdminSystemModelListItem;
  providers: ModelProviderItemType[];
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
}) => {
  const { t } = useClientTranslation('config_model');
  const { toast } = useToast();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [testingChannelIds, testingChannelIdsDispatch] = useSet<number>();
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(new Set());
  const [persistedChannelIds, setPersistedChannelIds] = useState<Set<number>>(new Set());
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAssociateChannel, setShowAssociateChannel] = useState(false);
  const hasInitializedChannels = useRef(false);
  const { openConfirm: openLeaveConfirm, ConfirmModal: LeaveConfirmModal } = useConfirm();

  const testModelChannel = async (channelId: number) => {
    const channelName = detail?.channels.find((channel) => channel.id === channelId)?.name ?? '';
    const modelName = detail?.model.model ?? model.model;

    testingChannelIdsDispatch.add(channelId);
    try {
      await getTestModel({ modelId: model.modelId, channelId });
      toast({
        status: 'success',
        title: t('config_model:model_channel_test_success', {
          model: modelName,
          channel: channelName
        })
      });
    } catch (error) {
      toast({
        status: 'error',
        title: t('config_model:model_channel_test_failed', {
          model: modelName,
          channel: channelName,
          reason: getErrText(error)
        })
      });
    } finally {
      testingChannelIdsDispatch.remove(channelId);
    }
  };

  // 详情一次返回模型参数和渠道展示数据，避免编辑弹窗依赖列表快照或再次请求渠道接口。
  const {
    data: detail,
    runAsync: refreshDetail,
    loading: loadingModelData
  } = useRequest(() => getSystemModelDetail(model.modelId), { manual: false });

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

  return (
    <>
      <MyModal
        title={t('config_model:model.edit_model')}
        isOpen
        isLoading={loadingModelData}
        onClose={onClose}
        maxW={['80vw', '70vw']}
        w="800px"
        h="100%"
        footerStyles={{ display: 'flex', w: 'full' }}
        footer={
          <>
            <Button variant="whiteBase" size="md" onClick={onClose}>
              {t('common:Cancel')}
            </Button>
            <Button
              size="md"
              type="submit"
              form={formId}
              isDisabled={!detail}
              isLoading={submitting}
            >
              {t('common:Confirm')}
            </Button>
          </>
        }
      >
        {detail && (
          <ModelConfigForm
            formId={formId}
            modelData={(() => {
              const { modelId: _modelId, avatar: _avatar, ...documentData } = detail.model;
              return documentData;
            })()}
            providers={providers}
            isModelIdReadOnly
            channelSection={{
              title: t('config_model:associated_channels', {
                count: detail.channels.filter((channel) => selectedChannelIds.has(channel.id))
                  .length
              }),
              content: (
                <ModelLinkedChannels
                  channels={detail.channels}
                  selectedIds={selectedChannelIds}
                  onCreate={() => setShowCreateChannel(true)}
                  onAssociate={() => setShowAssociateChannel(true)}
                  onManage={goToChannelManagement}
                  onTest={(channelId) => void testModelChannel(channelId)}
                  testingChannelIds={testingChannelIds}
                  onRemove={(channelId) =>
                    setSelectedChannelIds((current) => {
                      const next = new Set(current);
                      next.delete(channelId);
                      return next;
                    })
                  }
                />
              )
            }}
            onSubmittingChange={setSubmitting}
            onDirtyChange={setIsFormDirty}
            onSuccess={() => {
              onClose();
              void Promise.resolve(onSuccess()).catch(() => {});
            }}
            onSubmit={submitModel}
          />
        )}
      </MyModal>

      {detail && showAssociateChannel && (
        <ModelChannelModal
          models={[
            {
              model: detail.model.model,
              modelId: detail.model.modelId,
              avatar: detail.model.avatar
            }
          ]}
          channels={detail.channels}
          selectedChannelIds={[...selectedChannelIds]}
          onConfirm={(channelIds) => {
            setSelectedChannelIds(new Set(channelIds));
            setShowAssociateChannel(false);
          }}
          onClose={() => setShowAssociateChannel(false)}
        />
      )}

      {detail && showCreateChannel && (
        <EditChannelModal
          defaultConfig={{ ...defaultChannel, models: [detail.model.model] }}
          fixedModel={{ model: detail.model.model, avatar: detail.model.avatar }}
          onSuccess={refreshAfterChannelCreated}
          onClose={() => setShowCreateChannel(false)}
        />
      )}

      <LeaveConfirmModal />
    </>
  );
};

export default ModelEditModal;
