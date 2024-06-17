import React, { useEffect, useMemo, useTransition } from 'react';
import {
  Box,
  Flex,
  Grid,
  BoxProps,
  useTheme,
  useDisclosure,
  Button,
  HStack
} from '@chakra-ui/react';
import { AddIcon, SmallAddIcon } from '@chakra-ui/icons';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';

import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import VariableEdit from '@/components/core/app/VariableEdit';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import DeleteIcon, { hoverDeleteStyles } from '@fastgpt/web/components/common/Icon/delete';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { getSystemVariables } from '@/web/core/app/utils';
import { useUpdate } from 'ahooks';
import { useI18n } from '@/web/context/I18n';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pages/app/detail/components/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const ToolSelectModal = dynamic(() => import('./components/ToolSelectModal'));
const TTSSelect = dynamic(() => import('@/components/core/app/TTSSelect'));
const QGSwitch = dynamic(() => import('@/components/core/app/QGSwitch'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const InputGuideConfig = dynamic(() => import('@/components/core/app/InputGuideConfig'));
const ScheduledTriggerConfig = dynamic(
  () => import('@/components/core/app/ScheduledTriggerConfig')
);
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));

const BoxStyles: BoxProps = {
  px: 5,
  py: '16px',
  borderBottomWidth: '1px',
  borderBottomColor: 'borderColor.low'
};
const LabelStyles: BoxProps = {
  w: ['60px', '100px'],
  flexShrink: 0,
  fontSize: 'xs'
};

const EditForm = ({ editForm }: { editForm: UseFormReturn<AppSimpleEditFormType, any> }) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const { allDatasets } = useDatasetStore();
  const { llmModelList } = useSystemStore();
  const [, startTst] = useTransition();
  const refresh = useUpdate();

  const { setValue, getValues, control, watch } = editForm;

  const { fields: datasets, replace: replaceDatasetList } = useFieldArray({
    control,
    name: 'dataset.datasets'
  });
  const selectDatasets = useMemo(
    () => allDatasets.filter((item) => datasets.find((dataset) => dataset.datasetId === item._id)),
    [allDatasets, datasets]
  );

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();
  const {
    isOpen: isOpenToolsSelect,
    onOpen: onOpenToolsSelect,
    onClose: onCloseToolsSelect
  } = useDisclosure();

  const aiSystemPrompt = watch('aiSettings.systemPrompt');
  const selectLLMModel = watch('aiSettings.model');
  const datasetSearchSetting = watch('dataset');
  const variables = watch('chatConfig.variables');

  const formatVariables: any = useMemo(
    () => formatEditorVariablePickerIcon([...getSystemVariables(t), ...(variables || [])]),
    [t, variables]
  );
  const tts = getValues('chatConfig.ttsConfig');
  const whisperConfig = getValues('chatConfig.whisperConfig');
  const postQuestionGuide = getValues('chatConfig.questionGuide');
  const selectedTools = watch('selectedTools');
  const inputGuideConfig = watch('chatConfig.chatInputGuide');
  const scheduledTriggerConfig = watch('chatConfig.scheduledTriggerConfig');
  const searchMode = watch('dataset.searchMode');

  const tokenLimit = useMemo(() => {
    return llmModelList.find((item) => item.model === selectLLMModel)?.quoteMaxToken || 3000;
  }, [selectLLMModel, llmModelList]);

  useEffect(() => {
    const wat = watch((data) => {
      refresh();
    });

    return () => {
      wat.unsubscribe();
    };
  }, []);

  return (
    <>
      <Box>
        {/* ai */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <MyIcon name={'core/app/simpleMode/ai'} w={'20px'} />
            <FormLabel ml={2} flex={1}>
              {appT('AI Settings')}
            </FormLabel>
          </Flex>
          <Flex alignItems={'center'} mt={5}>
            <Box {...LabelStyles}>{t('core.ai.Model')}</Box>
            <Box flex={'1 0 0'}>
              <SettingLLMModel
                llmModelType={'all'}
                defaultData={{
                  model: getValues('aiSettings.model'),
                  temperature: getValues('aiSettings.temperature'),
                  maxToken: getValues('aiSettings.maxToken'),
                  maxHistories: getValues('aiSettings.maxHistories')
                }}
                onChange={({ model, temperature, maxToken, maxHistories }: SettingAIDataType) => {
                  setValue('aiSettings.model', model);
                  setValue('aiSettings.maxToken', maxToken);
                  setValue('aiSettings.temperature', temperature);
                  setValue('aiSettings.maxHistories', maxHistories ?? 6);
                }}
              />
            </Box>
          </Flex>

          <Box mt={3}>
            <HStack {...LabelStyles}>
              <Box>{t('core.ai.Prompt')}</Box>
              <QuestionTip label={t('core.app.tip.chatNodeSystemPromptTip')} />
            </HStack>
            <Box mt={1}>
              <PromptEditor
                value={aiSystemPrompt}
                onChange={(text) => {
                  startTst(() => {
                    setValue('aiSettings.systemPrompt', text);
                  });
                }}
                variables={formatVariables}
                placeholder={t('core.app.tip.chatNodeSystemPromptTip')}
                title={t('core.ai.Prompt')}
              />
            </Box>
          </Box>
        </Box>

        {/* dataset */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={'core/app/simpleMode/dataset'} w={'20px'} />
              <FormLabel ml={2}>{t('core.dataset.Choose Dataset')}</FormLabel>
            </Flex>
            <Button
              variant={'transparentBase'}
              leftIcon={<MyIcon name="common/addLight" w={'0.8rem'} />}
              iconSpacing={1}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenKbSelect}
            >
              {t('common.Choose')}
            </Button>
            <Button
              variant={'transparentBase'}
              leftIcon={<MyIcon name={'edit'} w={'14px'} />}
              iconSpacing={1}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenDatasetParams}
            >
              {t('common.Params')}
            </Button>
          </Flex>
          {datasetSearchSetting.datasets?.length > 0 && (
            <Box my={3}>
              <SearchParamsTip
                searchMode={searchMode}
                similarity={getValues('dataset.similarity')}
                limit={getValues('dataset.limit')}
                usingReRank={getValues('dataset.usingReRank')}
                queryExtensionModel={getValues('dataset.datasetSearchExtensionModel')}
              />
            </Box>
          )}
          <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={[2, 4]}>
            {selectDatasets.map((item) => (
              <MyTooltip key={item._id} label={t('core.dataset.Read Dataset')}>
                <Flex
                  overflow={'hidden'}
                  alignItems={'center'}
                  p={2}
                  bg={'white'}
                  boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                  borderRadius={'md'}
                  border={theme.borders.base}
                  cursor={'pointer'}
                  onClick={() =>
                    router.push({
                      pathname: '/dataset/detail',
                      query: {
                        datasetId: item._id
                      }
                    })
                  }
                >
                  <Avatar src={item.avatar} w={'18px'} mr={1} />
                  <Box flex={'1 0 0'} w={0} className={'textEllipsis'} fontSize={'sm'}>
                    {item.name}
                  </Box>
                </Flex>
              </MyTooltip>
            ))}
          </Grid>
        </Box>

        {/* tool choice */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={'core/app/toolCall'} w={'20px'} />
              <FormLabel ml={2}>{t('core.app.Tool call')}(实验功能)</FormLabel>
              <QuestionTip ml={1} label={t('core.app.Tool call tip')} />
            </Flex>
            <Button
              variant={'transparentBase'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              mr={'-5px'}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenToolsSelect}
            >
              {t('common.Choose')}
            </Button>
          </Flex>
          <Grid
            mt={selectedTools.length > 0 ? 2 : 0}
            gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
            gridGap={[2, 4]}
          >
            {selectedTools.map((item) => (
              <Flex
                key={item.id}
                overflow={'hidden'}
                alignItems={'center'}
                p={2}
                bg={'white'}
                boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                borderRadius={'md'}
                border={theme.borders.base}
                _hover={{
                  ...hoverDeleteStyles,
                  borderColor: 'primary.300'
                }}
              >
                <Avatar src={item.avatar} w={'1rem'} mr={1} />
                <Box flex={'1 0 0'} w={0} className={'textEllipsis'} fontSize={'sm'}>
                  {item.name}
                </Box>
                <DeleteIcon
                  onClick={() => {
                    setValue(
                      'selectedTools',
                      selectedTools.filter((tool) => tool.id !== item.id)
                    );
                  }}
                />
              </Flex>
            ))}
          </Grid>
        </Box>

        {/* variable */}
        <Box {...BoxStyles}>
          <VariableEdit
            variables={variables}
            onChange={(e) => {
              setValue('chatConfig.variables', e);
            }}
          />
        </Box>

        {/* welcome */}
        <Box {...BoxStyles}>
          <WelcomeTextConfig
            defaultValue={getValues('chatConfig.welcomeText')}
            onBlur={(e) => {
              setValue('chatConfig.welcomeText', e.target.value || '');
            }}
          />
        </Box>

        {/* tts */}
        <Box {...BoxStyles}>
          <TTSSelect
            value={tts}
            onChange={(e) => {
              setValue('chatConfig.ttsConfig', e);
            }}
          />
        </Box>

        {/* whisper */}
        <Box {...BoxStyles}>
          <WhisperConfig
            isOpenAudio={tts?.type !== TTSTypeEnum.none}
            value={whisperConfig}
            onChange={(e) => {
              setValue('chatConfig.whisperConfig', e);
            }}
          />
        </Box>

        {/* question guide */}
        <Box {...BoxStyles}>
          <QGSwitch
            isChecked={postQuestionGuide}
            onChange={(e) => {
              setValue('chatConfig.questionGuide', e.target.checked);
            }}
          />
        </Box>

        {/* question tips */}
        <Box {...BoxStyles}>
          <InputGuideConfig
            appId={appDetail._id}
            value={inputGuideConfig}
            onChange={(e) => {
              setValue('chatConfig.chatInputGuide', e);
            }}
          />
        </Box>

        {/* timer trigger */}
        <Box {...BoxStyles} borderBottom={'none'}>
          <ScheduledTriggerConfig
            value={scheduledTriggerConfig}
            onChange={(e) => {
              setValue('chatConfig.scheduledTriggerConfig', e);
            }}
          />
        </Box>
      </Box>

      {isOpenDatasetSelect && (
        <DatasetSelectModal
          isOpen={isOpenDatasetSelect}
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item._id,
            vectorModel: item.vectorModel
          }))}
          onClose={onCloseKbSelect}
          onChange={replaceDatasetList}
        />
      )}
      {isOpenDatasetParams && (
        <DatasetParamsModal
          {...datasetSearchSetting}
          maxTokens={tokenLimit}
          onClose={onCloseDatasetParams}
          onSuccess={(e) => {
            setValue('dataset', {
              ...getValues('dataset'),
              ...e
            });
          }}
        />
      )}
      {isOpenToolsSelect && (
        <ToolSelectModal
          selectedTools={selectedTools}
          onAddTool={(e) => {
            setValue('selectedTools', [...selectedTools, e]);
          }}
          onRemoveTool={(e) => {
            setValue(
              'selectedTools',
              selectedTools.filter((item) => item.pluginId !== e.pluginId)
            );
          }}
          onClose={onCloseToolsSelect}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);
