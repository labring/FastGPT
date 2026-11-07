import { Box, Button } from '@chakra-ui/react';
import type {
  InteractiveBasicType,
  PaymentPauseInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { useChatInstanceActions } from '../../ChatContainer/context/chatInstanceActionsContext';

const RenderPaymentPauseInteractive = React.memo(function RenderPaymentPauseInteractive({
  interactive
}: {
  interactive: InteractiveBasicType & PaymentPauseInteractive;
}) {
  const { t } = useTranslation();
  const { continueInteractive } = useChatInstanceActions();

  return interactive.params.continue ? (
    <Box>{t('chat:task_has_continued')}</Box>
  ) : (
    <>
      <Box color={'myGray.500'}>{t(interactive.params.description)}</Box>
      <Button
        maxW={'250px'}
        onClick={() => {
          continueInteractive({ text: 'Continue' });
        }}
      >
        {t('chat:continue_run')}
      </Button>
    </>
  );
});

export default RenderPaymentPauseInteractive;
