import ReactMarkdown from 'react-markdown';
import React, { useMemo } from 'react';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';

import styles from './index.module.scss';

const Markdown = ({ source }: { source: string }) => {
  const components = useMemo(
    () => ({
      pre: 'div',
      p: 'div'
    }),
    []
  );

  const formatSource = source
    .replace(/\\n/g, '\n&nbsp;')
    .replace(/(http[s]?:\/\/[^\s，。]+)([。，])/g, '$1 $2');

  return (
    <ReactMarkdown
      className={`${styles.markdown}`}
      remarkPlugins={[RemarkGfm, RemarkMath, RemarkBreaks]}
      rehypePlugins={[RehypeKatex]}
      // @ts-expect-error react-markdown components 类型与自定义 render 不完全兼容
      components={components}
    >
      {formatSource}
    </ReactMarkdown>
  );
};

export default Markdown;
