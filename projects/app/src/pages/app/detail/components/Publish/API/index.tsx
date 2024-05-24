import React, { useEffect, useState } from 'react';
import ApiKeyTable from '@/components/support/apikey/Table';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import { useI18n } from '@/web/context/I18n';

const API = ({ appId }: { appId: string }) => {
  const { publishT } = useI18n();
  return (
    <Box pt={3}>
      <ApiKeyTable tips={publishT('app key tips')} appId={appId} />
    </Box>
  );
};

export default API;
