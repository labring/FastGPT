import React, { useMemo } from 'react';

import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { AI_POINT_USAGE_CARD_ROUTE } from '@/web/support/wallet/sub/constants';
import MySelect, { SelectProps } from '@fastgpt/web/components/common/MySelect';

const SelectAiModel = ({ list, ...props }: SelectProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  const expandList = useMemo(() => {
    return feConfigs.show_pay
      ? list.concat({
          label: t('support.user.Price'),
          value: 'price'
        })
      : list;
  }, [feConfigs.show_pay, list, t]);

  return (
    <>
      <MySelect
        list={expandList}
        {...props}
        onchange={(e) => {
          if (e === 'price') {
            router.push(AI_POINT_USAGE_CARD_ROUTE);
            return;
          }
          props.onchange?.(e);
        }}
      />
    </>
  );
};

export default SelectAiModel;
