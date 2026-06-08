import Markdown from '@/components/Markdown';
import { Box } from '@chakra-ui/react';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { useSize } from 'ahooks';
import React, { useEffect, useMemo, useRef } from 'react';

const previewTypography = {
  fontSize: '14px',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: '20px',
  letterSpacing: '0.25px'
};

const isEmptyPreviewValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.every(isEmptyPreviewValue);
  if (typeof value === 'object') return Object.values(value).every(isEmptyPreviewValue);

  return false;
};

const formatPreviewValue = (value?: string | null) => {
  if (isEmptyPreviewValue(value)) return '';
  const rawValue = value ?? '';

  try {
    const parsedValue = JSON.parse(rawValue);
    if (isEmptyPreviewValue(parsedValue)) return '';

    return JSON.stringify(parsedValue, null, 2);
  } catch {
    return rawValue;
  }
};

const ProcessingPreviewBody = React.memo(function ProcessingPreviewBody({
  content,
  showAnimation
}: {
  content: string;
  showAnimation: boolean;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentSize = useSize(contentRef);
  const contentOverflow = (contentSize?.height || 0) > 80;

  useEffect(() => {
    if (!showAnimation || !contentOverflow) return;

    previewRef.current?.scrollTo({
      top: previewRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [content, contentOverflow, showAnimation]);

  if (!content) return null;

  return (
    <Box position={'relative'} mt={2}>
      <Box
        ref={previewRef}
        maxH={'80px'}
        overflowY={'auto'}
        color={'myGray.500'}
        sx={{
          '.markdown': {
            ...previewTypography,
            wordBreak: 'normal',
            overflowWrap: 'anywhere'
          },
          '.markdown *': {
            letterSpacing: previewTypography.letterSpacing,
            wordBreak: 'normal',
            overflowWrap: 'anywhere'
          },
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        }}
        css={{
          scrollbarWidth: 'none'
        }}
      >
        <Box ref={contentRef}>
          <Markdown source={content} showAnimation={showAnimation} />
        </Box>
      </Box>
      {contentOverflow && (
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
  );
});

export const getProcessingPreviewLabelKey = (value: AIChatItemValueItemType) => {
  const tool = value.tools?.[value.tools.length - 1] || value.tool;
  if (tool) return tool.toolName;
  if (
    (value.reasoning?.content || value.agentPlanUpdate?.reasoningText) &&
    !value.hideReason
  ) {
    return 'chat:history_generating';
  }

  return '';
};

const RenderProcessingPreview = React.memo(function RenderProcessingPreview({
  value,
  showAnimation
}: {
  value: AIChatItemValueItemType;
  showAnimation: boolean;
}) {
  const tool = value.tools?.[value.tools.length - 1] || value.tool;
  const reasoningContent = value.reasoning?.content || value.agentPlanUpdate?.reasoningText || '';
  const previewContent = useMemo(() => {
    if (tool) return formatPreviewValue(tool.params);
    return reasoningContent;
  }, [tool, reasoningContent]);

  if (tool && !previewContent) return null;
  if (!tool && (!reasoningContent || value.hideReason)) return null;

  return <ProcessingPreviewBody content={previewContent} showAnimation={showAnimation} />;
});

export default RenderProcessingPreview;
