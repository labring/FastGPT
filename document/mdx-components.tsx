import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { LocalizedLink } from '@/components/docs/LocalizedLink';
import { MermaidDiagram } from '@/components/docs/MermaidDiagram';
import type { ComponentProps, ComponentType, CSSProperties } from 'react';

/** Normalize Fumadocs static imports while retaining dimensions for screenshot padding. */
function getMdxImage(src: unknown): { src: string; width?: number; height?: number } | undefined {
  if (typeof src === 'string') return { src };

  if (src && typeof src === 'object') {
    const image = 'default' in src ? src.default : src;

    if (image && typeof image === 'object' && 'src' in image && typeof image.src === 'string') {
      return {
        src: image.src,
        width: 'width' in image && typeof image.width === 'number' ? image.width : undefined,
        height: 'height' in image && typeof image.height === 'number' ? image.height : undefined
      };
    }
  }
}

/** Render themed diagrams and frame screenshots while retaining original zoom targets. */
function MdxImage({
  'data-original-src': originalSrc,
  'data-dark-src': darkSrc,
  ...props
}: ComponentProps<'img'> & { 'data-original-src'?: string; 'data-dark-src'?: string }) {
  const image = getMdxImage(props.src);

  if (!image) return null;

  const content = (
    <ImageZoom
      {...(props as any)}
      src={image.src}
      zoomInProps={{ src: originalSrc ?? image.src, alt: props.alt ?? '' }}
    >
      <img
        {...props}
        src={image.src}
        width={image.width ?? props.width}
        height={image.height ?? props.height}
        alt={props.alt ?? ''}
        loading={props.loading ?? 'lazy'}
      />
    </ImageZoom>
  );
  // CSS follows the site's manual theme selection and keeps the hidden variant out of accessibility.
  if (darkSrc) {
    const diagramStyle = {
      '--diagram-min-width': `${Math.max(520, Math.round(Number(image.width ?? props.width ?? 1040) * 0.64))}px`
    } as CSSProperties;
    return (
      <>
        <span className="docs-diagram docs-diagram-light" style={diagramStyle}>
          {content}
        </span>
        <span className="docs-diagram docs-diagram-dark" style={diagramStyle}>
          <MdxImage
            {...props}
            src={darkSrc}
            width={image.width ?? props.width}
            height={image.height ?? props.height}
          />
        </span>
      </>
    );
  }
  if (!originalSrc) return content;

  const width = image.width ?? Number(props.width);
  const height = image.height ?? Number(props.height);
  const padding = Math.min(width, height) * 0.06;
  const hasDimensions = width > 0 && height > 0;
  return (
    <span
      className="docs-screenshot"
      style={
        {
          '--screenshot-padding': hasDimensions
            ? `${(padding / (width + padding * 2)) * 100}%`
            : '6%',
          maxWidth: hasDimensions
            ? (Number(props.width) || width) * (1 + (padding * 2) / width)
            : undefined
        } as CSSProperties
      }
    >
      {content}
    </span>
  );
}

function getTextContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join('');

  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return getTextContent(props?.children);
  }

  return '';
}

function MdxPre(props: ComponentProps<'pre'>) {
  const child = Array.isArray(props.children) ? props.children[0] : props.children;
  const className =
    child && typeof child === 'object' && 'props' in child
      ? (child as { props?: { className?: unknown } }).props?.className
      : undefined;

  if (typeof className === 'string' && className.split(/\s+/).includes('language-mermaid')) {
    return <MermaidDiagram chart={getTextContent(child).trim()} />;
  }

  const DefaultPre = defaultMdxComponents.pre as ComponentType<ComponentProps<'pre'>> | undefined;
  if (DefaultPre) return <DefaultPre {...props} />;

  return <pre {...props} />;
}

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    img: (props) => <MdxImage {...props} />,
    pre: (props) => <MdxPre {...props} />,
    a: (props) => <LocalizedLink {...(props as any)} />,
    ...TabsComponents,
    ...components,
    MermaidDiagram,
    TypeTable
  };
}
