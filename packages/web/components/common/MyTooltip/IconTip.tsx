import React from 'react';
import MyTooltip from '.';
import { type IconProps } from '@chakra-ui/icons';
import MyIcon from '../Icon';
import type { IconNameType } from '../Icon/type';

type Props = Omit<IconProps, 'name'> & {
  label?: string | React.ReactNode;
  iconSrc: IconNameType;
  maxW?: string | number;
};

const IconTip = ({ label, maxW, iconSrc, ...props }: Props) => {
  return (
    <MyTooltip label={label} maxW={maxW}>
      <MyIcon name={iconSrc} w={'16px'} color={'myGray.500'} {...props} />
    </MyTooltip>
  );
};

export default React.memo(IconTip);
