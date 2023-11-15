import React from 'react';
import MyRadio from '@/components/Radio';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { useTranslation } from 'next-i18next';

const PermissionRadio = ({
  value,
  onChange
}: {
  value: `${PermissionTypeEnum}`;
  onChange: (e: `${PermissionTypeEnum}`) => void;
}) => {
  const { t } = useTranslation();

  return (
    <MyRadio
      gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)']}
      list={[
        {
          icon: 'support/permission/privateLight',
          title: t('permission.Private'),
          desc: t('permission.Private Tip'),
          value: PermissionTypeEnum.private
        },
        {
          icon: 'support/permission/publicLight',
          title: t('permission.Public'),
          desc: t('permission.Public Tip'),
          value: PermissionTypeEnum.public
        }
      ]}
      value={value}
      onChange={(e) => onChange(e as `${PermissionTypeEnum}`)}
    />
  );
};

export default PermissionRadio;
