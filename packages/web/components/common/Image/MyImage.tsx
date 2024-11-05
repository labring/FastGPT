import React from 'react';
import { Image, ImageProps } from '@chakra-ui/react';
import { getWebReqUrl } from '../../../common/system/utils';
const MyImage = (props: ImageProps) => {
  return <Image {...props} src={getWebReqUrl(props.src)} alt={props.alt || ''} />;
};
export default React.memo(MyImage);
