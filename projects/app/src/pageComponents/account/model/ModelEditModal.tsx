import { defaultChannel } from '@/global/aiproxy/constants';
import { Button } from '@chakra-ui/react';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/provider';
import type { AdminSystemModelListItem } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import dynamic from 'next/dynamic';
import ModelConfigForm from './ModelConfigForm';
import ModelLinkedChannels from './ModelLinkedChannels';
import { useModelEditWorkflow } from './useModelEditWorkflow';

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
  const {
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
  } = useModelEditWorkflow({ model, onSuccess, onClose });

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
            getValuesRef={modelFormGetValuesRef}
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
              getModelData: () => modelFormGetValuesRef.current?.(),
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
