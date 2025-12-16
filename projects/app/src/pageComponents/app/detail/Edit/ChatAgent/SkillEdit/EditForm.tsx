import React, { useEffect } from 'react';
import {
  Box,
  Flex,
  Grid,
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
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';

import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../../FormComponent/ToolSelector/ToolSelect';
import { SmallAddIcon } from '@chakra-ui/icons';
import { updateAiSkill } from '@/web/core/ai/skill/api';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

type EditFormProps = {
  model: string;
  fileSelectConfig?: AppFileSelectConfigType;
  skill: SkillEditType;
  onClose: () => void;
  onSave: (skill: SkillEditType) => void;
};

const EditForm = ({ model, fileSelectConfig, skill, onClose, onSave }: EditFormProps) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const appId = useContextSelector(AppContext, (v) => v.appId);

  // Form state management with validation
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isDirty }
  } = useForm<SkillEditType>({
    defaultValues: skill
  });

  // Reset form when skill prop changes
  useEffect(() => {
    reset(skill);
  }, [skill, reset]);

  const selectedModel = getWebLLMModel(model);
  const selectedTools = watch('selectedTools') || [];
  const selectDatasets = watch('dataset.list') || [];
  const skillName = watch('name');

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('common:confirm_exit_without_saving')
  });

  const { runAsync: onSubmit, loading: isSaving } = useRequest2(
    async (formData: SkillEditType) => {
      const result = await updateAiSkill({
        id: formData.id,
        appId,
        name: formData.name,
        description: formData.description || '',
        steps: formData.stepsText || '',
        tools: (formData.selectedTools || []).map((item) => ({
          id: item.pluginId!,
          // 遍历 tool 的 inputs，转成 object
          config: item.inputs?.reduce(
            (acc, input) => {
              acc[input.key] = input.value;
              return acc;
            },
            {} as Record<string, any>
          )
        })),
        datasets: (formData.dataset?.list || []).map((item) => ({
          datasetId: item.datasetId,
          name: item.name,
          avatar: item.avatar,
          vectorModel: item.vectorModel
        }))
      });

      onSave({ ...formData, id: result });
    },
    {
      manual: true,
      successToast: t('common:save_success')
    }
  );

  const handleFormSubmit = handleSubmit(onSubmit);

  return (
    <>
      <Box p={5}>
        {/* Header */}
        <HStack gap={4}>
          <IconButton
            variant={'whiteBase'}
            icon={<MyIcon name="common/backLight" w={'1rem'} />}
            size={'xsSquare'}
            aria-label={''}
            w={'28px'}
            h={'28px'}
            onClick={() => {
              if (isDirty) {
                openConfirm(() => {
                  onClose();
                })();
              } else {
                onClose();
              }
            }}
          />
          <Box color={'myGray.900'} flex={'1 0 0'} w={'0'} className={'textEllipsis'}>
            {skillName || t('app:skill_empty_name')}
          </Box>

          <Button
            variant={'primaryOutline'}
            size={'sm'}
            leftIcon={<MyIcon name="save" w={'1rem'} />}
            onClick={handleFormSubmit}
            isLoading={isSaving}
          >
            {t('common:Save')}
          </Button>
        </HStack>
        {/* Name */}
        <HStack mt={5}>
          <FormLabel mr={3} required>
            {t('common:Name')}
          </FormLabel>
          <Box flex={1}>
            <Input
              {...register('name', {
                required: true
              })}
              bg={'myGray.50'}
              maxLength={50}
              placeholder={t('app:skill_name_placeholder')}
            />
          </Box>
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
            {...register('description', {
              required: true
            })}
            bg={'myGray.50'}
            maxLength={10000}
            rows={3}
            mt={1}
            resize={'vertical'}
            placeholder={t('app:skill_description_placeholder')}
          />
        </Box>
        {/* Steps */}
        <Box mt={4}>
          <HStack w={'100%'}>
            <FormLabel>{t('app:execution_steps')}</FormLabel>
          </HStack>
          <Box mt={2}>
            <Textarea
              {...register('stepsText')}
              maxLength={1000000}
              bg={'myGray.50'}
              rows={10}
              resize={'vertical'}
              placeholder={t('app:no_steps_yet')}
              fontSize={'sm'}
              color={'myGray.900'}
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
              setValue('selectedTools', [e, ...(selectedTools || [])], { shouldDirty: true });
            }}
            onUpdateTool={(e) => {
              setValue(
                'selectedTools',
                selectedTools?.map((item) => (item.id === e.id ? e : item)) || [],
                { shouldDirty: true }
              );
            }}
            onRemoveTool={(id) => {
              setValue('selectedTools', selectedTools?.filter((item) => item.id !== id) || [], {
                shouldDirty: true
              });
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
            setValue('dataset.list', e, { shouldDirty: true });
          }}
        />
      )}

      <ConfirmModal />
    </>
  );
};

export default React.memo(EditForm);
