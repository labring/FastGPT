import React, { useMemo } from 'react';
import { Box } from '@chakra-ui/react';
import Image from './img/Image';

const regex = /((http|https|ftp):\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)/gi;

const Link = (props: { href?: string; children?: any }) => {
  const Html = useMemo(() => {
    const decText = decodeURIComponent(props.href || '');

    return decText.replace(regex, (match, p1) => {
      let text = decText === props.children?.[0] ? p1 : props.children?.[0];
      const isInternal = /^\/#/i.test(p1);
      const target = isInternal ? '_self' : '_blank';

      if (props?.children?.[0]?.props?.node?.tagName === 'img') {
        // eslint-disable-next-line @next/next/no-img-element
        text = `<img src="${props?.children?.[0]?.props?.src}" />`;
      }

      return `<a href="${p1}" target=${target}>${text}</a>`;
    });
  }, [props.children, props.href]);

  return typeof Html === 'string' ? (
    <Box as={'span'} dangerouslySetInnerHTML={{ __html: Html }} />
  ) : (
    Html
  );
};

export default React.memo(Link);
