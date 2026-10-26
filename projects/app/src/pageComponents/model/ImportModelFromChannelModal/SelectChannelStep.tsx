import { Button } from '@chakra-ui/react';
import type { ModelChannelSummary } from '@fastgpt/global/openapi/core/ai/model/api';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useState } from 'react';
import { ModelChannelSelector } from '../ModelChannelModal';
import StepModal from './StepModal';

const SelectChannelStep = ({
  isOpen,
  channels,
  onSubmit,
  onClose
}: {
  isOpen: boolean;
  channels: ModelChannelSummary[];
  onSubmit: (channelId: number) => void;
  onClose: () => void;
}) => {
  const { t } = useSafeTranslation();
  const [channelId, setChannelId] = useState<number | ''>('');

  return (
    <StepModal
      isOpen={isOpen}
      title={t('config_model:channel_import_select_channel')}
      onClose={onClose}
      footer={
        <>
          <Button variant="whiteBase" onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            onClick={() => channelId !== '' && onSubmit(channelId)}
            isDisabled={channelId === ''}
          >
            {t('config_model:next_step')}
          </Button>
        </>
      }
    >
      <ModelChannelSelector
        models={[]}
        channels={channels}
        channelType="system"
        selectedChannelIds={channelId === '' ? [] : [channelId]}
        onChange={(channelIds) => setChannelId(channelIds[0] ?? '')}
        showCurrentModel={false}
        showTest={false}
        singleSelect
      />
    </StepModal>
  );
};

export default SelectChannelStep;
