import React from 'react';
import { Flex, FlexProps } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props = FlexProps & {
  icon: string;
  onClick?: () => void;
  hoverColor?: string;
};

const IconButton = ({ icon, onClick, hoverColor = 'primary.600', ...props }: Props) => {
  return (
    <Flex
      mr={1}
      p={1}
      color={'myGray.500'}
      rounded={'sm'}
      alignItems={'center'}
      bg={'transparent'}
      transition={'background 0.1s'}
      cursor={'pointer'}
      _hover={{
        bg: 'myGray.05',
        color: hoverColor
      }}
      onClick={onClick}
      {...props}
    >
      <MyIcon name={icon as any} w={'16px'} />
    </Flex>
  );
};

export default IconButton;
