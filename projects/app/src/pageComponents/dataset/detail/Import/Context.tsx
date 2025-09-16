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
import { Box, Button, Flex, IconButton, Divider, Text } from '@chakra-ui/react';
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
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';

export type ImportFormType = {
  customPdfParse: boolean;
  webSelector: string;
} & CollectionChunkFormType;

type DatasetImportContextType = {
  importSource: ImportDataSourceEnum;
  parentId: string | undefined;
  activeStep: number;
  tab: number;
  isEditMode: boolean;
  goToNext: () => void;

  processParamsForm: UseFormReturn<ImportFormType, any>;
  sources: ImportSourceItemType[];
  setSources: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
  setTab: React.Dispatch<React.SetStateAction<number>>;
  datasetId: string;
};

export const defaultFormData: ImportFormType = {
  customPdfParse: false,

  trainingType: DatasetCollectionDataProcessModeEnum.chunk,

  chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
  chunkTriggerMinSize: chunkAutoChunkSize,

  dataEnhanceCollectionName: false,

  imageIndex: false,
  autoIndexes: false,
  indexPrefixTitle: false,

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
  autoChunkSize: 0,
  datasetId: ''
});

const DatasetImportContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    source = ImportDataSourceEnum.fileLocal,
    parentId,
    mode
  } = (router.query || {}) as {
    source: ImportDataSourceEnum;
    parentId?: string;
    mode: 'create' | 'edit';
  };

  const datasetId = (router.query.datasetId || '') as string;

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
    ],
    [ImportDataSourceEnum.database]: [
      {
        title: t('dataset:connect_database')
      },
      {
        title: t('dataset:data_config')
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

  const [tab, setTab] = useState<number>(0);

  const contextValue = {
    importSource: source,
    parentId,
    activeStep,
    tab,
    isEditMode: mode === 'edit',
    goToNext,

    processParamsForm,
    sources,
    setSources,
    setTab,
    datasetId
  };

  const handleReturn = () => {
    router.replace({
      query: {
        ...router.query,
        currentTab: TabEnum.collectionCard
      }
    });
  };

  const renderCreateStatusStep = () => {
    return (
      <>
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
                onClick={handleReturn}
              />
              <Text onClick={handleReturn} cursor={'pointer'}>
                {t('common:Exit')}
              </Text>
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
      </>
    );
  };

  const renderUpdateStatusStep = () => {
    return (
      <>
        <Box position="relative">
          <Box
            position="absolute"
            alignItems={'center'}
            top="50%"
            left="16px"
            display={'flex'}
            transform="translateY(-50%)"
          >
            <IconButton
              icon={<MyIcon name={'common/backFill'} w={'14px'} />}
              aria-label={''}
              size={'smSquare'}
              borderRadius={'50%'}
              variant={'whiteBase'}
              mr={2}
              onClick={handleReturn}
            />
            <Text onClick={handleReturn} cursor={'pointer'}>
              {t('common:Exit')}
            </Text>
          </Box>
          <Flex flex="1" justifyContent="center" mr="70px">
            <Box>
              <LightRowTabs
                px={4}
                py={1}
                flex={1}
                mx={'auto'}
                w={'100%'}
                list={steps.map((v, i) => ({ label: v.title, value: i }))}
                activeColor="primary.700"
                value={tab}
                onChange={(e) => setTab(Number(e))}
                inlineStyles={{
                  fontSize: '1rem',
                  lineHeight: '1.5rem',
                  fontWeight: 500,
                  border: 'none',
                  _hover: {
                    bg: 'myGray.05'
                  },
                  borderRadius: '6px'
                }}
              />
            </Box>
          </Flex>
        </Box>

        <Divider mb={3} mt={3} />
      </>
    );
  };

  const renderStep = () => (mode === 'edit' ? renderUpdateStatusStep() : renderCreateStatusStep());

  return (
    <DatasetImportContext.Provider value={contextValue}>
      {renderStep()}
      {children}
    </DatasetImportContext.Provider>
  );
};

export default DatasetImportContextProvider;
