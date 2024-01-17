import React, { useMemo } from 'react';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { TabEnum } from '../../index';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import dynamic from 'next/dynamic';
import Provider from './Provider';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';

const FileLocal = dynamic(() => import('./diffSource/FileLocal'));
const FileLink = dynamic(() => import('./diffSource/FileLink'));
const FileCustomText = dynamic(() => import('./diffSource/FileCustomText'));
const TableLocal = dynamic(() => import('./diffSource/TableLocal'));

export enum ImportDataSourceEnum {
  fileLocal = 'fileLocal',
  fileLink = 'fileLink',
  fileCustom = 'fileCustom',

  tableLocal = 'tableLocal'
}

const ImportDataset = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { datasetDetail } = useDatasetStore();
  const { source = ImportDataSourceEnum.fileLocal, parentId } = (router.query || {}) as {
    source: `${ImportDataSourceEnum}`;
    parentId?: string;
  };

  const modeSteps: Record<`${ImportDataSourceEnum}`, { title: string }[]> = {
    [ImportDataSourceEnum.fileLocal]: [
      {
        title: t('core.dataset.import.Select file')
      },
      {
        title: t('core.dataset.import.Data Preprocessing')
      },
      {
        title: t('core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.fileLink]: [
      {
        title: t('core.dataset.import.Select file')
      },
      {
        title: t('core.dataset.import.Data Preprocessing')
      },
      {
        title: t('core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.fileCustom]: [
      {
        title: t('core.dataset.import.Select file')
      },
      {
        title: t('core.dataset.import.Data Preprocessing')
      },
      {
        title: t('core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.tableLocal]: [
      {
        title: t('core.dataset.import.Select file')
      },
      {
        title: t('core.dataset.import.Data Preprocessing')
      },
      {
        title: t('core.dataset.import.Upload data')
      }
    ]
  };
  const steps = modeSteps[source];

  const { activeStep, goToNext, goToPrevious, MyStep } = useMyStep({
    defaultStep: 0,
    steps
  });

  const ImportComponent = useMemo(() => {
    if (source === ImportDataSourceEnum.fileLocal) return FileLocal;
    if (source === ImportDataSourceEnum.fileLink) return FileLink;
    if (source === ImportDataSourceEnum.fileCustom) return FileCustomText;
    if (source === ImportDataSourceEnum.tableLocal) return TableLocal;
  }, [source]);

  return ImportComponent ? (
    <Flex flexDirection={'column'} bg={'white'} h={'100%'} px={[2, 9]} py={[2, 5]}>
      <Flex>
        {activeStep === 0 ? (
          <Flex alignItems={'center'}>
            <IconButton
              icon={<MyIcon name={'common/backFill'} w={'14px'} />}
              aria-label={''}
              size={'smSquare'}
              w={'26px'}
              h={'26px'}
              borderRadius={'50%'}
              variant={'whiteBase'}
              mr={2}
              onClick={() =>
                router.replace({
                  query: {
                    ...router.query,
                    currentTab: TabEnum.collectionCard
                  }
                })
              }
            />
            {t('common.Exit')}
          </Flex>
        ) : (
          <Button
            variant={'whiteBase'}
            leftIcon={<MyIcon name={'common/backFill'} w={'14px'} />}
            onClick={goToPrevious}
          >
            {t('common.Last Step')}
          </Button>
        )}
        <Box flex={1} />
      </Flex>
      {/* step */}
      <Box
        mt={4}
        mb={5}
        px={3}
        py={[2, 4]}
        bg={'myGray.50'}
        borderWidth={'1px'}
        borderColor={'borderColor.low'}
        borderRadius={'md'}
      >
        <Box maxW={['100%', '900px']} mx={'auto'}>
          <MyStep />
        </Box>
      </Box>
      <Provider dataset={datasetDetail} parentId={parentId}>
        <Box flex={'1 0 0'} overflow={'auto'} position={'relative'}>
          <ImportComponent activeStep={activeStep} goToNext={goToNext} />
        </Box>
      </Provider>
    </Flex>
  ) : null;
};

export default React.memo(ImportDataset);
