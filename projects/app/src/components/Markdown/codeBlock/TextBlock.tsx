import React, { useState, useMemo } from 'react';
import { Box, Button, Collapse, Flex } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import RemarkMath from 'remark-math';
import RemarkBreaks from 'remark-breaks';
import RehypeKatex from 'rehype-katex';
import RemarkGfm from 'remark-gfm';
import RehypeExternalLinks from 'rehype-external-links';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const TextBlock: React.FC<{ content: string }> = ({ content }) => {
  const { t } = useSafeTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const { preview, detail, hasNewlines } = useMemo(() => {
    const hasNewlines = content.includes('\n');

    if (!hasNewlines) {
      return { preview: content, detail: '', hasNewlines: false };
    }

    const lines = content.split('\n');
    return {
      preview: lines[0],
      detail: lines.slice(1).join('\n'),
      hasNewlines: true
    };
  }, [content]);

  const buttonProps = {
    size: 'xs' as const,
    variant: 'ghost' as const,
    colorScheme: 'blue' as const,
    _hover: { bg: 'blue.50' }
  };

  return (
    <Box
      w="90%"
      mx="auto"
      mt={2}
      p={4}
      bg="gray.200"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      fontSize="sm"
      lineHeight="1.6"
    >
      <ReactMarkdown
        remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
        rehypePlugins={[RehypeKatex, [RehypeExternalLinks, { target: '_blank' }]]}
      >
        {preview}
      </ReactMarkdown>

      {hasNewlines && (
        <>
          {!isExpanded && (
            <Flex justify="flex-end">
              <Button {...buttonProps} onClick={() => setIsExpanded(true)}>
                {t('common:core.chat.response.Read complete response')}
              </Button>
            </Flex>
          )}

          <Collapse in={isExpanded} animateOpacity>
            <Box borderTop="1px solid" borderColor="gray.200">
              <ReactMarkdown
                remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
                rehypePlugins={[RehypeKatex, [RehypeExternalLinks, { target: '_blank' }]]}
              >
                {detail}
              </ReactMarkdown>
              <Flex justify="flex-end">
                <Button {...buttonProps} onClick={() => setIsExpanded(false)}>
                  {t('common:core.chat.response.Fold response')}
                </Button>
              </Flex>
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
};

export default TextBlock;
