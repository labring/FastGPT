import React from 'react';
import { Box, Flex, Grid, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

import { useSystemStore } from '@/web/common/system/useSystemStore';

const Points = () => {
  const { t } = useTranslation();
  const { llmModelList, audioSpeechModelList, vectorModelList, whisperModel } = useSystemStore();

  return (
    <Flex
      mt={['40px', '90px']}
      flexDirection={'column'}
      alignItems={'center'}
      position={'relative'}
    >
      <Box id="point-card" fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('support.wallet.subscription.Ai points')}
      </Box>
      <Link href="https://tiktokenizer.vercel.app/" target="_blank">
        点击查看在线 Tokens 计算器
      </Link>
      <Grid gap={6} mt={['30px', '40px']} w={'100%'}>
        <Box
          display={['block', 'flex']}
          borderRadius={'xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          bg={'rgba(255,255,255,0.9)'}
          overflow={'hidden'}
        >
          <Box
            flex={1}
            borderRightWidth={'1px'}
            borderRightColor={'myGray.150'}
            py={4}
            px={6}
            fontSize={'md'}
            fontWeight={'bold'}
          >
            AI语言模型
          </Box>
          <Box flex={4} textAlign={'center'}>
            {llmModelList?.map((item, i) => (
              <Flex key={item.model} py={4} bg={i % 2 !== 0 ? 'myGray.50' : ''}>
                <Box flex={'1 0 0'}>{item.name}</Box>
                <Box flex={'1 0 0'}>{item.charsPointsPrice}积分 / 1000 Tokens</Box>
              </Flex>
            ))}
          </Box>
        </Box>
        <Box
          display={['block', 'flex']}
          borderRadius={'xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          bg={'rgba(255,255,255,0.9)'}
          overflow={'hidden'}
        >
          <Box flex={1} borderRightWidth={'1px'} borderRightColor={'myGray.150'} py={4} px={6}>
            <Box fontSize={'md'} fontWeight={'bold'}>
              索引模型
            </Box>
            <Box fontSize={'sm'} mt={1} color={'myGray.500'}>
              文档索引 & 对话索引
            </Box>
          </Box>
          <Box flex={4} textAlign={'center'}>
            {vectorModelList?.map((item, i) => (
              <Flex key={item.model} py={4} bg={i % 2 !== 0 ? 'myGray.50' : ''}>
                <Box flex={'1 0 0'}>{item.name}</Box>
                <Box flex={'1 0 0'}>{item.charsPointsPrice}积分 / 1000 Tokens</Box>
              </Flex>
            ))}
          </Box>
        </Box>
        <Box
          display={['block', 'flex']}
          borderRadius={'xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          bg={'rgba(255,255,255,0.9)'}
          overflow={'hidden'}
        >
          <Box flex={1} borderRightWidth={'1px'} borderRightColor={'myGray.150'} py={4} px={6}>
            <Box fontSize={'md'} fontWeight={'bold'}>
              语音播放
            </Box>
          </Box>
          <Box flex={4} textAlign={'center'}>
            {audioSpeechModelList?.map((item, i) => (
              <Flex key={item.model} py={4} bg={i % 2 !== 0 ? 'myGray.50' : ''}>
                <Box flex={'1 0 0'}>{item.name}</Box>
                <Box flex={'1 0 0'}>{item.charsPointsPrice}积分 / 1000字符</Box>
              </Flex>
            ))}
          </Box>
        </Box>
        <Box
          display={['block', 'flex']}
          borderRadius={'xl'}
          borderWidth={'1px'}
          borderColor={'myGray.150'}
          bg={'rgba(255,255,255,0.9)'}
          overflow={'hidden'}
        >
          <Box flex={1} borderRightWidth={'1px'} borderRightColor={'myGray.150'} py={4} px={6}>
            <Box fontSize={'md'} fontWeight={'bold'}>
              语音输入
            </Box>
          </Box>
          <Box flex={4} textAlign={'center'} h={'100%'}>
            <Flex py={4}>
              <Box flex={'1 0 0'}>{whisperModel?.name}</Box>
              <Box flex={'1 0 0'}>{whisperModel?.charsPointsPrice}积分 / 分钟</Box>
            </Flex>
          </Box>
        </Box>
      </Grid>
    </Flex>
  );
};

export default React.memo(Points);
