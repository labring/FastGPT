import React, { useMemo, useState } from 'react';
import { Box, type BoxProps, Flex, useTheme, ModalCloseButton } from '@chakra-ui/react';
import MyRadio from '@/components/common/MyRadio/index';
import dynamic from 'next/dynamic';
import ChunkImport from './Chunk';
import { useTranslation } from 'next-i18next';

const QAImport = dynamic(() => import('./QA'), {});
const CsvImport = dynamic(() => import('./Csv'), {});
import MyModal from '@/components/MyModal';
import Provider from './Provider';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
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
        inputPrice: vectorModel?.inputPrice || 0,
        outputPrice: 0,
        collectionTrainingType: TrainingModeEnum.chunk
      },
      [ImportTypeEnum.qa]: {
        defaultChunkLen: agentModel?.maxContext * 0.55 || 8000,
        chunkOverlapRatio: 0,
        inputPrice: agentModel?.inputPrice || 0,
        outputPrice: agentModel?.outputPrice || 0,
        collectionTrainingType: TrainingModeEnum.qa
      },
      [ImportTypeEnum.csv]: {
        defaultChunkLen: 0,
        chunkOverlapRatio: 0,
        inputPrice: vectorModel?.inputPrice || 0,
        outputPrice: 0,
        collectionTrainingType: TrainingModeEnum.chunk
      }
    };
    return map[importType];
  }, [
    agentModel?.inputPrice,
    agentModel?.maxContext,
    agentModel?.outputPrice,
    importType,
    vectorModel?.defaultToken,
    vectorModel?.inputPrice
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
      maxW={['90vw', 'min(1440px,85vw)']}
      w={['90vw', 'min(1440px,85vw)']}
      h={'90vh'}
    >
      <ModalCloseButton onClick={onClose} />
      <Flex mt={2} flexDirection={'column'} flex={'1 0 0'}>
        <Box pb={[5, 7]} px={[4, 8]} borderBottom={theme.borders.base}>
          <MyRadio
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(3,1fr)']}
            list={[
              {
                icon: 'file/indexImport',
                title: t('core.dataset.import.Chunk Split'),
                desc: t('core.dataset.import.Chunk Split Tip'),
                value: ImportTypeEnum.chunk
              },
              {
                icon: 'file/qaImport',
                title: t('core.dataset.import.QA Import'),
                desc: t('core.dataset.import.QA Import Tip'),
                value: ImportTypeEnum.qa
              },
              {
                icon: 'file/csv',
                title: t('core.dataset.import.CSV Import'),
                desc: t('core.dataset.import.CSV Import Tip'),
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
