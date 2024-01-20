import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/utils/i18n';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getTeamDatasetValidSub } from '@/web/support/wallet/sub/api';
import { useQuery } from '@tanstack/react-query';

import StandardPlan from './components/Standard';
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
    <Box h={'100%'} overflow={'overlay'} w={'100%'} px={['20px', '5vw']} py={['30px', '80px']}>
      <MyIcon
        position={'fixed'}
        left={0}
        top={0}
        w={'100%'}
        name={'price/bg'}
        fill={'none'}
        pointerEvents={'none'}
      />

      {/* standard sub */}
      <StandardPlan standardPlan={teamSubPlan?.standard} refetchTeamSubPlan={refetchTeamSubPlan} />

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

const RowTabs = ({
  list,
  value,
  onChange
}: {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  value: string;
  onChange: (e: string) => void;
}) => {
  return (
    <Box
      display={'inline-flex'}
      px={'3px'}
      py={'3px'}
      borderRadius={'md'}
      borderWidth={'1px'}
      borderColor={'primary.300'}
      bg={'primary.50'}
      gap={'4px'}
    >
      {list.map((item) => (
        <Flex
          key={item.value}
          alignItems={'center'}
          justifyContent={'center'}
          cursor={'pointer'}
          borderRadius={'md'}
          px={'12px'}
          py={'7px'}
          userSelect={'none'}
          w={['150px', '170px']}
          {...(value === item.value
            ? {
                color: 'white',
                boxShadow: '1.5',
                bg: 'primary.600'
              }
            : {
                onClick: () => onChange(item.value)
              })}
        >
          {item.icon && <MyIcon name={item.icon as any} mr={1} w={'14px'} />}
          <Box>{item.label}</Box>
        </Flex>
      ))}
    </Box>
  );
};
