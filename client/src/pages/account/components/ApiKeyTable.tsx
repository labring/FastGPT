import React from 'react';
import { useTranslation } from 'react-i18next';
import ApiKeyTable from '@/components/support/apikey/Table';

const ApiKey = () => {
  const { t } = useTranslation();
  return <ApiKeyTable tips={t('openapi.key tips')}></ApiKeyTable>;
};

export default ApiKey;
