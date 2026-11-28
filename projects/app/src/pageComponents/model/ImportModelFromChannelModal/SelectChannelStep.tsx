import { Button } from '@chakra-ui/react';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import type { ModelChannelSummary } from '@fastgpt/global/openapi/core/ai/model/api';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { ModelChannelSelector } from '../ModelChannelModal';
import StepContent from './StepContent';

const SelectChannelStep = ({
  channelType,
  channelId,
  channels,
  onChannelChange,
  onSubmit
}: {
  channelType: ChannelType;
  channelId: number | '';
  channels: ModelChannelSummary[];
  onSubmit: (channelId: number) => void;
  onChannelChange: (channelId: number | '') => void;
}) => {
  const { t } = useSafeTranslation();

  return (
    <StepContent
      footer={
        <Button
          onClick={() => channelId !== '' && onSubmit(channelId)}
          isDisabled={channelId === ''}
        >
          {t('config_model:next_step')}
        </Button>
      }
    >
      <ModelChannelSelector
        models={[]}
        channels={channels}
        channelType={channelType}
        selectedChannelIds={channelId === '' ? [] : [channelId]}
        onChange={(channelIds) => onChannelChange(channelIds[0] ?? '')}
        showCurrentModel={false}
        showTest={false}
        showTableBorder={false}
        singleSelect
      />
    </StepContent>
  );
};

export default SelectChannelStep;
