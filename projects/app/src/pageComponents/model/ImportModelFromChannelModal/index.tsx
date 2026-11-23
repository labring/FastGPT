import { Box } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';
import type {
  ModelChannelSummary,
  ModelConfigListItem
} from '@fastgpt/global/openapi/core/ai/model/api';
import { useState } from 'react';
import ImportResultsStep from './ImportResultsStep';
import ModelPreviewStep from './ModelPreviewStep';
import SelectChannelStep from './SelectChannelStep';
import type { ChannelImportPlan } from './types';

type ImportFlowState = {
  step: 'select' | 'preview' | 'results';
  channelId: number | '';
  plan?: ChannelImportPlan;
};

const ImportModelFromChannelModal = ({
  channels,
  installedModels,
  providers,
  createModelData,
  onSuccess,
  onClose
}: {
  channels: ModelChannelSummary[];
  installedModels: ModelConfigListItem[];
  providers: ModelProviderItemType[];
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
  onSuccess: () => Promise<void>;
  onClose: () => void;
}) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [flow, setFlow] = useState<ImportFlowState>({ step: 'select', channelId: '' });
  const channel = channels.find((item) => item.id === flow.channelId);

  return (
    <MyModal
      isOpen
      onClose={submitting ? undefined : onClose}
      closeOnOverlayClick={false}
      closeOnEsc={false}
      title={
        <>
          {t('config_model:channel_import_import_step')}
          {flow.step === 'preview' && (
            <Box mt={2} color="myGray.600" fontSize="sm" fontWeight="normal" lineHeight="5">
              {t('config_model:channel_import_new_models_only')}
            </Box>
          )}
        </>
      }
      w="1080px"
      h="min(760px, calc(100vh - 32px))"
      maxW="calc(100vw - 24px)"
      bodyStyles={{ overflow: 'hidden', p: 0 }}
    >
      {flow.step === 'select' && (
        <SelectChannelStep
          channelId={flow.channelId}
          onChannelChange={(channelId) => setFlow({ step: 'select', channelId })}
          channels={channels}
          onSubmit={(channelId) => setFlow({ step: 'preview', channelId })}
        />
      )}
      {flow.step !== 'select' && flow.channelId !== '' && (
        <Box display={flow.step === 'preview' ? 'block' : 'none'} h="100%" minH={0}>
          <ModelPreviewStep
            channelId={flow.channelId}
            channel={channel}
            installedModels={installedModels}
            providers={providers}
            createModelData={createModelData}
            onSubmit={(plan) => setFlow((current) => ({ ...current, step: 'results', plan }))}
            onPrevious={() => setFlow((current) => ({ ...current, step: 'select' }))}
          />
        </Box>
      )}
      {flow.step === 'results' && flow.channelId !== '' && flow.plan && (
        <ImportResultsStep
          channelId={flow.channelId}
          channel={channel}
          plan={flow.plan}
          onSubmittingChange={setSubmitting}
          onPrevious={() => setFlow((current) => ({ ...current, step: 'preview' }))}
          onRefresh={onSuccess}
          onImportSuccess={() => {
            onClose();
            toast({ status: 'success', title: t('common:import_success') });
          }}
        />
      )}
    </MyModal>
  );
};

export default ImportModelFromChannelModal;
