import React from 'react';
import ApiKeyTable from '@/components/support/apikey/Table';
import { useI18n } from '@/web/context/I18n';
import { Box } from '@chakra-ui/react';

const ApiKey = () => {
  const { publishT } = useI18n();
  return (
    <Box px={[4, 8]} py={[4, 6]}>
      <ApiKeyTable tips={publishT('key_tips')}></ApiKeyTable>
    </Box>
  );
};

export default ApiKey;
