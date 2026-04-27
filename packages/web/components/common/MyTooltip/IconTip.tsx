import React from 'react';
import MyTooltip from '.';
import MyIcon from '../Icon';
import type { IconNameType } from '../Icon/type';

type Props = {
  label?: string | React.ReactNode;
  iconSrc: IconNameType;
  maxW?: string | number;
  [key: string]: any;
};

const IconTip = ({ label, maxW, iconSrc, ...props }: Props) => {
  return (
    <MyTooltip label={label} maxW={maxW}>
      <MyIcon name={iconSrc} w={'16px'} color={'myGray.500'} {...(props as any)} />
    </MyTooltip>
  );
};

export default React.memo(IconTip);
