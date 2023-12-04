import React from 'react';
import { Box, Flex, Button } from '@chakra-ui/react';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useImportStore, SelectorContainer, PreviewFileOrChunk } from './Provider';
import { useTranslation } from 'next-i18next';

const fileExtension = '.csv';
const csvTemplate = `index,content
"必填内容","可选内容。CSV 中请注意内容不能包含双引号，双引号是列分割符号"
"结合人工智能的演进历程,AIGC的发展大致可以分为三个阶段，即:早期萌芽阶段(20世纪50年代至90年代中期)、沉淀积累阶段(20世纪90年代中期至21世纪10年代中期),以及快速发展展阶段(21世纪10年代中期至今)。",""
"AIGC发展分为几个阶段？","早期萌芽阶段(20世纪50年代至90年代中期)、沉淀积累阶段(20世纪90年代中期至21世纪10年代中期)、快速发展展阶段(21世纪10年代中期至今)"`;

const CsvImport = () => {
  const { t } = useTranslation();
  const { successChunks, totalChunks, isUnselectedFile, onclickUpload, uploading } =
    useImportStore();

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('core.dataset.import.Import Tip')
  });

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <SelectorContainer
        fileExtension={fileExtension}
        showUrlFetch={false}
        fileTemplate={{
          filename: 'csv templates.csv',
          value: csvTemplate,
          type: 'text/csv'
        }}
        tip={t('dataset.import csv tip')}
      >
        <Flex mt={3}>
          <Button isDisabled={uploading} onClick={openConfirm(onclickUpload)}>
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

export default CsvImport;
