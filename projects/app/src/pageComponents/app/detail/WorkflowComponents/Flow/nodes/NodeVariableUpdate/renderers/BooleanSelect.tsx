import React from 'react';
import { useTranslation } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';

type Mode = NonNullable<TUpdateListItem['booleanMode']>;

type Props = {
  mode?: Mode;
  onChange: (mode: Mode) => void;
};

const BooleanSelect = ({ mode = 'true', onChange }: Props) => {
  const { t } = useTranslation();

  const list: { value: Mode; label: string }[] = [
    { value: 'true', label: 'True' },
    { value: 'false', label: 'False' },
    { value: 'negate', label: t('workflow:var_update_boolean_negate') }
  ];

  return <MySelect<Mode> h={10} list={list} value={mode} onChange={onChange} />;
};

export default BooleanSelect;
