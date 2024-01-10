import React, { useMemo } from 'react';

import MySelect, { type SelectProps } from './index';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useDisclosure } from '@chakra-ui/react';
const PriceBox = dynamic(() => import('@/components/support/wallet/Price'));

const SelectAiModel = ({ list, ...props }: SelectProps) => {
  const { t } = useTranslation();
  const expandList = useMemo(
    () =>
      list.concat({
        label: t('support.user.Price'),
        value: 'price'
      }),
    [list, t]
  );

  const {
    isOpen: isOpenPriceBox,
    onOpen: onOpenPriceBox,
    onClose: onClosePriceBox
  } = useDisclosure();

  return (
    <>
      <MySelect
        list={expandList}
        {...props}
        onchange={(e) => {
          if (e === 'price') {
            onOpenPriceBox();
            return;
          }
          props.onchange?.(e);
        }}
      />
      {isOpenPriceBox && <PriceBox onClose={onClosePriceBox} />}
    </>
  );
};

export default SelectAiModel;
