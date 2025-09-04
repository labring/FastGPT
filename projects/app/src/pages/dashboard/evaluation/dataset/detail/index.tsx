import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const DatasetEvaluationDetail = () => {
  const { t } = useTranslation();

  return (
    <Box p={6}>
      <Text fontSize="xl" fontWeight="bold">
        dataset detail
      </Text>
    </Box>
  );
};

export default DatasetEvaluationDetail;
