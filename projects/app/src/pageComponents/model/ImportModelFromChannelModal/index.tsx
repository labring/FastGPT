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
  const [flow, setFlow] = useState<ImportFlowState>({ step: 'select', channelId: '' });
  const channel = channels.find((item) => item.id === flow.channelId);

  return (
    <>
      {flow.step === 'select' && (
        <SelectChannelStep
          isOpen
          channels={channels}
          onSubmit={(channelId) => setFlow({ step: 'preview', channelId })}
          onClose={onClose}
        />
      )}
      {flow.step === 'preview' && flow.channelId !== '' && (
        <ModelPreviewStep
          isOpen
          channelId={flow.channelId}
          channel={channel}
          installedModels={installedModels}
          providers={providers}
          createModelData={createModelData}
          onSubmit={(plan) => setFlow((current) => ({ ...current, step: 'results', plan }))}
          onPrevious={() => setFlow((current) => ({ ...current, step: 'select' }))}
          onClose={onClose}
        />
      )}
      {flow.step === 'results' && flow.channelId !== '' && flow.plan && (
        <ImportResultsStep
          channelId={flow.channelId}
          channel={channel}
          plan={flow.plan}
          onClose={onClose}
          onPrevious={() => setFlow((current) => ({ ...current, step: 'preview' }))}
          onSuccess={onSuccess}
        />
      )}
    </>
  );
};

export default ImportModelFromChannelModal;
