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
import { ChunkSettingModeEnum } from '@/web/core/dataset/constants';
import { UseFormReturn, useForm } from 'react-hook-form';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';

type TrainingFiledType = {
  chunkOverlapRatio: number;
  maxChunkSize: number;
  minChunkSize: number;
  autoChunkSize: number;
  chunkSize: number;
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
  embeddingChunkSize: number;
  qaChunkSize: number;
  customSplitChar: string;
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
      embeddingChunkSize: vectorModel?.defaultToken || 512,
      qaChunkSize: Math.min(agentModel.maxResponse * 1, agentModel.maxContext * 0.7),
      customSplitChar: '',
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
  const customSplitChar = processParamsForm.watch('customSplitChar');
  const autoIndexes = processParamsForm.watch('autoIndexes');

  const TrainingModeMap = useMemo<TrainingFiledType>(() => {
    if (trainingType === DatasetCollectionDataProcessModeEnum.qa) {
      return {
        chunkSizeField: 'qaChunkSize',
        chunkOverlapRatio: 0,
        maxChunkSize: Math.min(agentModel.maxResponse * 4, agentModel.maxContext * 0.7),
        minChunkSize: 4000,
        autoChunkSize: Math.min(agentModel.maxResponse * 1, agentModel.maxContext * 0.7),
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
        maxChunkSize: 2048,
        minChunkSize: 100,
        autoChunkSize: vectorModel?.defaultToken ? vectorModel.defaultToken * 2 : 1024,
        chunkSize: embeddingChunkSize,
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
        maxChunkSize: vectorModel?.maxToken || 512,
        minChunkSize: 100,
        autoChunkSize: vectorModel?.defaultToken || 512,
        chunkSize: embeddingChunkSize,
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
    agentModel.maxResponse,
    agentModel.maxContext,
    agentModel.charsPointsPrice,
    qaChunkSize,
    t,
    vectorModel.defaultToken,
    vectorModel?.maxToken,
    vectorModel.charsPointsPrice,
    embeddingChunkSize
  ]);

  const chunkSettingModeMap = useMemo(() => {
    if (chunkSettingMode === ChunkSettingModeEnum.auto) {
      return {
        chunkSize: TrainingModeMap.autoChunkSize,
        customSplitChar: ''
      };
    } else {
      return {
        chunkSize: TrainingModeMap.chunkSize,
        customSplitChar
      };
    }
  }, [chunkSettingMode, TrainingModeMap.autoChunkSize, TrainingModeMap.chunkSize, customSplitChar]);

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
