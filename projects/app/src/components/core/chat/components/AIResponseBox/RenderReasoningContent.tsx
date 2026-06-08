import Markdown from '@/components/Markdown';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  HStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React from 'react';

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
  isDisabled,
  defaultExpanded = isLastResponseValue
}: {
  content: string;
  isChatting: boolean;
  isLastResponseValue: boolean;
  isDisabled?: boolean;
  defaultExpanded?: boolean;
}) {
  const { t } = useTranslation();
  const showAnimation = isChatting && isLastResponseValue;

  return (
    <Accordion allowToggle defaultIndex={defaultExpanded ? 0 : undefined}>
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
          <HStack mr={1} spacing="0">
            <Flex w="24px" h="24px" alignItems="center" justifyContent="flex-start">
              <MyIcon name={'core/chat/deepThinking'} fill={'myGray.500'} />
            </Flex>
            <Box fontSize={'16px'}>{t('chat:ai_reasoning')}</Box>
          </HStack>

          <AccordionIcon ml={1} color={'myGray.500'} />
        </AccordionButton>
        <AccordionPanel py={0} pr={0} pl={0} mt={2} color={'myGray.500'}>
          <Box position={'relative'} ml={1.5}>
            <Box
              pl={3}
              borderLeft={'1px solid'}
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
              <Markdown source={content} showAnimation={showAnimation} isDisabled={isDisabled} />
            </Box>
          </Box>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});

export default RenderReasoningContent;
