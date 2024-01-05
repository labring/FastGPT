import React, { useMemo } from 'react';
import { Box, Link } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';

import 'katex/dist/katex.min.css';
import styles from '../index.module.scss';
import Image from '../img/Image';

function MyLink(e: any) {
  const href = e.href;
  const text = String(e.children);

  return !!href ? (
    <Link href={href} target={'_blank'}>
      {text}
    </Link>
  ) : (
    <Box as={'li'} mb={1}>
      <Box
        as={'span'}
        color={'primary.700'}
        textDecoration={'underline'}
        cursor={'pointer'}
        onClick={() => {
          eventBus.emit(EventNameEnum.sendQuestion, { text });
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

const Guide = ({ text }: { text: string }) => {
  const formatText = useMemo(
    () => text.replace(/\[(.*?)\]($|\n)/g, '[$1]()').replace(/\\n/g, '\n&nbsp;'),
    [text]
  );

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}`}
      remarkPlugins={[RemarkGfm, RemarkMath, RemarkBreaks]}
      rehypePlugins={[RehypeKatex]}
      components={{
        a: MyLink,
        p: 'div',
        img: Image
      }}
    >
      {formatText}
    </ReactMarkdown>
  );
};

export default React.memo(Guide);
