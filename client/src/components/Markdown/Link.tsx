import React from 'react';
import { Box } from '@chakra-ui/react';

const regex = /((http|https|ftp):\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)/gi;

const Link = (props: { href?: string; children?: React.ReactNode[] }) => {
  const decText = decodeURIComponent(props.href || '');
  const replaceText = decText.replace(regex, (match, p1) => {
    const text = decText === props.children?.[0] ? p1 : props.children?.[0];
    const isInternal = /^\/#/i.test(p1);
    const target = isInternal ? '_self' : '_blank';
    return `<a href="${p1}" target=${target}>${text}</a>`;
  });

  return <Box as={'span'} dangerouslySetInnerHTML={{ __html: replaceText }} />;
};

export default React.memo(Link);
