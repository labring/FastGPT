import { Box, Flex, Divider } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';

const CostTooltip = ({ cost }: { cost?: number }) => {
  const { t } = useTranslation();
  return (
    <>
      <Divider mt={4} mb={2} />
      <Flex>
        <Box>{t('common:core.plugin.cost')}</Box>
        <Box color={'myGray.600'}>
          {cost && cost > 0
            ? t('app:plugin_cost_per_times', {
                cost: cost
              })
            : t('common:core.plugin.Free')}
        </Box>
      </Flex>
    </>
  );
};

export default CostTooltip;
