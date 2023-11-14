import React, { useEffect, useState } from 'react';
import ApiKeyTable from '@/components/support/apikey/Table';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';

const API = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  return (
    <Box pt={3}>
      <ApiKeyTable tips={t('openapi.app key tips')} appId={appId} />
    </Box>
  );
};

export default API;
