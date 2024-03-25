import React from 'react';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { Box, Image } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamPlanStatus } from '@/web/support/user/team/api';
import { useQuery } from '@tanstack/react-query';

import StandardPlan from './components/Standard';
import ExtraPlan from './components/ExtraPlan';
import PointsCard from './components/Points';
import FAQ from './components/FAQ';
import { getToken } from '@/web/support/user/auth';
import Script from 'next/script';

const PriceBox = () => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { data: teamSubPlan, refetch: refetchTeamSubPlan } = useQuery(
    ['getTeamPlanStatus'],
    getTeamPlanStatus,
    {
      enabled: !!getToken() || !!userInfo
    }
  );

  return (
    <>
      <Script src="/js/qrcode.min.js" strategy="lazyOnload"></Script>
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
        <StandardPlan
          standardPlan={teamSubPlan?.standard}
          refetchTeamSubPlan={refetchTeamSubPlan}
        />

        <ExtraPlan />

        {/* points */}
        <PointsCard />

        {/* question */}
        <FAQ />
      </Box>
    </>
  );
};

export default PriceBox;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
