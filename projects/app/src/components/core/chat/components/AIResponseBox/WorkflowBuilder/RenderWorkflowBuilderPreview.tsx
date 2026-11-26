import Markdown from '@/components/Markdown';
import { Badge, Box, Flex, Text } from '@chakra-ui/react';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import { parseWorkflowBuilderPreviewArguments } from '@fastgpt/global/core/workflow/builder/utils';
import React from 'react';
import { useTranslation } from 'next-i18next';

/** 展示待确认及历史方案正文；确认动作由底部输入区承载，回答由独立 user 消息展示。 */
const RenderWorkflowBuilderPreview = ({
  interactive,
  isPending = false
}: {
  interactive: WorkflowBuilderPreviewInteractive;
  isPending?: boolean;
}) => {
  const { t } = useTranslation();
  // 历史交互可能缺少 params 或仍使用旧结构，统一解析失败后跳过，避免阻断会话打开。
  const payload = parseWorkflowBuilderPreviewArguments(interactive.params?.arguments);
  if (!payload) return null;
  const { title, summary, mermaid, sections } = payload;

  return (
    <Flex
      data-chat-scroll-anchor={isPending ? interactive.params.toolCallId : undefined}
      flexDirection={'column'}
      gap={4}
      minW={0}
      maxW={'100%'}
      p={4}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'lg'}
      bg={'white'}
    >
      <Flex alignItems={'flex-start'} gap={2} flexWrap={'wrap'}>
        <Text
          flex={1}
          minW={0}
          fontWeight={'semibold'}
          color={'myGray.900'}
          overflowWrap={'anywhere'}
        >
          {title}
        </Text>
        {isPending && (
          <Badge flexShrink={0} colorScheme={'blue'} borderRadius={'md'} px={2} py={0.5}>
            {t('workflow:workflow_builder_preview_pending')}
          </Badge>
        )}
      </Flex>
      {summary && (
        <Text
          fontSize={'sm'}
          color={'myGray.600'}
          lineHeight={1.75}
          whiteSpace={'pre-wrap'}
          overflowWrap={'anywhere'}
        >
          {summary}
        </Text>
      )}
      <Box minW={0}>
        <Text
          as={'h3'}
          mb={2}
          fontSize={'sm'}
          fontWeight={'semibold'}
          color={'myGray.900'}
          overflowWrap={'anywhere'}
        >
          {t('workflow:workflow_builder_preview_flow')}
        </Text>
        <Markdown
          source={`\`\`\`mermaid\n${mermaid}\n\`\`\``}
          showAnimation={false}
          forbidZhFormat
        />
      </Box>
      {sections.map((section, index) => (
        <Box
          key={`${section.title}-${index}`}
          minW={0}
          pt={3}
          borderTop={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Text
            as={'h3'}
            mb={2}
            fontSize={'sm'}
            fontWeight={'semibold'}
            color={'myGray.900'}
            overflowWrap={'anywhere'}
          >
            {section.title}
          </Text>
          <Box
            fontSize={'sm'}
            lineHeight={1.75}
            color={'myGray.600'}
            overflowWrap={'anywhere'}
            sx={{
              '& p, & ul, & ol': { my: 2 },
              '& li + li': { mt: 1 },
              '& th, & td': { px: 3, py: 2 },
              '& h1, & h2, & h3': { fontSize: 'md' }
            }}
          >
            <Markdown source={section.content} showAnimation={false} />
          </Box>
        </Box>
      ))}
    </Flex>
  );
};

export default React.memo(RenderWorkflowBuilderPreview);
