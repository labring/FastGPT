import React from 'react';
import { useTranslation } from 'next-i18next';
import ApiKeyTable from '@/components/support/apikey/Table';
import { useI18n } from '@/web/context/I18n';

const ApiKey = () => {
  const { publishT } = useI18n();
  return <ApiKeyTable tips={publishT('key tips')}></ApiKeyTable>;
};

export default ApiKey;
