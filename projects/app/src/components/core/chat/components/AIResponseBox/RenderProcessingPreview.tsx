import { Box } from '@chakra-ui/react';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import React, { useEffect, useMemo, useRef } from 'react';
import { getToolParamsPreview } from '../../ChatContainer/ChatBox/utils/toolParamsStreamBuffer';

const ProcessingPreviewBody = React.memo(function ProcessingPreviewBody({
  content,
  showAnimation
}: {
  content: string;
  showAnimation: boolean;
}) {
  const previewRef = useRef<HTMLPreElement>(null);
  const shouldFollowOutputRef = useRef(true);

  useEffect(() => {
    if (!showAnimation || !shouldFollowOutputRef.current) return;

    const frameId = window.requestAnimationFrame(() => {
      const preview = previewRef.current;
      if (preview) preview.scrollTop = preview.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [content, showAnimation]);

  if (!content) return null;

  return (
    <Box position={'relative'} mt={2}>
      <Box
        ref={previewRef}
        as="pre"
        maxH={'80px'}
        m={0}
        overflowY={'auto'}
        color={'myGray.500'}
        fontFamily={'mono'}
        fontSize={'13px'}
        fontWeight={400}
        lineHeight={'20px'}
        letterSpacing={0}
        whiteSpace={'pre-wrap'}
        overflowWrap={'anywhere'}
        onScroll={(event: React.UIEvent<HTMLPreElement>) => {
          const target = event.currentTarget;
          shouldFollowOutputRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight <= 8;
        }}
        sx={{
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        }}
        css={{
          scrollbarWidth: 'none'
        }}
      >
        {content}
      </Box>
    </Box>
  );
});

export const getProcessingPreviewLabelKey = (value: AIChatItemValueItemType) => {
  const tool = value.tools?.[value.tools.length - 1] || value.tool;
  if (tool) return tool.toolName;
  if (value.reasoning?.content && !value.hideReason) {
    return i18nT('chat:history_generating');
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
  const reasoningContent = value.reasoning?.content || '';
  const previewContent = useMemo(
    () => getToolParamsPreview(tool ? tool.params : reasoningContent),
    [tool, reasoningContent]
  );

  if (tool && !previewContent) return null;
  if (!tool && (!reasoningContent || value.hideReason)) return null;

  return <ProcessingPreviewBody content={previewContent} showAnimation={showAnimation} />;
});

export default RenderProcessingPreview;
