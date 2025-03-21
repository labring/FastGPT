import { useRouter } from 'next/router';
import { SetStateAction, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import {
  DatasetCollectionDataProcessModeEnum,
  ImportDataSourceEnum
} from '@fastgpt/global/core/dataset/constants';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TabEnum } from '../NavBar';
import { ChunkSettingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { UseFormReturn, useForm } from 'react-hook-form';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DataChunkSplitModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  getMaxChunkSize,
  getLLMDefaultChunkSize,
  getLLMMaxChunkSize,
  chunkAutoChunkSize,
  minChunkSize,
  getAutoIndexSize,
  getMaxIndexSize
} from '@fastgpt/global/core/dataset/training/utils';

type TrainingFiledType = {
  chunkOverlapRatio: number;
  maxChunkSize: number;
  minChunkSize: number;
  autoChunkSize: number;
  chunkSize: number;
  maxIndexSize?: number;
  indexSize?: number;
  autoIndexSize?: number;
  charsPointsPrice: number;
  priceTip: string;
  uploadRate: number;
  chunkSizeField: ChunkSizeFieldType;
};
type DatasetImportContextType = {
  importSource: ImportDataSourceEnum;
  parentId: string | undefined;
  activeStep: number;
  goToNext: () => void;

  processParamsForm: UseFormReturn<ImportFormType, any>;
  sources: ImportSourceItemType[];
  setSources: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
} & TrainingFiledType;

type ChunkSizeFieldType = 'embeddingChunkSize' | 'qaChunkSize';
export type ImportFormType = {
  customPdfParse: boolean;

  trainingType: DatasetCollectionDataProcessModeEnum;
  imageIndex: boolean;
  autoIndexes: boolean;

  chunkSettingMode: ChunkSettingModeEnum;

  chunkSplitMode: DataChunkSplitModeEnum;
  embeddingChunkSize: number;
  qaChunkSize: number;
  chunkSplitter: string;
  indexSize: number;

  qaPrompt: string;
  webSelector: string;
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
  uploadRate: 0,
  //@ts-ignore
  processParamsForm: undefined,
  autoChunkSize: 0,
  charsPointsPrice: 0,
  priceTip: ''
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
    [ImportDataSourceEnum.csvTable]: [
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
    ]
  };
  const steps = modeSteps[source];
  const { activeStep, goToNext, goToPrevious, MyStep } = useMyStep({
    defaultStep: 0,
    steps
  });

  const vectorModel = datasetDetail.vectorModel;
  const agentModel = datasetDetail.agentModel;

  const processParamsForm = useForm<ImportFormType>({
    defaultValues: {
      imageIndex: false,
      autoIndexes: false,

      trainingType: DatasetCollectionDataProcessModeEnum.chunk,

      chunkSettingMode: ChunkSettingModeEnum.auto,

      chunkSplitMode: DataChunkSplitModeEnum.size,
      embeddingChunkSize: 2000,
      indexSize: vectorModel?.defaultToken || 512,
      qaChunkSize: getLLMDefaultChunkSize(agentModel),
      chunkSplitter: '',
      qaPrompt: Prompt_AgentQA.description,
      webSelector: '',
      customPdfParse: false
    }
  });

  const [sources, setSources] = useState<ImportSourceItemType[]>([]);

  // watch form
  const trainingType = processParamsForm.watch('trainingType');
  const chunkSettingMode = processParamsForm.watch('chunkSettingMode');
  const embeddingChunkSize = processParamsForm.watch('embeddingChunkSize');
  const qaChunkSize = processParamsForm.watch('qaChunkSize');
  const chunkSplitter = processParamsForm.watch('chunkSplitter');
  const autoIndexes = processParamsForm.watch('autoIndexes');
  const indexSize = processParamsForm.watch('indexSize');

  const TrainingModeMap = useMemo<TrainingFiledType>(() => {
    if (trainingType === DatasetCollectionDataProcessModeEnum.qa) {
      return {
        chunkSizeField: 'qaChunkSize',
        chunkOverlapRatio: 0,
        maxChunkSize: getLLMMaxChunkSize(agentModel),
        minChunkSize: 1000,
        autoChunkSize: getLLMDefaultChunkSize(agentModel),
        chunkSize: qaChunkSize,
        charsPointsPrice: agentModel.charsPointsPrice || 0,
        priceTip: t('dataset:import.Auto mode Estimated Price Tips', {
          price: agentModel.charsPointsPrice
        }),
        uploadRate: 30
      };
    } else if (autoIndexes) {
      return {
        chunkSizeField: 'embeddingChunkSize',
        chunkOverlapRatio: 0.2,
        maxChunkSize: getMaxChunkSize(agentModel),
        minChunkSize: minChunkSize,
        autoChunkSize: chunkAutoChunkSize,
        chunkSize: embeddingChunkSize,
        maxIndexSize: getMaxIndexSize(vectorModel),
        autoIndexSize: getAutoIndexSize(vectorModel),
        indexSize,
        charsPointsPrice: agentModel.charsPointsPrice || 0,
        priceTip: t('dataset:import.Auto mode Estimated Price Tips', {
          price: agentModel.charsPointsPrice
        }),
        uploadRate: 100
      };
    } else {
      return {
        chunkSizeField: 'embeddingChunkSize',
        chunkOverlapRatio: 0.2,
        maxChunkSize: getMaxChunkSize(agentModel),
        minChunkSize: minChunkSize,
        autoChunkSize: chunkAutoChunkSize,
        chunkSize: embeddingChunkSize,
        maxIndexSize: getMaxIndexSize(vectorModel),
        autoIndexSize: getAutoIndexSize(vectorModel),
        indexSize,
        charsPointsPrice: vectorModel.charsPointsPrice || 0,
        priceTip: t('dataset:import.Embedding Estimated Price Tips', {
          price: vectorModel.charsPointsPrice
        }),
        uploadRate: 150
      };
    }
  }, [
    trainingType,
    autoIndexes,
    agentModel,
    qaChunkSize,
    t,
    embeddingChunkSize,
    vectorModel,
    indexSize
  ]);

  const chunkSettingModeMap = useMemo(() => {
    if (chunkSettingMode === ChunkSettingModeEnum.auto) {
      return {
        chunkSize: TrainingModeMap.autoChunkSize,
        indexSize: TrainingModeMap.autoIndexSize,
        chunkSplitter: ''
      };
    } else {
      return {
        chunkSize: TrainingModeMap.chunkSize,
        indexSize: TrainingModeMap.indexSize,
        chunkSplitter
      };
    }
  }, [
    chunkSettingMode,
    TrainingModeMap.autoChunkSize,
    TrainingModeMap.autoIndexSize,
    TrainingModeMap.chunkSize,
    TrainingModeMap.indexSize,
    chunkSplitter
  ]);

  const contextValue = {
    ...TrainingModeMap,
    ...chunkSettingModeMap,
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
            {t('common:common.Exit')}
          </Flex>
        ) : (
          <Button
            variant={'whiteBase'}
            leftIcon={<MyIcon name={'common/backFill'} w={'14px'} />}
            onClick={goToPrevious}
          >
            {t('common:common.Last Step')}
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
      {children}
    </DatasetImportContext.Provider>
  );
};

export default DatasetImportContextProvider;
