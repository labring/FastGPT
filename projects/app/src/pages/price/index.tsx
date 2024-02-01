import React from 'react';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { Box, Image } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamDatasetValidSub } from '@/web/support/wallet/sub/api';
import { useQuery } from '@tanstack/react-query';

import StandardPlan from './components/Standard';
import ExtraPlan from './components/ExtraPlan';
import PointsCard from './components/Points';
import FAQ from './components/FAQ';

const PriceBox = () => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { data: teamSubPlan, refetch: refetchTeamSubPlan } = useQuery(
    ['getTeamDatasetValidSub'],
    getTeamDatasetValidSub,
    {
      enabled: !!userInfo
    }
  );

  return (
    <Box
      h={'100%'}
      overflow={'overlay'}
      w={'100%'}
      px={['20px', '5vw']}
      py={['30px', '80px']}
      backgroundImage={'url(/imgs/priceBg.svg)'}
      backgroundSize={'cover'}
      backgroundRepeat={'no-repeat'}
    >
      {/* standard sub */}
      <StandardPlan standardPlan={teamSubPlan?.standard} refetchTeamSubPlan={refetchTeamSubPlan} />

      <ExtraPlan extraDatasetSize={teamSubPlan?.extraDatasetSize} />

      {/* points */}
      <PointsCard />

      {/* question */}
      <FAQ />
    </Box>
  );
};

export default PriceBox;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
