import React from 'react';
import { Box, IconButton, type IconButtonProps } from '@chakra-ui/react';
import MyIcon from '../Icon';

export interface MyBackButtonProps extends Omit<IconButtonProps, 'aria-label'> {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  iconWidth?: string;
}

const MyBackButton = ({
  onClick,
  size = 'xs',
  w = '1rem',
  iconWidth = '0.8rem',
  color = 'myGray.600',
  ...props
}: MyBackButtonProps) => {
  return (
    <Box _hover={{ bg: 'myGray.200' }} p={0.5} borderRadius={'sm'} cursor={'pointer'}>
      <IconButton
        icon={<MyIcon name={'common/leftArrowLight'} color={color} w={iconWidth} />}
        aria-label={'back'}
        size={size}
        w={w}
        variant={'ghost'}
        bg={'transparent'}
        border={'none'}
        _hover={{ bg: 'transparent' }}
        _active={{ bg: 'transparent' }}
        _focus={{ boxShadow: 'none' }}
        onClick={onClick}
        {...props}
      />
    </Box>
  );
};

export default MyBackButton;
