import React, { useEffect, useState } from 'react';
import ApiKeyTable from '@/components/support/apikey/Table';
import { useTranslation } from 'react-i18next';

const API = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  return <ApiKeyTable tips={t('openapi.app key tips')} appId={appId} />;
};

export default API;
