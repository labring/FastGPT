import React, { memo, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math'; // Math syntax
import RemarkBreaks from 'remark-breaks'; // Line break
import RehypeKatex from 'rehype-katex'; // Math render
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RehypeExternalLinks from 'rehype-external-links';
import RehypeRaw from 'rehype-raw';
import styles from './index.module.scss';
import dynamic from 'next/dynamic';
import { Box } from '@chakra-ui/react';
import { CodeClassNameEnum, mdTextFormat, filterSafeProps } from './utils';
import ErrorBoundary from './errorBoundry';
import SVGRenderer from './markdowSVG';
import { useCreation } from 'ahooks';
import type { AProps } from './A';
const CodeLight = dynamic(() => import('./codeBlock/CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'), { ssr: false });
const MdImage = dynamic(() => import('./img/Image'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./codeBlock/Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./codeBlock/iframe-html'), { ssr: false });
const VideoBlock = dynamic(() => import('./codeBlock/Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./codeBlock/Audio'), { ssr: false });

const ChatGuide = dynamic(() => import('./chat/Guide'), { ssr: false });
const QuestionGuide = dynamic(() => import('./chat/QuestionGuide'), { ssr: false });

function isSafeHref(href: string): boolean {
  if (!href) return false;
  // allow http(s), mailto, tel, relative paths, #, data:image/audio/video
  return /^(https?:|mailto:|tel:|\/|#|data:(?:image|audio|video))/i.test(href.trim());
}

const SafeA = (props: any) => {
  const href = props.href || '';
  const safeHref = isSafeHref(href) ? href : '#';

  const ALLOWED_A_ATTRS = new Set(['href']);
  const safeProps = filterSafeProps(props, ALLOWED_A_ATTRS);

  return (
    <a
      {...safeProps}
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className="cursor-pointer underline !decoration-primary-700 decoration-dashed"
    >
      {props.children || 'Download'}
    </a>
  );
};

type Props = {
  source?: string;
  showAnimation?: boolean;
  isDisabled?: boolean;
  forbidZhFormat?: boolean;
} & AProps;
const Markdown = (props: Props) => {
  const source = props.source || '';
  if (source.length < 200000) {
    return <MarkdownRender {...props} />;
  }
  return <Box whiteSpace={'pre-wrap'}>{source}</Box>;
};
const MarkdownRender = ({
  source = '',
  showAnimation,
  isDisabled,
  forbidZhFormat,
  chatAuthData,
  onOpenCiteModal
}: Props) => {
  const components = useCreation(() => {
    return {
      img: Image,
      pre: RewritePre,
      code: Code,
      svg: SVGRenderer,
      script: ScriptBlock,
      a: (props: any) => (
        <SafeA
          {...props}
          chatAuthData={chatAuthData}
          onOpenCiteModal={onOpenCiteModal}
          showAnimation={showAnimation}
        />
      )
    };
  }, [chatAuthData, onOpenCiteModal, showAnimation]);
  const formatSource = useMemo(() => {
    if (showAnimation || forbidZhFormat) return source;
    return mdTextFormat(source);
  }, [forbidZhFormat, showAnimation, source]);

  const urlTransform = useCallback((val: string) => val, []);

  return (
    <Box position={'relative'}>
      <ErrorBoundary>
        <ReactMarkdown
          className={`markdown ${styles.markdown} ${
            showAnimation ? `${formatSource ? styles.waitingAnimation : styles.animation}` : ''
          }`}
          remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
          rehypePlugins={[
            RehypeKatex,
            [RehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
            RehypeRaw as any,
            () => {
              return (tree) => {
                const iterate = (node: any) => {
                  if (node.type === 'element') {
                    // delete ref
                    if (node.properties?.ref) delete node.properties.ref;

                    // handle invalid tag name
                    if (!/^[a-z][a-z0-9]*$/i.test(node.tagName)) {
                      node.type = 'text';
                      node.value = `<${node.tagName}`;
                    }
                    // use filterSafeProps to filter component properties
                    if (node.properties) {
                      const ALLOWED_ATTRS = new Set([
                        'title',
                        'alt',
                        'src',
                        'href',
                        'target',
                        'rel',
                        'width',
                        'height',
                        'align',
                        'valign',
                        'type',
                        'lang',
                        'value',
                        'name'
                      ]);

                      // use filterSafeProps to filter properties
                      node.properties = filterSafeProps(node.properties, ALLOWED_ATTRS);
                    }
                  }

                  // recursive handle child nodes
                  if (node.children) node.children.forEach(iterate);
                };
                tree.children.forEach(iterate);
              };
            }
          ]}
          disallowedElements={[
            'iframe',
            'head',
            'html',
            'meta',
            'link',
            'style',
            'body',
            'embed',
            'object',
            'param',
            'applet',
            'area',
            'map',
            'isindex'
          ]}
          components={components}
          urlTransform={urlTransform}
        >
          {formatSource}
        </ReactMarkdown>
      </ErrorBoundary>
      {isDisabled && <Box position={'absolute'} top={0} right={0} left={0} bottom={0} />}
    </Box>
  );
};
export default React.memo(Markdown);
/* Custom dom */
function Code(e: any) {
  const { className, codeBlock, children } = e;
  const match = /language-(\w+)/.exec(className || '');
  const codeType = match?.[1]?.toLowerCase();
  const strChildren = String(children);
  const Component = useMemo(() => {
    if (codeType === CodeClassNameEnum.mermaid) {
      return <MermaidCodeBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.guide) {
      return <ChatGuide text={strChildren} />;
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
    if (codeType === CodeClassNameEnum.html || codeType === CodeClassNameEnum.svg) {
      return (
        <IframeHtmlCodeBlock className={className} codeBlock={codeBlock} match={match}>
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
    return (
      <CodeLight className={className} codeBlock={codeBlock} match={match}>
        {children}
      </CodeLight>
    );
  }, [codeType, className, codeBlock, match, children, strChildren]);
  return Component;
}

function sanitizeImageSrc(src?: string): string | undefined {
  if (!src) return undefined;
  // remove leading and trailing spaces
  const trimmed = src.trim();
  // only allow http/https/data/blob protocols
  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  // allow relative paths (not starting with javascript: or vbscript:)
  if (
    !/^(\w+:)/.test(trimmed) &&
    !trimmed.startsWith('javascript:') &&
    !trimmed.startsWith('vbscript:')
  ) {
    return trimmed;
  }
  return undefined;
}

function Image({ src }: { src?: string }) {
  const safeSrc = sanitizeImageSrc(src);
  return <MdImage src={safeSrc} />;
}

const ALLOWED_IMG_ATTRS = new Set([
  'alt',
  'width',
  'height',
  'className',
  'style',
  'title',
  'loading',
  'decoding',
  'crossOrigin',
  'referrerPolicy'
]);

function Image({ src, ...rest }: { src?: string; [key: string]: any }) {
  const safeSrc = sanitizeImageSrc(src);
  if (!safeSrc) {
    console.warn(`Blocked unsafe image src: ${src}`);
  }
  // only allow whitelist attributes, and remove all on* events
  const safeProps = filterSafeProps(rest, ALLOWED_IMG_ATTRS);
  return <MdImage src={safeSrc} {...safeProps} />;
}

function RewritePre({ children, ...rest }: any) {
  // only allow className, style, etc. safe attributes
  const ALLOWED_PRE_ATTRS = new Set(['className', 'style']);
  const safeProps = filterSafeProps(rest, ALLOWED_PRE_ATTRS);
  const modifiedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      // @ts-ignore
      return React.cloneElement(child, { codeBlock: true });
    }
    return child;
  });
  return <pre {...safeProps}>{modifiedChildren}</pre>;
}

/**
 * general safe attribute filter
 * @param props input props object
 * @param allowedAttrs allowed attribute name Set
 * @param eventTypeCheck whether to check event type (e.g. onClick must be a function)
 */
export function filterSafeProps(
  props: Record<string, any>,
  allowedAttrs: Set<string>,
  eventTypeCheck: boolean = true
) {
  // dangerous protocols
  const DANGEROUS_PROTOCOLS =
    /^(?:\s|&nbsp;|&#160;)*(?:javascript|vbscript|data(?!:(?:image|audio|video)))/i;

  // dangerous event properties (including various possible ways)
  const DANGEROUS_EVENTS =
    /^(?:\s|&nbsp;|&#160;)*(?:on|formaction|data-|\[\[|\{\{|xlink:|href|src|action)/i;

  // complete decode function
  function fullDecode(input: string): string {
    if (!input) return '';

    let result = input;
    let lastResult = '';

    // continue decoding until no more decoding can be done
    while (result !== lastResult) {
      lastResult = result;
      try {
        // HTML entity decode
        result = result.replace(/&(#?[\w\d]+);/g, (_, entity) => {
          try {
            const txt = document.createElement('textarea');
            txt.innerHTML = `&${entity};`;
            return txt.value;
          } catch {
            return '';
          }
        });

        // Unicode decode (\u0061 format)
        result = result.replace(/(?:\\|%5C|%5c)u([0-9a-f]{4})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );

        // URL encode decode
        result = result.replace(/%([0-9a-f]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );

        // octal decode
        result = result.replace(/\\([0-7]{3})/gi, (_, oct) =>
          String.fromCharCode(parseInt(oct, 8))
        );

        // hexadecimal decode (\x61 format)
        result = result.replace(/(?:\\|%5C|%5c)x([0-9a-f]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );

        // handle whitespace and comments
        result = result.replace(/(?:\s|\/\*.*?\*\/|<!--.*?-->)+/g, '');
      } catch {
        break;
      }
    }

    return result.toLowerCase();
  }

  // check if it contains dangerous content
  function containsDangerousContent(value: string): boolean {
    const decoded = fullDecode(value);

    return (
      // check dangerous protocol
      DANGEROUS_PROTOCOLS.test(decoded) ||
      // check dangerous event
      DANGEROUS_EVENTS.test(decoded) ||
      // check inline event
      /on\w+\s*=/.test(decoded) ||
      // check javascript: link
      /javascript\s*:/.test(decoded) ||
      // check other possible injections
      /<\w+/i.test(decoded) ||
      /\(\s*\)/i.test(decoded) ||
      /\[\s*\]/i.test(decoded) ||
      /\{\s*\}/i.test(decoded)
    );
  }

  return Object.fromEntries(
    Object.entries(props).filter(([key, value]) => {
      // 1. decode and check property name
      const decodedKey = fullDecode(key);

      // 2. intercept all event related properties
      if (DANGEROUS_EVENTS.test(decodedKey)) {
        return false;
      }

      // 3. all properties not in the whitelist are rejected
      if (!allowedAttrs.has(key)) {
        return false;
      }

      // 4. check property value
      if (typeof value === 'string') {
        if (containsDangerousContent(value)) {
          return false;
        }
      } else if (typeof value === 'object' && value !== null) {
        // only allow simple style objects
        if (key !== 'style') {
          return false;
        }
        // check the value of the style object
        for (const styleKey in value) {
          if (containsDangerousContent(String(value[styleKey]))) {
            return false;
          }
        }
      } else if (typeof value === 'function') {
        // only allow specific function properties (e.g. onClick)
        if (!eventTypeCheck || decodedKey !== 'onclick') {
          return false;
        }
      }

      return true;
    })
  );
}

const ScriptBlock = memo(({ node }: any) => {
  const scriptContent = node.children[0]?.value || '';
  return `<script>${scriptContent}</script>`;
});
ScriptBlock.displayName = 'ScriptBlock';
