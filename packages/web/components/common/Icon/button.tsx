import React from 'react';
import { Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from './index';
import MyTooltip from '../MyTooltip';

type Props = FlexProps & {
  icon: string;
  size?: string;
  hoverColor?: string;
  hoverBg?: string;
  hoverBorderColor?: string;
  tip?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
};

const MyIconButton = ({
  icon,
  onClick,
  hoverColor = 'primary.600',
  hoverBg = 'myGray.05',
  hoverBorderColor = '',
  size = '1rem',
  tip,
  isLoading = false,
  isDisabled = false,
  ...props
}: Props) => {
  return (
    <MyTooltip label={tip} shouldWrapChildren={false}>
      <Flex
        position={'relative'}
        p={1}
        color={'myGray.500'}
        rounded={'sm'}
        alignItems={'center'}
        bg={'transparent'}
        transition={'background 0.1s'}
        cursor={isDisabled ? 'not-allowed' : 'pointer'}
        opacity={isDisabled ? 0.4 : 1}
        _hover={{
          bg: hoverBg,
          color: hoverColor,
          borderColor: hoverBorderColor
        }}
        onClick={(e) => {
          if (isLoading || isDisabled) return;
          onClick?.(e);
        }}
        sx={{ userSelect: 'none' }}
        {...props}
      >
        <MyIcon name={isLoading ? 'common/loading' : (icon as any)} w={size} />
      </Flex>
    </MyTooltip>
  );
};

export default MyIconButton;

export const MyDeleteIconButton = ({ onClick, ...props }: Omit<Props, 'icon'>) => {
  return (
    <MyIconButton
      hoverBg="red.50"
      hoverColor="red.600"
      onClick={onClick}
      {...props}
      icon={'delete'}
    />
  );
};
