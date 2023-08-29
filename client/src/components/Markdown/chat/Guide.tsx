import React, { useMemo } from 'react';
import { Box } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import { event } from '@/utils/plugin/eventbus';

import 'katex/dist/katex.min.css';
import styles from '../index.module.scss';
import Image from '../img/Image';

function Link(e: any) {
  const href = e.href;
  const text = String(e.children);
  return (
    <Box as={'li'} py={1} m={0}>
      <Box
        as={'span'}
        color={'blue.600'}
        textDecoration={'underline'}
        cursor={'pointer'}
        onClick={() => {
          if (href) {
            return window.open(href, '_blank');
          }
          event.emit('guideClick', { text });
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

const Guide = ({ text }: { text: string }) => {
  const formatText = useMemo(() => text.replace(/\[(.*?)\]($|\n)/g, '[$1]()\n'), [text]);

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}`}
      remarkPlugins={[RemarkGfm, RemarkMath]}
      rehypePlugins={[RehypeKatex]}
      components={{
        a: Link,
        img: Image
      }}
    >
      {formatText}
    </ReactMarkdown>
  );
};

export default React.memo(Guide);
