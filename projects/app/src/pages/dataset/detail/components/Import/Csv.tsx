import React from 'react';
import { Box, Flex, Button } from '@chakra-ui/react';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useImportStore, SelectorContainer, PreviewFileOrChunk } from './Provider';
import { useTranslation } from 'next-i18next';

const fileExtension = '.csv';
const csvTemplate = `index,content\n"被索引的内容","对应的答案。CSV 中请注意内容不能包含双引号，双引号是列分割符号"\n"什么是 laf","laf 是一个云函数开发平台……",""\n"什么是 sealos","Sealos 是以 kubernetes 为内核的云操作系统发行版,可以……"`;

const CsvImport = () => {
  const { t } = useTranslation();
  const { successChunks, totalChunks, isUnselectedFile, onclickUpload, uploading } =
    useImportStore();

  const { openConfirm, ConfirmModal } = useConfirm({
    content: `该任务无法终止，需要一定时间生成索引，请确认导入。如果余额不足，未完成的任务会被暂停，充值后可继续进行。`
  });

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <SelectorContainer
        fileExtension={fileExtension}
        showUrlFetch={false}
        fileTemplate={{
          filename: 'csv 模板.csv',
          value: csvTemplate,
          type: 'text/csv'
        }}
        tip={t('dataset.import csv tip')}
      >
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
