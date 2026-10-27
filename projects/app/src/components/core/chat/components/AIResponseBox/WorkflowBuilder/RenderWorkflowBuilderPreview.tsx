import Markdown from '@/components/Markdown';
import { Box, Flex } from '@chakra-ui/react';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import React, { useContext, useEffect, useRef } from 'react';
import { WorkflowBuilderTrackingContext } from './TrackingContext';

/** 展示待确认及历史方案正文；确认动作由底部输入区承载，回答由独立 user 消息展示。 */
const RenderWorkflowBuilderPreview = ({
  interactive
}: {
  interactive: WorkflowBuilderPreviewInteractive;
}) => {
  const { mermaid, sections } = interactive.params;
  const tracking = useContext(WorkflowBuilderTrackingContext);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = container.current;
    if (!tracking || !target) return;
    let visible = false;
    const record = () => {
      if (visible && document.visibilityState === 'visible')
        tracking.showPreview(interactive.previewId);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      record();
    });
    observer.observe(target);
    document.addEventListener('visibilitychange', record);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', record);
    };
  }, [interactive.previewId, tracking]);

  return (
    <Flex ref={container} flexDirection={'column'} gap={4} maxW={'100%'}>
      <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} showAnimation={false} />
      {sections.map((section, index) => (
        <Box key={`${section.title}-${index}`}>
          <Box mb={1.5} fontWeight={'semibold'}>
            {section.title}
          </Box>
          <Markdown source={section.content} showAnimation={false} />
        </Box>
      ))}
    </Flex>
  );
};

export default React.memo(RenderWorkflowBuilderPreview);
