import React, { useState } from 'react';
import {
  Box,
  Flex,
  Button,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper
} from '@chakra-ui/react';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';

import { useImportStore, SelectorContainer, PreviewFileOrChunk } from './Provider';
import { useTranslation } from 'next-i18next';

const fileExtension = '.txt, .docx, .pdf, .md';

const ChunkImport = () => {
  const { t } = useTranslation();
  const { datasetDetail } = useDatasetStore();
  const vectorModel = datasetDetail.vectorModel;
  const unitPrice = vectorModel?.price || 0.2;

  const {
    chunkLen,
    setChunkLen,
    successChunks,
    totalChunks,
    isUnselectedFile,
    price,
    onclickUpload,
    onReSplitChunks,
    uploading,
    showRePreview,
    setReShowRePreview
  } = useImportStore();

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('core.dataset.import.Import Tip')
  });

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <SelectorContainer fileExtension={fileExtension}>
        {/* chunk size */}
        <Flex py={4} alignItems={'center'}>
          <Box>
            {t('core.dataset.import.Ideal chunk length')}
            <MyTooltip label={t('core.dataset.import.Ideal chunk length Tips')} forceShow>
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Box>
          <Box
            flex={1}
            css={{
              '& > span': {
                display: 'block'
              }
            }}
          >
            <MyTooltip
              label={t('core.dataset.import.Chunk Range', {
                max: datasetDetail.vectorModel.maxToken
              })}
            >
              <NumberInput
                ml={4}
                defaultValue={chunkLen}
                min={100}
                max={datasetDetail.vectorModel.maxToken}
                step={10}
                onChange={(e) => {
                  setChunkLen(+e);
                  setReShowRePreview(true);
                }}
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </MyTooltip>
          </Box>
        </Flex>
        {/* price */}
        <Flex py={4} alignItems={'center'}>
          <Box>
            {t('core.dataset.import.Estimated Price')}
            <MyTooltip
              label={t('core.dataset.import.Estimated Price Tips', {
                price: formatPrice(unitPrice, 1000)
              })}
              forceShow
            >
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Box>
          <Box ml={4}>{t('common.price.Amount', { amount: price, unit: '元' })}</Box>
        </Flex>
        <Flex mt={3}>
          {showRePreview && (
            <Button variant={'base'} mr={4} onClick={onReSplitChunks}>
              {t('core.dataset.import.Re Preview')}
            </Button>
          )}
          <Button isDisabled={uploading} onClick={openConfirm(onclickUpload)}>
            {uploading ? <Box>{Math.round((successChunks / totalChunks) * 100)}%</Box> : '确认导入'}
          </Button>
        </Flex>
      </SelectorContainer>

      {!isUnselectedFile && (
        <Box flex={['auto', '1 0 0']} h={'100%'} overflowY={'auto'}>
          <PreviewFileOrChunk />
        </Box>
      )}
      <ConfirmModal />
    </Box>
  );
};

export default ChunkImport;
