import React from 'react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { Box, Flex, HStack, VStack } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamPlanStatus } from '@/web/support/user/team/api';

import StandardPlan from '@/pageComponents/price/Standard';
import ExtraPlan from '@/pageComponents/price/ExtraPlan';
import PointsCard from '@/pageComponents/price/Points';
import FAQ from '@/pageComponents/price/FAQ';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const PriceBox = () => {
  const { userInfo } = useUserStore();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  const { data: teamSubPlan } = useRequest2(getTeamPlanStatus, {
    manual: false,
    refreshDeps: [userInfo]
  });

  const onPaySuccess = () => {
    setTimeout(() => {
      router.reload();
    }, 1000);
  };

  return (
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
      <VStack>
        <Box fontWeight={'600'} color={'myGray.900'} fontSize={['24px', '36px']}>
          {t('common:support.wallet.subscription.Sub plan')}
        </Box>
        <Box fontWeight={'500'} color={'myGray.600'} fontSize={'md'}>
          {t('common:support.wallet.subscription.Sub plan tip', {
            title: feConfigs?.systemTitle
          })}
        </Box>
        <StandardPlan standardPlan={teamSubPlan?.standard} onPaySuccess={onPaySuccess} />
        <HStack mt={8} color={'blue.700'} ml={8}>
          <MyIcon name={'infoRounded'} w={'1rem'} />
          <Box fontSize={'sm'} fontWeight={'500'}>
            {t('user:bill.standard_valid_tip')}
          </Box>
        </HStack>
      </VStack>

      {/* extra plan */}
      <VStack mt={['40px', '100px']} mb={8}>
        <Box id={'extra-plan'} fontWeight={'bold'} fontSize={['24px', '36px']} color={'myGray.900'}>
          {t('common:support.wallet.subscription.Extra plan')}
        </Box>
        <Box mt={2} mb={8} color={'myGray.600'} fontSize={'md'}>
          {t('common:support.wallet.subscription.Extra plan tip')}
        </Box>
        <ExtraPlan onPaySuccess={onPaySuccess} />
      </VStack>

      {/* points */}
      <PointsCard />

      {/* question */}
      <FAQ />
    </Flex>
  );
};

export default PriceBox;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context, ['user'])) }
  };
}
