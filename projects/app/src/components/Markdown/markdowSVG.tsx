import React from 'react';
import ErrorBoundary from './errorBoundry';
import { filterSafeProps } from './utils';

interface SVGProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}

const SVG_ALLOWED_ATTRS = new Set([
  'width',
  'height',
  'viewBox',
  'fill',
  'stroke',
  'd',
  'x',
  'y',
  'cx',
  'cy',
  'r',
  'className',
  'style'
]);

const SVGRenderer = ({ children, className, style, ...props }: SVGProps) => {
  const sanitizedProps = filterSafeProps({ ...props, className, style }, SVG_ALLOWED_ATTRS);

  const sanitizeSVGContent = (content: string | React.ReactNode): string => {
    if (typeof content !== 'string') return '';

    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  };

  return (
    <ErrorBoundary fallback={<div>SVG rendering error</div>}>
      <svg
        {...sanitizedProps}
        dangerouslySetInnerHTML={
          typeof children === 'string' ? { __html: sanitizeSVGContent(children) } : undefined
        }
      >
        {typeof children !== 'string' &&
          React.Children.map(children, (child) =>
            typeof child === 'string' ? sanitizeSVGContent(child) : child
          )}
      </svg>
    </ErrorBoundary>
  );
};

export default SVGRenderer;
