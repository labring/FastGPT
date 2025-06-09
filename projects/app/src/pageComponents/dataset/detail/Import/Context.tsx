import { useRouter } from 'next/router';
import { type SetStateAction, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import {
  ChunkTriggerConfigTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ImportDataSourceEnum,
  ParagraphChunkAIModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TabEnum } from '../NavBar';
import { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DataChunkSplitModeEnum } from '@fastgpt/global/core/dataset/constants';
import { chunkAutoChunkSize, getAutoIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import { type CollectionChunkFormType } from '../Form/CollectionChunkForm';

export type ImportFormType = {
  customPdfParse: boolean;
  webSelector: string;
} & CollectionChunkFormType;

type DatasetImportContextType = {
  importSource: ImportDataSourceEnum;
  parentId: string | undefined;
  activeStep: number;
  goToNext: () => void;

  processParamsForm: UseFormReturn<ImportFormType, any>;
  sources: ImportSourceItemType[];
  setSources: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
};

export const defaultFormData: ImportFormType = {
  customPdfParse: false,

  trainingType: DatasetCollectionDataProcessModeEnum.chunk,

  chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
  chunkTriggerMinSize: chunkAutoChunkSize,

  dataEnhanceCollectionName: false,

  imageIndex: false,
  autoIndexes: false,

  chunkSettingMode: ChunkSettingModeEnum.auto,
  chunkSplitMode: DataChunkSplitModeEnum.paragraph,
  paragraphChunkAIMode: ParagraphChunkAIModeEnum.forbid,
  paragraphChunkDeep: 5,
  paragraphChunkMinSize: 100,

  chunkSize: chunkAutoChunkSize,
  chunkSplitter: '',
  indexSize: getAutoIndexSize(),

  qaPrompt: Prompt_AgentQA.description,
  webSelector: ''
};

export const DatasetImportContext = createContext<DatasetImportContextType>({
  importSource: ImportDataSourceEnum.fileLocal,
  goToNext: function (): void {
    throw new Error('Function not implemented.');
  },
  activeStep: 0,
  parentId: undefined,

  maxChunkSize: 0,
  minChunkSize: 0,
  sources: [],
  setSources: function (value: SetStateAction<ImportSourceItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  chunkSize: 0,
  chunkOverlapRatio: 0,
  //@ts-ignore
  processParamsForm: undefined,
  autoChunkSize: 0
});

const DatasetImportContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { source = ImportDataSourceEnum.fileLocal, parentId } = (router.query || {}) as {
    source: ImportDataSourceEnum;
    parentId?: string;
  };

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  // step
  const modeSteps: Record<ImportDataSourceEnum, { title: string }[]> = {
    [ImportDataSourceEnum.reTraining]: [
      { title: t('dataset:core.dataset.import.Adjust parameters') },
      {
        title: t('dataset:import_data_preview')
      },
      { title: t('dataset:import_confirm') }
    ],
    [ImportDataSourceEnum.fileLocal]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.fileLink]: [
      {
        title: t('dataset:import_select_link')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.fileCustom]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.externalFile]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.apiDataset]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ],
    [ImportDataSourceEnum.imageDataset]: [
      {
        title: t('dataset:import_select_file')
      },
      {
        title: t('dataset:import_param_setting')
      },
      {
        title: t('dataset:import_data_preview')
      },
      {
        title: t('dataset:import_confirm')
      }
    ]
  };
  const steps = modeSteps[source];
  const { activeStep, goToNext, goToPrevious, MyStep } = useMyStep({
    defaultStep: 0,
    steps
  });

  const vectorModel = datasetDetail.vectorModel;

  const processParamsForm = useForm<ImportFormType>({
    defaultValues: (() => ({
      ...defaultFormData,
      indexSize: getAutoIndexSize(vectorModel)
    }))()
  });

  const [sources, setSources] = useState<ImportSourceItemType[]>([]);

  const contextValue = {
    importSource: source,
    parentId,
    activeStep,
    goToNext,

    processParamsForm,
    sources,
    setSources
  };

  return (
    <DatasetImportContext.Provider value={contextValue}>
      <Flex>
        {activeStep === 0 ? (
          <Flex alignItems={'center'}>
            <IconButton
              icon={<MyIcon name={'common/backFill'} w={'14px'} />}
              aria-label={''}
              size={'smSquare'}
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
            {t('common:Exit')}
          </Flex>
        ) : (
          <Button
            variant={'whiteBase'}
            leftIcon={<MyIcon name={'common/backFill'} w={'14px'} />}
            onClick={goToPrevious}
          >
            {t('common:last_step')}
          </Button>
        )}
        <Box flex={1} />
      </Flex>
      {/* step */}
      {source !== ImportDataSourceEnum.imageDataset && (
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
      )}
      {children}
    </DatasetImportContext.Provider>
  );
};

export default DatasetImportContextProvider;
