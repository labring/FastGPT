import React from 'react';
import {
  Box,
  Flex,
  Button,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Input,
  Grid
} from '@chakra-ui/react';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';

import { useImportStore, SelectorContainer, PreviewFileOrChunk } from './Provider';
import { useTranslation } from 'next-i18next';

const fileExtension = '.txt, .docx, .pdf, .md, .html';

const ChunkImport = () => {
  const { t } = useTranslation();
  const { datasetDetail } = useDatasetStore();
  const vectorModel = datasetDetail.vectorModel;
  const unitPrice = vectorModel?.inputPrice || 0.002;

  const {
    chunkLen,
    setChunkLen,
    setCustomSplitChar,
    successChunks,
    totalChunks,
    totalTokens,
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
        <Box mt={4} alignItems={'center'}>
          <Box>
            {t('core.dataset.import.Ideal chunk length')}
            <MyTooltip label={t('core.dataset.import.Ideal chunk length Tips')} forceShow>
              <QuestionOutlineIcon />
            </MyTooltip>
          </Box>
          <Box
            mt={1}
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
        </Box>
        {/* custom split char */}
        <Box mt={4} alignItems={'center'}>
          <Box>
            {t('core.dataset.import.Custom split char')}
            <MyTooltip label={t('core.dataset.import.Custom split char Tips')} forceShow>
              <QuestionOutlineIcon />
            </MyTooltip>
          </Box>
          <Box mt={1}>
            <Input
              defaultValue={''}
              placeholder="\n;======;==SPLIT=="
              onChange={(e) => {
                setCustomSplitChar(e.target.value);
                setReShowRePreview(true);
              }}
            />
          </Box>
        </Box>
        <Grid mt={4} gridTemplateColumns={'1fr 1fr'} gridGap={2}>
          <Flex alignItems={'center'}>
            <Box>{t('core.dataset.import.Total tokens')}：</Box>
            <Box>{totalTokens}</Box>
          </Flex>
          {/* price */}
          <Flex alignItems={'center'}>
            <Box>
              {t('core.dataset.import.Estimated Price')}
              <MyTooltip
                label={t('core.dataset.import.Embedding Estimated Price Tips', {
                  price: unitPrice
                })}
                forceShow
              >
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Box>
            <Box ml={4}>{t('common.price.Amount', { amount: price, unit: '元' })}</Box>
          </Flex>
        </Grid>
        <Flex mt={3}>
          {showRePreview && (
            <Button variant={'whitePrimary'} mr={4} onClick={onReSplitChunks}>
              {t('core.dataset.import.Re Preview')}
            </Button>
          )}
          <Button
            isDisabled={uploading}
            onClick={() => {
              onReSplitChunks();

              openConfirm(onclickUpload)();
            }}
          >
            {uploading ? (
              <Box>{Math.round((successChunks / totalChunks) * 100)}%</Box>
            ) : (
              t('common.Confirm Import')
            )}
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
