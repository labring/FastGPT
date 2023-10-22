import React from 'react';
import { Box, Flex, Button } from '@chakra-ui/react';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useImportStore, SelectorContainer, PreviewFileOrChunk } from './Provider';

const fileExtension = '.csv';

const CsvImport = () => {
  const { successChunks, totalChunks, isUnselectedFile, onclickUpload, uploading } =
    useImportStore();

  const { openConfirm, ConfirmModal } = useConfirm({
    content: `该任务无法终止，需要一定时间生成索引，请确认导入。如果余额不足，未完成的任务会被暂停，充值后可继续进行。`
  });

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <SelectorContainer fileExtension={fileExtension} showUrlFetch={false}>
        <Flex mt={3}>
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

export default CsvImport;
