import React from 'react';
import ErrorBoundary from './errorBoundry';
import { filterSafeProps } from './index';

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
  // filter props
  const svgProps = { ...props, className, style };
  const sanitizedProps = filterSafeProps(svgProps, SVG_ALLOWED_ATTRS, false);

  const sanitizeSVGContent = (content: string | React.ReactNode): string => {
    if (typeof content !== 'string') {
      return '';
    }

    let cleaned = content;

    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    cleaned = cleaned.replace(
      /<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi,
      ''
    );

    cleaned = cleaned.replace(/\son\w+="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\son\w+='[^']*'/gi, '');
    cleaned = cleaned.replace(/url\s*\(\s*['"]?\s*javascript:[^)]+\)/gi, '');
    cleaned = cleaned.replace(/\bhref="javascript:[^"]*"/gi, '');
    cleaned = cleaned.replace(/\bhref='javascript:[^']*'/gi, '');
    cleaned = cleaned.replace(/\bxlink:href="javascript:[^"]*"/gi, '');
    cleaned = cleaned.replace(/\bxlink:href='javascript:[^']*'/gi, '');
    cleaned = cleaned.replace(/\bxmlns(:xlink)?=['"]?javascript:[^"']*['"]?/gi, '');
    cleaned = cleaned.replace(/style\s*=\s*(['"])(?:(?!\1).)*javascript:.*?\1/gi, '');

    cleaned = cleaned.replace(/\bdata:[^,]*?;base64,[^"')]*["')]/gi, (match) => {
      return match.toLowerCase().includes('javascript') ? '' : match;
    });

    const ALLOWED_ATTRS = new Set([
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
      'class',
      'style'
    ]);
    cleaned = cleaned.replace(/\s(\w+)=['"][^'"]*['"]/gi, (match, attr) => {
      return ALLOWED_ATTRS.has(attr.toLowerCase()) ? match : '';
    });

    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

    return cleaned;
  };

  const sanitizedContent = React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return sanitizeSVGContent(child);
    }
    return child;
  });

  return (
    <ErrorBoundary fallback={<div>Something went wrong while rendering Markdown.</div>}>
      <svg
        {...sanitizedProps}
        className={className}
        style={style}
        dangerouslySetInnerHTML={
          typeof children === 'string' ? { __html: sanitizeSVGContent(children) } : undefined
        }
      >
        {typeof children !== 'string' && sanitizedContent}
      </svg>
    </ErrorBoundary>
  );
};

export default SVGRenderer;
