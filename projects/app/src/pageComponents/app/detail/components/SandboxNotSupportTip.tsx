import React from 'react';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useTranslation } from 'next-i18next';

const SandboxNotSupportTip = () => {
  const { t } = useTranslation();

  return <MyTag>{t('app:sandbox_not_support_tip')}</MyTag>;
};

export default SandboxNotSupportTip;
