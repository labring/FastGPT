import React from 'react';
import { Box, Flex, Grid, Link, ModalBody } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';

const Points = () => {
  const { t } = useTranslation();

  return (
    <Flex
      mt={['40px', '200px']}
      flexDirection={'column'}
      alignItems={'center'}
      position={'relative'}
    >
      <Box id="point-card" fontWeight={'bold'} fontSize={['24px', '36px']} color={'myGray.900'}>
        {t('common:support.wallet.subscription.Ai points')}
      </Box>
      <Link href="https://tiktokenizer.vercel.app/" target="_blank" mb={['30px', 14]}>
        {t('common:support.wallet.subscription.token_compute')}
      </Link>
      <AiPointsTable />
    </Flex>
  );
};

export default React.memo(Points);

export const AiPointsTable = () => {
  const { t } = useTranslation();
  const { llmModelList, audioSpeechModelList, vectorModelList, whisperModel } = useSystemStore();

  return (
    <Grid gap={6} w={'100%'} color={'myGray.900'}>
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
          py={8}
          pl={10}
          fontSize={'md'}
          fontWeight={'bold'}
          color={'myGray.900'}
        >
          {t('common:support.wallet.subscription.ai_model')}
        </Box>
        <Box flex={4} textAlign={'center'}>
          {llmModelList?.map((item, i) => (
            <Flex key={item.model} py={4} bg={i % 2 !== 0 ? 'myGray.100' : ''}>
              <Box flex={'1 0 0'}>{item.name}</Box>
              <Box flex={'1 0 0'}>
                {item.charsPointsPrice +
                  t('common:support.wallet.subscription.point') +
                  ' / 1000 Tokens'}
              </Box>
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
        <Box flex={1} borderRightWidth={'1px'} borderRightColor={'myGray.150'} py={8} pl={10}>
          <Box fontSize={'md'} fontWeight={'bold'}>
            {t('common:core.ai.model.Vector Model')}
          </Box>
          <Box fontSize={'sm'} mt={1} color={'myGray.600'}>
            {t('common:core.ai.model.doc_index_and_dialog')}
          </Box>
        </Box>
        <Box flex={4} textAlign={'center'}>
          {vectorModelList?.map((item, i) => (
            <Flex key={item.model} py={4} bg={i % 2 !== 0 ? 'myGray.100' : ''}>
              <Box flex={'1 0 0'}>{item.name}</Box>
              <Box flex={'1 0 0'}>
                {item.charsPointsPrice +
                  t('common:support.wallet.subscription.point') +
                  ' / 1000 Tokens'}
              </Box>
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
        <Box flex={1} borderRightWidth={'1px'} borderRightColor={'myGray.150'} py={8} pl={10}>
          <Box fontSize={'md'} fontWeight={'bold'}>
            {t('common:core.app.TTS')}
          </Box>
        </Box>
        <Box flex={4} textAlign={'center'}>
          {audioSpeechModelList?.map((item, i) => (
            <Flex key={item.model} py={4} bg={i % 2 !== 0 ? 'myGray.50' : ''}>
              <Box flex={'1 0 0'}>{item.name}</Box>
              <Box flex={'1 0 0'}>
                {item.charsPointsPrice +
                  t('common:support.wallet.subscription.point') +
                  ' / 1000' +
                  t('common:unit.character')}
              </Box>
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
        <Box flex={1} borderRightWidth={'1px'} borderRightColor={'myGray.150'} py={4} pl={10}>
          <Box fontSize={'md'} fontWeight={'bold'}>
            {t('common:core.app.Whisper')}
          </Box>
        </Box>
        <Box flex={4} textAlign={'center'} h={'100%'}>
          <Flex py={4}>
            <Box flex={'1 0 0'}>{whisperModel?.name}</Box>
            <Box flex={'1 0 0'}>
              {whisperModel?.charsPointsPrice +
                t('common:support.wallet.subscription.point') +
                ' / 1000' +
                t('common:unit.minute')}
            </Box>
          </Flex>
        </Box>
      </Box>
    </Grid>
  );
};

export const AiPointsModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();

  return (
    <MyModal
      isCentered
      iconSrc="/imgs/modal/bill.svg"
      title={t('common:support.wallet.subscription.Ai points')}
      isOpen
      onClose={onClose}
      w={'100%'}
      maxW={'90vw'}
      maxH={'90vh'}
    >
      <ModalBody>
        <AiPointsTable />
      </ModalBody>
    </MyModal>
  );
};
