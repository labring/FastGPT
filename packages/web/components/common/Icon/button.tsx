import React from 'react';
import { Flex, FlexProps } from '@chakra-ui/react';
import MyIcon from './index';

type Props = FlexProps & {
  icon: string;
  size?: string;
  onClick?: () => void;
  hoverColor?: string;
};

const MyIconButton = ({
  icon,
  onClick,
  hoverColor = 'primary.600',
  size = '1rem',
  ...props
}: Props) => {
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
      <MyIcon name={icon as any} w={size} />
    </Flex>
  );
};

export default MyIconButton;
