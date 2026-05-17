import Markdown from '@/components/Markdown';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  HStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { accordionButtonStyle } from './constants';

const RenderReasoningContent = React.memo(function RenderReasoningContent({
  content,
  isChatting,
  isLastResponseValue,
  isDisabled
}: {
  content: string;
  isChatting: boolean;
  isLastResponseValue: boolean;
  isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const showAnimation = isChatting && isLastResponseValue;

  return (
    <Accordion allowToggle defaultIndex={isLastResponseValue ? 0 : undefined}>
      <AccordionItem borderTop={'none'} borderBottom={'none'}>
        <AccordionButton {...accordionButtonStyle} py={1}>
          <HStack mr={2} spacing={1}>
            <MyIcon name={'core/chat/think'} w={'0.85rem'} />
            <Box fontSize={'sm'}>{t('chat:ai_reasoning')}</Box>
          </HStack>

          {showAnimation && <MyIcon name={'common/loading'} w={'0.85rem'} />}
          <AccordionIcon color={'myGray.600'} ml={5} />
        </AccordionButton>
        <AccordionPanel
          py={0}
          pr={0}
          pl={3}
          mt={2}
          borderLeft={'2px solid'}
          borderColor={'myGray.300'}
          color={'myGray.500'}
        >
          <Markdown source={content} showAnimation={showAnimation} isDisabled={isDisabled} />
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});

export default RenderReasoningContent;
