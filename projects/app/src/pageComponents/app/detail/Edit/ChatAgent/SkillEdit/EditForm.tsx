import React, { useEffect, useMemo, useTransition } from 'react';
import {
  Box,
  Flex,
  Grid,
  type BoxProps,
  useTheme,
  useDisclosure,
  Button,
  HStack,
  Input,
  IconButton,
  Textarea
} from '@chakra-ui/react';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import VariableEdit from '@/components/core/app/VariableEdit';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { workflowSystemVariables } from '@/web/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../../FormComponent/ToolSelector/ToolSelect';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { useSkillManager } from '../hooks/useSkillManager';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { cardStyles } from '../../../constants';
import { defaultSkill as defaultEditSkill } from './Row';
import { useForm } from 'react-hook-form';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model';
import { SmallAddIcon } from '@chakra-ui/icons';
import { getNanoid } from '@fastgpt/global/common/string/tools';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const TTSSelect = dynamic(() => import('@/components/core/app/TTSSelect'));
const QGConfig = dynamic(() => import('@/components/core/app/QGConfig'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const InputGuideConfig = dynamic(() => import('@/components/core/app/InputGuideConfig'));
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));
const FileSelectConfig = dynamic(() => import('@/components/core/app/FileSelect'));

const EditForm = ({
  model,
  fileSelectConfig,
  defaultSkill = defaultEditSkill,
  onClose,
  setAppForm
}: {
  model: string;
  fileSelectConfig?: AppFileSelectConfigType;
  defaultSkill?: SkillEditType;
  onClose: () => void;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const [, startTst] = useTransition();

  const selectedModel = getWebLLMModel(model);

  const { register, setValue, handleSubmit, reset, watch } = useForm<SkillEditType>({
    defaultValues: defaultSkill
  });
  useEffect(() => {
    reset(defaultSkill);
  }, [defaultSkill, reset]);

  const name = watch('name');
  const prompt = watch('prompt');
  const selectedTools = watch('selectedTools');
  const selectDatasets = watch('dataset.list');

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const onSave = (e: SkillEditType) => {
    setAppForm((state) => ({
      ...state,
      skills: e.id
        ? state.skills.map((item) => (item.id === e.id ? e : item))
        : [{ ...e, id: getNanoid(6) }, ...state.skills]
    }));
    onClose();
  };

  return (
    <>
      <Box p={5}>
        {/* Header */}
        <HStack gap={4}>
          <IconButton
            variant={'whiteBase'}
            icon={<MyIcon name="common/backLight" w={'1rem'} />}
            size={'smSquare'}
            aria-label={''}
            w={'32px'}
            h={'32px'}
            onClick={onClose}
          />
          <Box color={'myGray.900'} flex={'1 0 0'} w={'0'} className={'textEllipsis'}>
            {name || t('app:skill_empty_name')}
          </Box>

          <Button variant={'primary'} onClick={handleSubmit(onSave)}>
            {t('common:Save')}
          </Button>
        </HStack>
        {/* Name */}
        <HStack mt={5}>
          <FormLabel mr={3} required>
            {t('common:Name')}
          </FormLabel>
          <Input
            {...register('name', { required: true })}
            maxLength={30}
            placeholder={t('app:skill_name_placeholder')}
          />
        </HStack>
        {/* Desc */}
        <Box mt={4}>
          <HStack>
            <FormLabel mr={1} required>
              {t('common:descripton')}
            </FormLabel>
            <QuestionTip label={t('app:skill_description_placeholder')} />
          </HStack>
          <Textarea
            rows={3}
            mt={1}
            resize={'vertical'}
            {...register('description', { required: true })}
            placeholder={t('app:skill_description_placeholder')}
          />
        </Box>
        {/* Prompt */}
        <Box mt={4}>
          <HStack w={'100%'}>
            <FormLabel>Prompt</FormLabel>
          </HStack>
          <Box mt={1}>
            <PromptEditor
              minH={100}
              maxH={300}
              value={prompt}
              onChange={(text) => {
                startTst(() => {
                  setValue('prompt', text);
                });
              }}
              isRichText={false}
            />
          </Box>
        </Box>

        {/* Tool select */}
        <Box mt={5} px={3} py={4} borderTop={'base'}>
          <ToolSelect
            selectedModel={selectedModel}
            selectedTools={selectedTools}
            fileSelectConfig={fileSelectConfig}
            onAddTool={(e) => {
              setValue('selectedTools', [e, ...(selectedTools || [])]);
            }}
            onUpdateTool={(e) => {
              setValue(
                'selectedTools',
                selectedTools?.map((item) => (item.id === e.id ? e : item)) || []
              );
            }}
            onRemoveTool={(id) => {
              setValue('selectedTools', selectedTools?.filter((item) => item.id !== id) || []);
            }}
          />
        </Box>
        {/* Dataset select */}
        <Box py={4} px={3} borderTop={'base'} borderBottom={'base'}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'} flex={1}>
              <MyIcon name={'core/app/simpleMode/dataset'} w={'20px'} />
              <FormLabel ml={2}>{t('app:dataset')}</FormLabel>
            </Flex>
            <Button
              mr={'-5px'}
              variant={'transparentBase'}
              leftIcon={<SmallAddIcon />}
              iconSpacing={1}
              size={'sm'}
              fontSize={'sm'}
              onClick={onOpenKbSelect}
            >
              {t('common:Choose')}
            </Button>
          </Flex>
          <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={[2, 4]}>
            {selectDatasets.map((item) => (
              <MyTooltip key={item.datasetId} label={t('common:core.dataset.Read Dataset')}>
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
                        datasetId: item.datasetId
                      }
                    })
                  }
                >
                  <Avatar src={item.avatar} w={'1.5rem'} borderRadius={'sm'} />
                  <Box
                    ml={2}
                    flex={'1 0 0'}
                    w={0}
                    className={'textEllipsis'}
                    fontSize={'sm'}
                    color={'myGray.900'}
                  >
                    {item.name}
                  </Box>
                </Flex>
              </MyTooltip>
            ))}
          </Grid>
        </Box>
      </Box>

      {isOpenDatasetSelect && (
        <DatasetSelectModal
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item.datasetId,
            name: item.name,
            avatar: item.avatar,
            vectorModel: item.vectorModel
          }))}
          onClose={onCloseKbSelect}
          onChange={(e) => {
            setValue('dataset.list', e);
          }}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);
