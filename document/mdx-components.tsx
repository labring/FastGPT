import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { LocalizedLink } from '@/components/docs/LocalizedLink';
import { MermaidDiagram } from '@/components/docs/MermaidDiagram';
import type { ComponentProps, ComponentType } from 'react';

/**
 * 兼容 Fumadocs/MDX 对本地图片的静态资源对象输出。
 * 原生 img 只能接收字符串 src；如果直接透传对象，浏览器会请求 [object Object]。
 */
function getMdxImageSrc(src: unknown): string | undefined {
  if (typeof src === 'string') return src;

  if (src && typeof src === 'object') {
    const image = 'default' in src ? src.default : src;

    if (image && typeof image === 'object' && 'src' in image && typeof image.src === 'string') {
      return image.src;
    }
  }
}

function MdxImage(props: ComponentProps<'img'>) {
  const src = getMdxImageSrc(props.src);

  if (!src) return null;

  // 文档中的多数 Markdown 图片没有 width/height，使用自定义 img 保留现有布局，并只复用预览能力。
  return (
    <ImageZoom {...(props as any)} src={src} zoomInProps={{ alt: props.alt ?? '' }}>
      <img {...props} src={src} alt={props.alt ?? ''} loading={props.loading ?? 'lazy'} />
    </ImageZoom>
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
