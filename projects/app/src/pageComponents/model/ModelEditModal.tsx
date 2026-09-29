import { defaultChannel } from '@fastgpt/global/core/ai/channel';
import { Button } from '@chakra-ui/react';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';
import type { SystemModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';
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
  channelType = 'system',
  onSuccess,
  onClose
}: {
  model: SystemModelListItem;
  providers: ModelProviderItemType[];
  channelType?: 'system' | 'team';
  onSuccess: () => void | Promise<void>;
  onClose: () => void;
}) => {
  const {
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
  } = useModelEditWorkflow({ model, channelType, onSuccess, onClose });

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
            channelType={channelType}
            modelData={(() => {
              const { modelId: _modelId, avatar: _avatar, ...documentData } = detail.model;
              return documentData;
            })()}
            providers={providers}
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
                  onRemove={(channelId) => void removeChannel(channelId)}
                />
              )
            }}
            onSubmittingChange={setSubmitting}
            onModelChange={setDraftModel}
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
              model: draftModel.trim() || detail.model.model,
              getModelData: () => modelFormGetValuesRef.current?.(),
              avatar: detail.model.avatar
            }
          ]}
          channels={detail.channels}
          selectedChannelIds={[...selectedChannelIds]}
          onConfirm={(channelIds) => associateChannels(channelIds)}
          onClose={() => setShowAssociateChannel(false)}
        />
      )}

      {detail && showCreateChannel && (
        <EditChannelModal
          defaultConfig={{
            ...defaultChannel,
            models: [draftModel.trim() || detail.model.model]
          }}
          fixedModel={{
            model: draftModel.trim() || detail.model.model,
            avatar: detail.model.avatar
          }}
          onSuccess={refreshAfterChannelCreated}
          onClose={() => setShowCreateChannel(false)}
        />
      )}

      <LeaveConfirmModal />
    </>
  );
};

export default ModelEditModal;
