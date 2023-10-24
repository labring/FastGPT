import React, { useMemo, useState } from 'react';
import { Box, type BoxProps, Flex, useTheme, ModalCloseButton } from '@chakra-ui/react';
import MyRadio from '@/components/Radio/index';
import dynamic from 'next/dynamic';
import ChunkImport from './Chunk';
import { useTranslation } from 'react-i18next';

const QAImport = dynamic(() => import('./QA'), {});
const CsvImport = dynamic(() => import('./Csv'), {});
import MyModal from '@/components/MyModal';
import Provider from './Provider';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { qaModelList } from '@/web/common/system/staticData';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';

export enum ImportTypeEnum {
  index = 'index',
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
  const [importType, setImportType] = useState<`${ImportTypeEnum}`>(ImportTypeEnum.index);

  const typeMap = useMemo(() => {
    const vectorModel = datasetDetail.vectorModel;
    const qaModel = qaModelList[0];
    const map = {
      [ImportTypeEnum.index]: {
        defaultChunkLen: vectorModel?.defaultToken || 500,
        unitPrice: vectorModel?.price || 0.2,
        mode: TrainingModeEnum.index
      },
      [ImportTypeEnum.qa]: {
        defaultChunkLen: qaModel?.maxToken * 0.5 || 8000,
        unitPrice: qaModel?.price || 3,
        mode: TrainingModeEnum.qa
      },
      [ImportTypeEnum.csv]: {
        defaultChunkLen: vectorModel?.defaultToken || 500,
        unitPrice: vectorModel?.price || 0.2,
        mode: TrainingModeEnum.index
      }
    };
    return map[importType];
  }, [datasetDetail.vectorModel, importType]);

  const TitleStyle: BoxProps = {
    fontWeight: 'bold',
    fontSize: ['md', 'xl']
  };

  return (
    <MyModal
      title={<Box {...TitleStyle}>{t('dataset.data.File import')}</Box>}
      isOpen
      isCentered
      maxW={['90vw', '85vw']}
      w={['90vw', '85vw']}
      h={'90vh'}
    >
      <ModalCloseButton onClick={onClose} />
      <Flex flexDirection={'column'} flex={'1 0 0'}>
        <Box pb={[5, 7]} px={[4, 8]} borderBottom={theme.borders.base}>
          <MyRadio
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(3,1fr)']}
            list={[
              {
                icon: 'indexImport',
                title: '直接分段',
                desc: '选择文本文件，直接将其按分段进行处理',
                value: ImportTypeEnum.index
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
          importType={importType}
          datasetId={datasetId}
          parentId={parentId}
          onUploadSuccess={uploadSuccess}
        >
          <Box flex={'1 0 0'} h={0}>
            {importType === ImportTypeEnum.index && <ChunkImport />}
            {importType === ImportTypeEnum.qa && <QAImport />}
            {importType === ImportTypeEnum.csv && <CsvImport />}
          </Box>
        </Provider>
      </Flex>
    </MyModal>
  );
};

export default ImportData;
