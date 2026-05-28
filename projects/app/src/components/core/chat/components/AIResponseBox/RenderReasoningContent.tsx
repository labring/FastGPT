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
import { useSize } from 'ahooks';
import { useTranslation } from 'next-i18next';
import React, { useRef, useState } from 'react';

const reasoningTypography = {
  fontSize: '14px',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: '20px',
  letterSpacing: '0.25px'
};

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
  const [contentExpanded, setContentExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentSize = useSize(contentRef);
  const contentOverflow = (contentSize?.height || 0) > 80;

  return (
    <Accordion allowToggle defaultIndex={isLastResponseValue ? 0 : undefined}>
      <AccordionItem borderTop={'none'} borderBottom={'none'}>
        <AccordionButton
          w={'auto'}
          display={'inline-flex'}
          p={0}
          bg={'transparent'}
          border={'none'}
          boxShadow={'none'}
          color={'myGray.600'}
          _hover={{ color: 'myGray.600', bg: 'transparent' }}
          _expanded={{ color: 'myGray.600' }}
        >
          <HStack mr={1} spacing={'8px'}>
            <MyIcon name={'core/chat/deepThinking'} fill={'myGray.600'} />
            <Box fontSize={'16px'}>{t('chat:ai_reasoning')}</Box>
          </HStack>

          {showAnimation && <MyIcon name={'common/loading'} w={'0.85rem'} />}
          <AccordionIcon ml={1} />
        </AccordionButton>
        <AccordionPanel py={0} pr={0} pl={0} mt={2} color={'myGray.500'}>
          <Box
            position={'relative'}
            maxH={contentExpanded ? 'none' : '80px'}
            overflow={contentExpanded ? 'visible' : 'hidden'}
            ml={1.5}
            pl={3}
            borderLeft={'2px solid'}
            borderColor={'myGray.200'}
            sx={{
              '.markdown': {
                ...reasoningTypography,
                wordBreak: 'normal',
                overflowWrap: 'anywhere'
              },
              '.markdown *': {
                letterSpacing: reasoningTypography.letterSpacing,
                wordBreak: 'normal',
                overflowWrap: 'anywhere'
              }
            }}
          >
            <Box ref={contentRef}>
              <Markdown source={content} showAnimation={showAnimation} isDisabled={isDisabled} />
            </Box>
            {!contentExpanded && contentOverflow && (
              <Box
                position={'absolute'}
                left={0}
                right={0}
                bottom={0}
                h={'32px'}
                bgGradient={'linear(to-b, rgba(255,255,255,0), rgba(255,255,255,1.0))'}
                pointerEvents={'none'}
              />
            )}
          </Box>
          {!contentExpanded && contentOverflow && (
            <Box
              as={'button'}
              type="button"
              ml={1.5}
              py={'4px'}
              px={'8px'}
              color={'primary.600'}
              fontSize={'14px'}
              fontWeight={500}
              cursor={'pointer'}
              onClick={() => setContentExpanded(true)}
            >
              {t('chat:log.error.expand')}
            </Box>
          )}
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});

export default RenderReasoningContent;
