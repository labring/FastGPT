import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { LocalizedLink } from '@/components/docs/LocalizedLink';
import type { ComponentProps } from 'react';

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
  const hasWidth = props.width !== undefined && props.width !== null && props.width !== '';
  const hasHeight = props.height !== undefined && props.height !== null && props.height !== '';

  if (hasWidth && hasHeight) {
    return <ImageZoom {...(props as any)} />;
  }

  return (
    <img
      {...props}
      src={getMdxImageSrc(props.src)}
      alt={props.alt ?? ''}
      loading={props.loading ?? 'lazy'}
    />
  );
}

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    img: (props) => <MdxImage {...props} />,
    a: (props) => <LocalizedLink {...(props as any)} />,
    ...TabsComponents,
    ...components,
    TypeTable
  };
}
