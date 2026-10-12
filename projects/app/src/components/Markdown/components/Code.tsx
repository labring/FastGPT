import React from 'react';
import dynamic from 'next/dynamic';
import { CodeClassNameEnum } from '../utils';

const CodeLight = dynamic(() => import('./CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./MermaidCodeBlock'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./IframeHtml'), { ssr: false });
const VideoBlock = dynamic(() => import('./Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./Audio'), { ssr: false });
const ChatGuide = dynamic(() => import('./Guide'), { ssr: false });
const QuestionGuide = dynamic(() => import('./QuestionGuide'), { ssr: false });
const QuickReplies = dynamic(() => import('./QuickReplies'), { ssr: false });

export const Code = (e: any) => {
  const {
    className,
    codeBlock,
    children,
    showAnimation,
    autoPreviewHtmlCodeBlock,
    markdownClassName
  } = e;
  const match = /language-([\w-]+)/.exec(className || '');
  const codeType = match?.[1]?.toLowerCase();
  const strChildren = String(children);

  if (codeType === CodeClassNameEnum.mermaid) {
    return <MermaidCodeBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.guide) {
    return <ChatGuide text={strChildren} className={markdownClassName} />;
  }
  if (codeType === CodeClassNameEnum.questionguide) {
    return <QuestionGuide text={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.echarts) {
    return <EChartsCodeBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.iframe) {
    return <IframeCodeBlock code={strChildren} />;
  }
  if (
    codeType === CodeClassNameEnum.html ||
    codeType === CodeClassNameEnum.htm ||
    codeType === CodeClassNameEnum.svg
  ) {
    return (
      <IframeHtmlCodeBlock
        className={className}
        codeBlock={codeBlock}
        match={match}
        showAnimation={showAnimation}
        autoPreviewHtmlCodeBlock={autoPreviewHtmlCodeBlock}
      >
        {children}
      </IframeHtmlCodeBlock>
    );
  }
  if (codeType === CodeClassNameEnum.video) {
    return <VideoBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.audio) {
    return <AudioBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.quickReplies) {
    return <QuickReplies text={strChildren} />;
  }

  return (
    <CodeLight className={className} codeBlock={codeBlock} match={match}>
      {children}
    </CodeLight>
  );
};

export default React.memo(Code);
