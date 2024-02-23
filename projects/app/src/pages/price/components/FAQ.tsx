import React from 'react';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const FAQ = () => {
  const { t } = useTranslation();
  const faqs = [
    {
      title: '订阅套餐会自动续费么？',
      desc: '当前套餐过期后，系统会自动根据“未来套餐”进行续费，系统会尝试从账户余额进行扣费，如果您需要自动续费，请在账户余额中预留额度。'
    },
    {
      title: '能否切换订阅套餐？',
      desc: '当前套餐价格大于新套餐时，无法立即切换，将会在当前套餐过期后以“续费”形式进行切换。\n当前套餐价格小于新套餐时，系统会自动计算当前套餐剩余余额，您可支付差价进行套餐切换。'
    },
    {
      title: '什么是AI积分？',
      desc: '每次调用AI模型时，都会消耗一定的AI积分。具体的计算标准可参考上方的“AI 积分计算标准”。'
    },
    {
      title: 'AI积分会过期么？',
      desc: '会过期。当前套餐过期后，AI积分将会清空，并更新为新套餐的AI积分。年度套餐的AI积分时长为1年，而不是每个月。'
    },
    {
      title: '知识库索引怎么计算？',
      desc: '知识库索引是系统存储的最小单位。通常每条知识库数据对应一条索引，但也会有多条索引的情况。你可以在知识库数据的编辑面板，查看该数据的索引数量和具体内容。'
    },
    {
      title: '额外资源包可以叠加么？',
      desc: '可以的。每次购买的资源包都是独立的，在其有效期内将会叠加使用。AI积分会优先扣除最先过期的资源包。'
    },
    {
      title: '知识库索引超出会删除么？',
      desc: '不会，知识库索引超出时，仅无法插入新的知识库索引。'
    },
    {
      title: '免费版数据会清除么？',
      desc: '免费版用户15天无使用记录后，会自动清除所有知识库内容。'
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
        {t('support.wallet.subscription.FAQ')}
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
