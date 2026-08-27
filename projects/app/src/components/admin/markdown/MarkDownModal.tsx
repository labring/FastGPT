import ReactMarkdown from 'react-markdown';
import MDImage from './MDImage';
import React, { useMemo } from 'react';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';
import { Box, useDisclosure } from '@chakra-ui/react';

import styles from './index.module.scss';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

function Image({ src }: { src?: string }) {
  return <MDImage src={src} />;
}

const Markdown = ({ source }: { source: string }) => {
  const components = useMemo(
    () => ({
      img: Image,
      pre: 'div',
      p: 'div'
    }),
    []
  );

  const formatSource = source
    .replace(/\\n/g, '\n&nbsp;')
    .replace(/(http[s]?:\/\/[^\s，。]+)([。，])/g, '$1 $2');

  return (
    <Box fontSize="lg">
      <ReactMarkdown
        className={`markdown ${styles.markdown}`}
        remarkPlugins={[RemarkGfm, RemarkMath, RemarkBreaks]}
        rehypePlugins={[RehypeKatex]}
        // @ts-expect-error react-markdown components 类型与自定义 render 不完全兼容
        components={components}
      >
        {formatSource}
      </ReactMarkdown>
    </Box>
  );
};

export default function MarkdownModal(props: { children: React.ReactElement; source: string }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { children, source } = props;

  return (
    <>
      {children &&
        React.cloneElement(children, {
          onClick: (e: any) => {
            e.stopPropagation();
            onOpen();
          }
        })}

      <MyModal isOpen={isOpen} onClose={onClose} title={'配置介绍'}>
        <Markdown source={source} />
      </MyModal>
    </>
  );
}
