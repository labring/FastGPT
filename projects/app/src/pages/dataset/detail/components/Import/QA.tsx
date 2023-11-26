import React, { useState } from 'react';
import { Box, Flex, Button, Textarea } from '@chakra-ui/react';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Prompt_AgentQA } from '@/global/core/prompt/agent';
import { useImportStore, SelectorContainer, PreviewFileOrChunk } from './Provider';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';

const fileExtension = '.txt, .docx, .pdf, .md';

const QAImport = () => {
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
    content: `该任务无法终止！导入后会自动调用大模型生成问答对，会有一些细节丢失，请确认！如果余额不足，未完成的任务会被暂停。`
  });

  const [prompt, setPrompt] = useState(Prompt_AgentQA.description);

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <SelectorContainer fileExtension={fileExtension}>
        {/* prompt */}
        <Box p={3} bg={'myWhite.600'} borderRadius={'md'}>
          <Box mb={1} fontWeight={'bold'}>
            QA 拆分引导词
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
            预估价格
            <MyTooltip
              label={`索引生成计费为: ${formatPrice(unitPrice, 1000)}/1k tokens`}
              forceShow
            >
              <QuestionOutlineIcon ml={1} />
            </MyTooltip>
          </Box>
          <Box ml={4}>{price}元</Box>
        </Flex>
        <Flex mt={3}>
          {showRePreview && (
            <Button variant={'base'} mr={4} onClick={onReSplitChunks}>
              重新生成预览
            </Button>
          )}
          <Button isDisabled={uploading} onClick={openConfirm(() => onclickUpload({ prompt }))}>
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

export default QAImport;
