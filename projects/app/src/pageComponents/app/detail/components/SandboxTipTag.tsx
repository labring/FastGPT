import React from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useTranslation } from 'next-i18next';

const SandboxTipTag = () => {
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();

  const showSandboxTip = feConfigs.show_agent_sandbox;
  if (!showSandboxTip) return null;

  return <MyTag>{t('app:sandbox_free_tip')}</MyTag>;
};

export default SandboxTipTag;
