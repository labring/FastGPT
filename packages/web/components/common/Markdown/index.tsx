import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RehypeExternalLinks from 'rehype-external-links';
import { Box, Code as ChakraCode, Image, Link } from '@chakra-ui/react';

type MarkdownProps = {
  source: string;
  className?: string;
};

/**
 * 简化版 Markdown 组件
 * 用于渲染基础的 Markdown 内容(README 等)
 */
const Markdown = ({ source, className }: MarkdownProps) => {
  const components = useMemo(
    () => ({
      // 图片
      img: ({ src, alt }: any) => (
        <Image src={src} alt={alt} maxW="100%" my={2} borderRadius="md" loading="lazy" />
      ),
      // 链接
      a: ({ href, children }: any) => (
        <Link href={href} color="primary.600" textDecoration="underline" isExternal>
          {children}
        </Link>
      ),
      // 行内代码
      code: ({ children, className }: any) => {
        // 如果有 className,说明是代码块,保留原样
        if (className) {
          return (
            <Box
              as="pre"
              p={3}
              bg="myGray.100"
              borderRadius="md"
              overflow="auto"
              fontSize="xs"
              fontFamily="monospace"
            >
              <code className={className}>{children}</code>
            </Box>
          );
        }
        // 行内代码
        return (
          <ChakraCode
            px={1}
            py={0.5}
            bg="myGray.100"
            borderRadius="sm"
            fontSize="xs"
            fontFamily="monospace"
          >
            {children}
          </ChakraCode>
        );
      },
      // 标题
      h1: ({ children }: any) => (
        <Box as="h1" fontSize="xl" fontWeight="bold" mt={4} mb={2}>
          {children}
        </Box>
      ),
      h2: ({ children }: any) => (
        <Box as="h2" fontSize="lg" fontWeight="bold" mt={3} mb={2}>
          {children}
        </Box>
      ),
      h3: ({ children }: any) => (
        <Box as="h3" fontSize="md" fontWeight="semibold" mt={2} mb={1}>
          {children}
        </Box>
      ),
      // 段落
      p: ({ children }: any) => (
        <Box as="p" mb={2} lineHeight={1.6}>
          {children}
        </Box>
      ),
      // 列表
      ul: ({ children }: any) => (
        <Box as="ul" pl={4} mb={2}>
          {children}
        </Box>
      ),
      ol: ({ children }: any) => (
        <Box as="ol" pl={4} mb={2}>
          {children}
        </Box>
      ),
      li: ({ children }: any) => (
        <Box as="li" mb={1}>
          {children}
        </Box>
      ),
      // 引用
      blockquote: ({ children }: any) => (
        <Box
          as="blockquote"
          borderLeft="4px solid"
          borderColor="myGray.300"
          pl={4}
          py={2}
          my={2}
          fontStyle="italic"
          color="myGray.600"
        >
          {children}
        </Box>
      ),
      // 水平线
      hr: () => <Box as="hr" my={4} borderColor="myGray.200" />,
      // 表格
      table: ({ children }: any) => (
        <Box overflowX="auto" my={2}>
          <Box as="table" w="100%" border="1px solid" borderColor="myGray.200" borderRadius="md">
            {children}
          </Box>
        </Box>
      ),
      thead: ({ children }: any) => (
        <Box as="thead" bg="myGray.50">
          {children}
        </Box>
      ),
      tbody: ({ children }: any) => <Box as="tbody">{children}</Box>,
      tr: ({ children }: any) => (
        <Box as="tr" borderBottom="1px solid" borderColor="myGray.200">
          {children}
        </Box>
      ),
      th: ({ children }: any) => (
        <Box as="th" px={3} py={2} textAlign="left" fontWeight="semibold" fontSize="sm">
          {children}
        </Box>
      ),
      td: ({ children }: any) => (
        <Box as="td" px={3} py={2} fontSize="sm">
          {children}
        </Box>
      )
    }),
    []
  );

  return (
    <Box className={className}>
      <ReactMarkdown
        remarkPlugins={[RemarkGfm]}
        rehypePlugins={[
          [RehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
        ]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </Box>
  );
};

export default React.memo(Markdown);
