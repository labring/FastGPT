import React from 'react';
import { Flex, FlexProps } from '@chakra-ui/react';
import MyIcon from './index';
import MyTooltip from '../MyTooltip';

type Props = FlexProps & {
  icon: string;
  size?: string;
  onClick?: () => void;
  hoverColor?: string;
  tip?: string;
};

const MyIconButton = ({
  icon,
  onClick,
  hoverColor = 'primary.600',
  size = '1rem',
  tip,
  ...props
}: Props) => {
  return (
    <MyTooltip label={tip}>
      <Flex
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
    </MyTooltip>
  );
};

export default MyIconButton;
