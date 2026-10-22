import Markdown from '@/components/Markdown';
import type { MarkdownActionProps } from '@/components/Markdown/type';
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
import {
  processingContentClipStyle,
  processingItemClipStyle,
  processingItemHeaderStyle
} from './constants';
import { useCollapseScroll } from './useCollapseScroll';
import { useStickyHeaderClip } from './useStickyHeaderClip';

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
  defaultExpanded = isLastResponseValue,
  onSendQuestion,
  onEditQuestion,
  onQuickReplyClick
}: {
  content: string;
  isChatting: boolean;
  isLastResponseValue: boolean;
  isDisabled?: boolean;
  defaultExpanded?: boolean;
} & MarkdownActionProps) {
  const { t } = useTranslation();
  const { collapseRef, onCollapseChange } = useCollapseScroll();
  const contentRef = useStickyHeaderClip(collapseRef);
  const showAnimation = isChatting && isLastResponseValue;

  return (
    <Accordion
      allowToggle
      defaultIndex={defaultExpanded ? 0 : undefined}
      onChange={onCollapseChange}
    >
      <AccordionItem
        ref={collapseRef}
        borderTop={'none'}
        borderBottom={'none'}
        lineHeight={'24px'}
        sx={processingItemClipStyle}
      >
        <Box {...processingItemHeaderStyle}>
          <AccordionButton
            w={'fit-content'}
            h={'24px'}
            minH={'24px'}
            display={'flex'}
            alignItems={'center'}
            lineHeight={'24px'}
            p={0}
            bg={'transparent'}
            border={'none'}
            boxShadow={'none'}
            color={'myGray.600'}
            _hover={{ color: 'myGray.600', bg: 'transparent' }}
            _expanded={{ color: 'myGray.600' }}
          >
            <HStack h={'24px'} lineHeight={'24px'} mr={1} spacing="0">
              <Flex
                w="24px"
                h="24px"
                flexShrink={0}
                alignItems="center"
                justifyContent="center"
                lineHeight={0}
              >
                <MyIcon
                  name={'core/chat/deepThinking'}
                  w={'16px'}
                  h={'16px'}
                  fill={'myGray.500'}
                  display={'block'}
                  verticalAlign={'middle'}
                />
              </Flex>
              <Box fontSize={'16px'} lineHeight={'24px'}>
                {t('chat:ai_reasoning')}
              </Box>
            </HStack>

            <AccordionIcon ml={1} w={'16px'} h={'16px'} color={'myGray.500'} />
          </AccordionButton>
        </Box>
        <AccordionPanel
          ref={contentRef}
          py={0}
          pr={0}
          pl={0}
          mt={2}
          color={'myGray.500'}
          motionProps={{ style: { overflow: 'visible' } }}
          sx={processingContentClipStyle}
        >
          <Box data-processing-content display={'flow-root'} position={'relative'} ml={3}>
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
              <Markdown
                source={content}
                showAnimation={showAnimation}
                isDisabled={isDisabled}
                onSendQuestion={onSendQuestion}
                onEditQuestion={onEditQuestion}
                onQuickReplyClick={onQuickReplyClick}
              />
            </Box>
          </Box>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});

export default RenderReasoningContent;
