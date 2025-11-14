import React, { type ForwardedRef, forwardRef } from 'react';
import { Image, type ImageProps } from '@chakra-ui/react';
import { getWebReqUrl } from '../../../common/system/utils';
const MyImage = (props: ImageProps, ref?: ForwardedRef<any>) => {
  return <Image {...props} src={getWebReqUrl(props.src)} alt={props.alt || ''} />;
};
export default forwardRef(MyImage);
