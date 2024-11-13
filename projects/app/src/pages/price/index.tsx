import React from 'react';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { Box, Flex } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamPlanStatus } from '@/web/support/user/team/api';
import { useQuery } from '@tanstack/react-query';

import StandardPlan from './components/Standard';
import ExtraPlan from './components/ExtraPlan';
import PointsCard from './components/Points';
import FAQ from './components/FAQ';
import { getToken } from '@/web/support/user/auth';
import Script from 'next/script';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const PriceBox = () => {
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
      <Script src={getWebReqUrl('/js/qrcode.min.js')} strategy="lazyOnload"></Script>
      <Flex
        h={'100%'}
        flexDir={'column'}
        overflow={'overlay'}
        w={'100%'}
        px={['20px', '5vw']}
        py={['30px', '80px']}
        bg={`linear-gradient(to right, #F8F8FD00, #F7F7FF),url(/imgs/priceBg.svg)`}
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
      </Flex>
    </>
  );
};

export default PriceBox;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context, ['user'])) }
  };
}
