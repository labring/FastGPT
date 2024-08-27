import React from 'react';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const FAQ = () => {
  const { t } = useTranslation();
  const faqs = [
    {
      title: t('common:FAQ.switch_package_q'),
      desc: t('common:FAQ.switch_package_a')
    },
    {
      title: t('common:FAQ.check_subscription_q'),
      desc: t('common:FAQ.check_subscription_a')
    },
    {
      title: t('common:FAQ.ai_point_q'),
      desc: t('common:FAQ.ai_point_a')
    },
    {
      title: t('common:FAQ.ai_point_expire_q'),
      desc: t('common:FAQ.ai_point_expire_a')
    },
    {
      title: t('common:FAQ.dataset_compute_q'),
      desc: t('common:FAQ.dataset_compute_a')
    },
    {
      title: t('common:FAQ.dataset_index_q'),
      desc: t('common:FAQ.dataset_index_a')
    },
    {
      title: t('common:FAQ.package_overlay_q'),
      desc: t('common:FAQ.package_overlay_a')
    },
    {
      title: t('common:FAQ.free_user_clean_q'),
      desc: t('common:FAQ.free_user_clean_a')
    }
  ];

  return (
    <Flex
      mt={['40px', '200px']}
      pb={'10vh'}
      flexDirection={'column'}
      alignItems={'center'}
      position={'relative'}
    >
      <Box fontWeight={'bold'} fontSize={['24px', '36px']} color={'myGray.900'}>
        {t('common:support.wallet.subscription.FAQ')}
      </Box>
      <Grid mt={12} gridTemplateColumns={['1fr', '1fr 1fr']} gap={4} w={'100%'}>
        {faqs.map((item, i) => (
          <Box
            key={i}
            py={8}
            px={9}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.150'}
            bg={'rgba(255,255,255,0.9)'}
            _hover={{
              borderColor: 'primary.300'
            }}
          >
            <Box fontWeight={'bold'} pb={3} color={'myGray.900'}>
              {item.title}
            </Box>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {item.desc}
            </Box>
          </Box>
        ))}
      </Grid>
    </Flex>
  );
};

export default FAQ;
