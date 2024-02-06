import React from 'react';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const FAQ = () => {
  const { t } = useTranslation();
  const faqs = [{ title: '怎么付费', describe: '2222' }];

  return (
    <Flex
      mt={['40px', '90px']}
      pb={'10vh'}
      flexDirection={'column'}
      alignItems={'center'}
      position={'relative'}
    >
      <Box fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('support.wallet.subscription.FAQ')}
      </Box>
      <Grid mt={4} gridTemplateColumns={['1fr', '1fr 1fr']} gap={4} w={'100%'}>
        <Box
          py={2}
          px={4}
          borderRadius={'lg'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          bg={'rgba(255,255,255,0.9)'}
          _hover={{
            borderColor: 'primary.300'
          }}
        >
          <Box fontSize={'lg'} fontWeight={'500'}>
            怎么付费
          </Box>
          <Box color={'myGray.500'}>2222</Box>
        </Box>
      </Grid>
    </Flex>
  );
};

export default FAQ;
