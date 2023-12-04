import React, { useState } from 'react';
import { Box, Flex, Button, Textarea } from '@chakra-ui/react';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Prompt_AgentQA } from '@/global/core/prompt/agent';
import { useImportStore, SelectorContainer, PreviewFileOrChunk } from './Provider';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useTranslation } from 'next-i18next';

const fileExtension = '.txt, .docx, .pdf, .md';

const QAImport = () => {
  const { t } = useTranslation();
  const { datasetDetail } = useDatasetStore();
  const agentModel = datasetDetail.agentModel;
  const unitPrice = agentModel?.price || 3;

  const {
    successChunks,
    totalChunks,
    isUnselectedFile,
    price,
    onclickUpload,
    onReSplitChunks,
    uploading,
    showRePreview
  } = useImportStore();

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('core.dataset.import.Import Tip')
  });

  const [prompt, setPrompt] = useState(Prompt_AgentQA.description);

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <SelectorContainer fileExtension={fileExtension}>
        {/* prompt */}
        <Box p={3} bg={'myWhite.600'} borderRadius={'md'}>
          <Box mb={1} fontWeight={'bold'}>
            {t('core.dataset.collection.QA Prompt')}
          </Box>
          <Box whiteSpace={'pre-wrap'} fontSize={'sm'}>
            <Textarea
              defaultValue={prompt}
              rows={8}
              fontSize={'sm'}
              onChange={(e) => {
                setPrompt(e.target.value);
              }}
            />
            <Box>{Prompt_AgentQA.fixedText}</Box>
          </Box>
        </Box>
        {/* price */}
        <Flex py={5} alignItems={'center'}>
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
          <Button isDisabled={uploading} onClick={openConfirm(() => onclickUpload({ prompt }))}>
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

export default QAImport;
