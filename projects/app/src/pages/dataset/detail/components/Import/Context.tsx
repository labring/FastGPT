import { useRouter } from 'next/router';
import { SetStateAction, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext, useContextSelector } from 'use-context-selector';
import { ImportDataSourceEnum, TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TabEnum } from '../NavBar';
import { ImportProcessWayEnum } from '@/web/core/dataset/constants';
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
  showChunkInput: boolean;
  showPromptInput: boolean;
  charsPointsPrice: number;
  priceTip: string;
  uploadRate: number;
  chunkSizeField?: ChunkSizeFieldType;
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
  mode: TrainingModeEnum;
  way: ImportProcessWayEnum;
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
  showChunkInput: false,
  showPromptInput: false,
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
      { title: t('common:core.dataset.import.Upload data') }
    ],
    [ImportDataSourceEnum.fileLocal]: [
      {
        title: t('common:core.dataset.import.Select file')
      },
      {
        title: t('common:core.dataset.import.Data Preprocessing')
      },
      {
        title: t('common:core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.fileLink]: [
      {
        title: t('common:core.dataset.import.Select file')
      },
      {
        title: t('common:core.dataset.import.Data Preprocessing')
      },
      {
        title: t('common:core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.fileCustom]: [
      {
        title: t('common:core.dataset.import.Select file')
      },
      {
        title: t('common:core.dataset.import.Data Preprocessing')
      },
      {
        title: t('common:core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.csvTable]: [
      {
        title: t('common:core.dataset.import.Select file')
      },
      {
        title: t('common:core.dataset.import.Data Preprocessing')
      },
      {
        title: t('common:core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.externalFile]: [
      {
        title: t('common:core.dataset.import.Select file')
      },
      {
        title: t('common:core.dataset.import.Data Preprocessing')
      },
      {
        title: t('common:core.dataset.import.Upload data')
      }
    ],
    [ImportDataSourceEnum.apiDataset]: [
      {
        title: t('common:core.dataset.import.Select file')
      },
      {
        title: t('common:core.dataset.import.Data Preprocessing')
      },
      {
        title: t('common:core.dataset.import.Upload data')
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
      mode: TrainingModeEnum.chunk,
      way: ImportProcessWayEnum.auto,
      embeddingChunkSize: vectorModel?.defaultToken || 512,
      qaChunkSize: Math.min(agentModel.maxResponse * 1, agentModel.maxContext * 0.7),
      customSplitChar: '',
      qaPrompt: Prompt_AgentQA.description,
      webSelector: ''
    }
  });

  const [sources, setSources] = useState<ImportSourceItemType[]>([]);

  // watch form
  const mode = processParamsForm.watch('mode');
  const way = processParamsForm.watch('way');
  const embeddingChunkSize = processParamsForm.watch('embeddingChunkSize');
  const qaChunkSize = processParamsForm.watch('qaChunkSize');
  const customSplitChar = processParamsForm.watch('customSplitChar');

  const modeStaticParams: Record<TrainingModeEnum, TrainingFiledType> = {
    [TrainingModeEnum.auto]: {
      chunkOverlapRatio: 0.2,
      maxChunkSize: 2048,
      minChunkSize: 100,
      autoChunkSize: vectorModel?.defaultToken ? vectorModel?.defaultToken * 2 : 1024,
      chunkSize: vectorModel?.defaultToken ? vectorModel?.defaultToken * 2 : 1024,
      showChunkInput: false,
      showPromptInput: false,
      charsPointsPrice: agentModel.charsPointsPrice,
      priceTip: t('dataset:import.Auto mode Estimated Price Tips', {
        price: agentModel.charsPointsPrice
      }),
      uploadRate: 100
    },
    [TrainingModeEnum.chunk]: {
      chunkSizeField: 'embeddingChunkSize' as ChunkSizeFieldType,
      chunkOverlapRatio: 0.2,
      maxChunkSize: vectorModel?.maxToken || 512,
      minChunkSize: 100,
      autoChunkSize: vectorModel?.defaultToken || 512,
      chunkSize: embeddingChunkSize,
      showChunkInput: true,
      showPromptInput: false,
      charsPointsPrice: vectorModel.charsPointsPrice,
      priceTip: t('dataset:import.Embedding Estimated Price Tips', {
        price: vectorModel.charsPointsPrice
      }),
      uploadRate: 150
    },
    [TrainingModeEnum.qa]: {
      chunkSizeField: 'qaChunkSize' as ChunkSizeFieldType,
      chunkOverlapRatio: 0,
      maxChunkSize: Math.min(agentModel.maxResponse * 4, agentModel.maxContext * 0.7),
      minChunkSize: 4000,
      autoChunkSize: Math.min(agentModel.maxResponse * 1, agentModel.maxContext * 0.7),
      chunkSize: qaChunkSize,
      showChunkInput: true,
      showPromptInput: true,
      charsPointsPrice: agentModel.charsPointsPrice,
      priceTip: t('dataset:import.Auto mode Estimated Price Tips', {
        price: agentModel.charsPointsPrice
      }),
      uploadRate: 30
    }
  };
  const selectModelStaticParam = modeStaticParams[mode];

  const wayStaticPrams = {
    [ImportProcessWayEnum.auto]: {
      chunkSize: selectModelStaticParam.autoChunkSize,
      customSplitChar: ''
    },
    [ImportProcessWayEnum.custom]: {
      chunkSize: modeStaticParams[mode].chunkSize,
      customSplitChar
    }
  };
  const chunkSize = wayStaticPrams[way].chunkSize;

  const contextValue = {
    importSource: source,
    parentId,
    activeStep,
    goToNext,

    processParamsForm,
    ...selectModelStaticParam,
    sources,
    setSources,
    chunkSize
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
