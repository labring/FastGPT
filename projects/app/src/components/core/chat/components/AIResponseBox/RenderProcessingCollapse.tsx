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
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useState } from 'react';
import {
  PROCESSING_COLLAPSE_HEADER_HEIGHT,
  processingContentClipStyle,
  processingItemClipStyle,
  processingItemHeaderStyle
} from './constants';
import { useCollapseScroll } from './useCollapseScroll';
import { useStickyHeaderClip } from './useStickyHeaderClip';

const RenderProcessingCollapse = React.memo(function RenderProcessingCollapse({
  children,
  title,
  label,
  preview,
  onPreviewOpen,
  isProcessing = true
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  label?: string;
  preview?: React.ReactNode;
  onPreviewOpen?: () => void;
  isProcessing?: boolean;
}) {
  const { t } = useSafeTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const { collapseRef, onCollapseChange } = useCollapseScroll();
  const contentRef = useStickyHeaderClip(collapseRef);

  return (
    <Accordion
      allowToggle
      index={isExpanded ? 0 : -1}
      onChange={(index) => {
        onCollapseChange(index);
        setIsExpanded(Array.isArray(index) ? index.length > 0 : index === 0);
      }}
    >
      <AccordionItem
        ref={collapseRef}
        borderTop={'none'}
        borderBottom={'none'}
        lineHeight={'24px'}
        sx={processingItemClipStyle}
      >
        <Box
          {...processingItemHeaderStyle}
          position={isExpanded ? 'sticky' : undefined}
          top={0}
          zIndex={isExpanded ? 4 : undefined}
          w={'full'}
          h={PROCESSING_COLLAPSE_HEADER_HEIGHT}
          pb={'4px'}
          borderBottom={'1px solid'}
          borderBottomColor={'myGray.100'}
        >
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
              <Box fontSize={'16px'} lineHeight={'24px'}>
                {title ?? (
                  <>
                    {isProcessing ? t('chat:processing') : t('chat:processed')}
                    {isProcessing && label && (
                      <Box as="span">
                        {' · '}
                        {t(label as any)}
                        {'...'}
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </HStack>

            <AccordionIcon ml={1} w={'16px'} h={'16px'} color={'myGray.500'} />
          </AccordionButton>
        </Box>
        {isProcessing && !isExpanded && preview && (
          <Box
            role="button"
            tabIndex={0}
            cursor={'pointer'}
            borderRadius={'sm'}
            onClick={() => {
              onPreviewOpen?.();
              setIsExpanded(true);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;

              event.preventDefault();
              onPreviewOpen?.();
              setIsExpanded(true);
            }}
            _hover={{ bg: 'myGray.50' }}
            _focusVisible={{ boxShadow: '0 0 0 2px var(--chakra-colors-primary-300)' }}
          >
            {preview}
          </Box>
        )}
        {isExpanded && (
          <AccordionPanel
            ref={contentRef}
            py={0}
            pr={0}
            pl={0}
            mt={2}
            // 内容已按展开状态挂载，放开动画容器的裁剪，让单项标题相对聊天滚动区域吸顶。
            motionProps={{ style: { overflow: 'visible' } }}
            sx={processingContentClipStyle}
          >
            <Flex
              data-processing-content
              flexDirection={'column'}
              gap={2}
              sx={{
                '--processing-header-offset': PROCESSING_COLLAPSE_HEADER_HEIGHT,
                '.chakra-accordion__item': {
                  scrollMarginTop: 'var(--processing-header-offset)'
                }
              }}
            >
              {children}
            </Flex>
          </AccordionPanel>
        )}
      </AccordionItem>
    </Accordion>
  );
});

export default RenderProcessingCollapse;
