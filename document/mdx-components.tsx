import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { LocalizedLink } from '@/components/docs/LocalizedLink';
import type { ComponentProps } from 'react';

function MdxImage(props: ComponentProps<'img'>) {
  const hasWidth = props.width !== undefined && props.width !== null && props.width !== '';
  const hasHeight = props.height !== undefined && props.height !== null && props.height !== '';

  if (hasWidth && hasHeight) {
    return <ImageZoom {...(props as any)} />;
  }

  return <img {...props} alt={props.alt ?? ''} loading={props.loading ?? 'lazy'} />;
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
