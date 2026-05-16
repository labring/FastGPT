import { Box, Button } from '@chakra-ui/react';
import type {
  InteractiveBasicType,
  PaymentPauseInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { onSendPrompt } from './utils';

const RenderPaymentPauseInteractive = React.memo(function RenderPaymentPauseInteractive({
  interactive
}: {
  interactive: InteractiveBasicType & PaymentPauseInteractive;
}) {
  const { t } = useTranslation();

  return interactive.params.continue ? (
    <Box>{t('chat:task_has_continued')}</Box>
  ) : (
    <>
      <Box color={'myGray.500'}>{t(interactive.params.description)}</Box>
      <Button
        maxW={'250px'}
        onClick={() => {
          onSendPrompt('Continue');
        }}
      >
        {t('chat:continue_run')}
      </Button>
    </>
  );
});

export default RenderPaymentPauseInteractive;
