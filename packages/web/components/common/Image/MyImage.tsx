import React, { forwardRef } from 'react';
import { Image, ImageProps } from '@chakra-ui/react';
import { getWebReqUrl } from '../../../common/system/utils';

const MyImage = forwardRef<HTMLImageElement, ImageProps>((props, ref) => {
  return <Image {...props} ref={ref} src={getWebReqUrl(props.src)} alt={props.alt || ''} />;
});

MyImage.displayName = 'MyImage';

export default React.memo(MyImage);
