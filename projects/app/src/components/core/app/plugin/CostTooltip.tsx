import { Box, Flex, Divider } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';

const CostTooltip = ({
  cost,
  hasTokenFee,
  isFolder
}: {
  cost?: number;
  hasTokenFee?: boolean;
  isFolder?: boolean;
}) => {
  const { t } = useTranslation();

  const getCostText = () => {
    if (isFolder) {
      return t('app:plugin_cost_folder_tip');
    }

    if (hasTokenFee && cost && cost > 0) {
      return `${t('app:plugin_cost_per_times', {
        cost: cost
      })} + ${t('app:plugin_cost_by_token')}`;
    }
    if (hasTokenFee) {
      return t('app:plugin_cost_by_token');
    }
    if (cost && cost > 0) {
      return t('app:plugin_cost_per_times', {
        cost: cost
      });
    }
    return t('common:core.plugin.Free');
  };

  return (
    <>
      <Divider mt={4} mb={2} />
      <Flex alignItems={'center'}>
        <Box whiteSpace={'nowrap'}>{t('common:core.plugin.cost')}</Box>
        <Box color={'myGray.600'}>{getCostText()}</Box>
      </Flex>
    </>
  );
};

export default CostTooltip;
