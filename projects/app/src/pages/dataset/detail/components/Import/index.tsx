import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useContextSelector } from 'use-context-selector';
import DatasetImportContextProvider, { DatasetImportContext } from './Context';
import { useRouter } from 'next/router';
import { AdjustTrainingStatus } from '../DataCard';

const FileLocal = dynamic(() => import('./diffSource/FileLocal'));
const FileLink = dynamic(() => import('./diffSource/FileLink'));
const FileCustomText = dynamic(() => import('./diffSource/FileCustomText'));
const TableLocal = dynamic(() => import('./diffSource/TableLocal'));
const ExternalFileCollection = dynamic(() => import('./diffSource/ExternalFile'));
const ReTraining = dynamic(() => import('./diffSource/ReTraining'));

const ImportDataset = () => {
  const router = useRouter();
  const { adjustTraining } = router.query;
  const importSource = useContextSelector(DatasetImportContext, (v) => v.importSource);

  const ImportComponent = useMemo(() => {
    if (
      adjustTraining === AdjustTrainingStatus.TRUE &&
      importSource === ImportDataSourceEnum.fileLocal
    ) {
      return ReTraining;
    }
    if (
      adjustTraining === AdjustTrainingStatus.TRUE &&
      importSource === ImportDataSourceEnum.fileLink
    ) {
      return ReTraining;
    }
    if (importSource === ImportDataSourceEnum.fileLocal) return FileLocal;
    if (importSource === ImportDataSourceEnum.fileLink) return FileLink;
    if (importSource === ImportDataSourceEnum.fileCustom) return FileCustomText;
    if (importSource === ImportDataSourceEnum.csvTable) return TableLocal;
    if (importSource === ImportDataSourceEnum.externalFile) return ExternalFileCollection;
  }, [adjustTraining, importSource]);

  return ImportComponent ? (
    <Box flex={'1 0 0'} overflow={'auto'}>
      <ImportComponent />
    </Box>
  ) : null;
};

const Render = () => {
  return (
    <Flex
      flexDirection={'column'}
      bg={'white'}
      h={'100%'}
      px={[2, 9]}
      py={[2, 5]}
      borderRadius={'md'}
    >
      <DatasetImportContextProvider>
        <ImportDataset />
      </DatasetImportContextProvider>
    </Flex>
  );
};

export default React.memo(Render);
