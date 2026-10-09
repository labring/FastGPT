import React, { useContext } from 'react';
import dynamic from 'next/dynamic';
import MarkdownTable from '@fastgpt/web/components/common/Markdown/MarkdownTable';
import { MarkdownRendererRuntimeContext } from '../utils/runtimeContext';

import RewritePre from './RewritePre';
import Details from './Details';
import Summary from './Summary';
import Mark from './Mark';
import Kbd from './Kbd';
import Font from './Font';
import Progress from './Progress';
import Input from './Input';
import Textarea from './Textarea';

const Image = dynamic(() => import('./Image'), { ssr: false });
const Code = dynamic(() => import('./Code'), { ssr: false });
const A = dynamic(() => import('./A'), { ssr: false });
const VideoBlock = dynamic(() => import('./Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./Audio'), { ssr: false });

export function MarkdownImgRenderer(props: any) {
  const { chatAuthData } = useContext(MarkdownRendererRuntimeContext);
  return <Image {...props} alt={props.alt} chatAuthData={chatAuthData} />;
}

export function MarkdownCodeRenderer(props: any) {
  const { showAnimation, autoPreviewHtmlCodeBlock, markdownClassName } = useContext(
    MarkdownRendererRuntimeContext
  );

  return (
    <Code
      {...props}
      showAnimation={showAnimation}
      autoPreviewHtmlCodeBlock={autoPreviewHtmlCodeBlock}
      markdownClassName={markdownClassName}
    />
  );
}

export function MarkdownLinkRenderer(props: any) {
  const { showAnimation, chatAuthData, allowedCitationIds, onOpenCiteModal } = useContext(
    MarkdownRendererRuntimeContext
  );

  return (
    <A
      {...props}
      showAnimation={showAnimation}
      chatAuthData={chatAuthData}
      allowedCitationIds={allowedCitationIds}
      onOpenCiteModal={onOpenCiteModal}
    />
  );
}

export function MarkdownVideoRenderer(props: any) {
  return <VideoBlock {...props} />;
}

export function MarkdownAudioRenderer(props: any) {
  return <AudioBlock {...props} />;
}

export function MarkdownDetailsRenderer(props: any) {
  return <Details {...props} />;
}

export function MarkdownSummaryRenderer(props: any) {
  return <Summary {...props} />;
}

export function MarkdownMarkRenderer(props: any) {
  return <Mark {...props} />;
}

export function MarkdownKbdRenderer(props: any) {
  return <Kbd {...props} />;
}

export function MarkdownFontRenderer(props: any) {
  return <Font {...props} />;
}

export function MarkdownProgressRenderer(props: any) {
  return <Progress {...props} />;
}
export function MarkdownInputRenderer(props: any) {
  return <Input {...props} />;
}

export function MarkdownTextareaRenderer(props: any) {
  return <Textarea {...props} />;
}

export const markdownComponents = {
  img: MarkdownImgRenderer,
  pre: RewritePre,
  code: MarkdownCodeRenderer,
  table: MarkdownTable as any,
  a: MarkdownLinkRenderer,
  video: MarkdownVideoRenderer,
  audio: MarkdownAudioRenderer,
  details: MarkdownDetailsRenderer,
  summary: MarkdownSummaryRenderer,
  mark: MarkdownMarkRenderer,
  kbd: MarkdownKbdRenderer,
  font: MarkdownFontRenderer,
  progress: MarkdownProgressRenderer,
  input: MarkdownInputRenderer,
  textarea: MarkdownTextareaRenderer
};

export * from './RewritePre';
export * from './Details';
export * from './Summary';
export * from './Mark';
export * from './Kbd';
export * from './Font';
export * from './Progress';
export * from './Input';
export * from './Textarea';
export { VideoBlock, AudioBlock, Code, A, Image };
