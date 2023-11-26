import React, { useMemo, useState } from 'react';
import { Box, type BoxProps, Flex, useTheme, ModalCloseButton } from '@chakra-ui/react';
import MyRadio from '@/components/Radio/index';
import dynamic from 'next/dynamic';
import ChunkImport from './Chunk';
import { useTranslation } from 'next-i18next';

const QAImport = dynamic(() => import('./QA'), {});
const CsvImport = dynamic(() => import('./Csv'), {});
import MyModal from '@/components/MyModal';
import Provider from './Provider';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { qaModelList } from '@/web/common/system/staticData';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';

export enum ImportTypeEnum {
  chunk = 'chunk',
  qa = 'qa',
  csv = 'csv'
}

const ImportData = ({
  datasetId,
  parentId,
  onClose,
  uploadSuccess
}: {
  datasetId: string;
  parentId: string;
  onClose: () => void;
  uploadSuccess: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { datasetDetail } = useDatasetStore();
  const [importType, setImportType] = useState<`${ImportTypeEnum}`>(ImportTypeEnum.chunk);
  const vectorModel = datasetDetail.vectorModel;
  const agentModel = datasetDetail.agentModel;

  const typeMap = useMemo(() => {
    const map = {
      [ImportTypeEnum.chunk]: {
        defaultChunkLen: vectorModel?.defaultToken || 500,
        chunkOverlapRatio: 0.2,
        unitPrice: vectorModel?.price || 0.2,
        mode: TrainingModeEnum.chunk
      },
      [ImportTypeEnum.qa]: {
        defaultChunkLen: agentModel?.maxContext * 0.6 || 8000,
        chunkOverlapRatio: 0,
        unitPrice: agentModel?.price || 3,
        mode: TrainingModeEnum.qa
      },
      [ImportTypeEnum.csv]: {
        defaultChunkLen: vectorModel?.defaultToken || 500,
        chunkOverlapRatio: 0,
        unitPrice: vectorModel?.price || 0.2,
        mode: TrainingModeEnum.chunk
      }
    };
    return map[importType];
  }, [
    agentModel?.maxContext,
    agentModel?.price,
    importType,
    vectorModel?.defaultToken,
    vectorModel?.price
  ]);

  const TitleStyle: BoxProps = {
    fontWeight: 'bold',
    fontSize: ['md', 'xl']
  };

  return (
    <MyModal
      iconSrc="/imgs/modal/import.svg"
      title={<Box {...TitleStyle}>{t('dataset.data.File import')}</Box>}
      isOpen
      isCentered
      maxW={['90vw', '85vw']}
      w={['90vw', '85vw']}
      h={'90vh'}
    >
      <ModalCloseButton onClick={onClose} />
      <Flex mt={2} flexDirection={'column'} flex={'1 0 0'}>
        <Box pb={[5, 7]} px={[4, 8]} borderBottom={theme.borders.base}>
          <MyRadio
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(3,1fr)']}
            list={[
              {
                icon: 'indexImport',
                title: '直接分段',
                desc: '选择文本文件，直接将其按分段进行处理',
                value: ImportTypeEnum.chunk
              },
              {
                icon: 'qaImport',
                title: 'QA拆分',
                desc: '选择文本文件，让大模型自动生成问答对',
                value: ImportTypeEnum.qa
              },
              {
                icon: 'csvImport',
                title: 'CSV 导入',
                desc: '批量导入问答对，是最精准的数据',
                value: ImportTypeEnum.csv
              }
            ]}
            value={importType}
            onChange={(e) => setImportType(e as `${ImportTypeEnum}`)}
          />
        </Box>

        <Provider
          {...typeMap}
          vectorModel={vectorModel.model}
          agentModel={agentModel.model}
          datasetId={datasetDetail._id}
          importType={importType}
          parentId={parentId}
          onUploadSuccess={uploadSuccess}
        >
          <Box flex={'1 0 0'} h={0}>
            {importType === ImportTypeEnum.chunk && <ChunkImport />}
            {importType === ImportTypeEnum.qa && <QAImport />}
            {importType === ImportTypeEnum.csv && <CsvImport />}
          </Box>
        </Provider>
      </Flex>
    </MyModal>
  );
};

export default ImportData;
