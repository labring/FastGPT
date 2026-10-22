import { Box, Button } from '@chakra-ui/react';
import React from 'react';
import type { MarkdownActionProps } from '../type';

type QuickRepliesProps = {
  text: string;
} & Pick<MarkdownActionProps, 'onQuickReplyClick'>;

const QUICK_REPLIES_MAX_LENGTH = 300;

const parseQuickReplies = (text: string): string[] | null => {
  const content = text.replace(/\n$/, '');

  if (!content || content.length > QUICK_REPLIES_MAX_LENGTH) {
    return null;
  }

  const options = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return options.length > 0 ? options : null;
};

/** 解析并渲染 quick-replies 代码块；调用方未提供回调或解析失败时不渲染内容。 */
const QuickReplies = ({ text, onQuickReplyClick }: QuickRepliesProps) => {
  const options = React.useMemo(() => parseQuickReplies(text), [text]);

  if (!onQuickReplyClick || !options) {
    return null;
  }

  return (
    <Box
      display="inline-grid"
      gridTemplateColumns="max-content"
      gap={2}
      maxW="full"
      data-quick-replies=""
    >
      {options.map((text, index) => (
        <Button
          key={`${index}-${text}`}
          type="button"
          size="sm"
          variant="whitePrimaryOutline"
          justifyContent={'left'}
          py={4}
          px={4}
          w="full"
          fontSize="sm"
          userSelect={'auto'}
          onClick={() => onQuickReplyClick?.(text)}
        >
          {text}
        </Button>
      ))}
    </Box>
  );
};

export default React.memo(QuickReplies);
