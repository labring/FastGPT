import { IconProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';

function IconButton({
  name,
  w = '1rem',
  h = '1rem',
  ...props
}: {
  name: IconNameType;
} & IconProps) {
  return (
    <MyIcon
      name={name}
      w={w}
      h={h}
      transition={'background 0.1s'}
      cursor={'pointer'}
      p="1"
      rounded={'sm'}
      _hover={{
        bg: 'myGray.05',
        color: 'primary.600'
      }}
      {...props}
    />
  );
}

export default IconButton;
