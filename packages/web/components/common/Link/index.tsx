import React from 'react';
import { Link as ChakraLink, forwardRef, type LinkProps } from '@chakra-ui/react';
import { getWebReqUrl } from '../../../common/system/utils';

/**
 * 统一链接的部署前缀，保留 Chakra 样式、ref 和 as 的多态能力。
 * 无 href 或空 href 保留原语义；外链、锚点及已带前缀的地址由 URL helper 原样返回。
 */
const Link = forwardRef<LinkProps, 'a'>(({ href, ...props }, ref) => (
  <ChakraLink {...props} ref={ref} href={href ? getWebReqUrl(href) : href} />
));

export default Link;
