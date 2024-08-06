import React from 'react';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const FAQ = () => {
  const { t } = useTranslation();
  const faqs = [
    {
      title: t('common:FAQ.auto_renew_q'),
      desc: t('common:FAQ.auto_renew_a')
    },
    {
      title: t('common:FAQ.change_package_q'),
      desc: t('common:FAQ.change_package_a')
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
      mt={['40px', '90px']}
      pb={'10vh'}
      flexDirection={'column'}
      alignItems={'center'}
      position={'relative'}
    >
      <Box fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('common:support.wallet.subscription.FAQ')}
      </Box>
      <Grid mt={4} gridTemplateColumns={['1fr', '1fr 1fr']} gap={4} w={'100%'}>
        {faqs.map((item, i) => (
          <Box
            key={i}
            py={4}
            px={5}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.150'}
            bg={'rgba(255,255,255,0.9)'}
            _hover={{
              borderColor: 'primary.300'
            }}
          >
            <Box fontWeight={'bold'}>{item.title}</Box>
            <Box fontSize={'sm'} color={'myGray.600'} whiteSpace={'pre-wrap'}>
              {item.desc}
            </Box>
          </Box>
        ))}
      </Grid>
    </Flex>
  );
};

export default FAQ;
