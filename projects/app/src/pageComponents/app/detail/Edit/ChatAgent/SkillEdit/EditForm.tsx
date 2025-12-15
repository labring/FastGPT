import React from 'react';
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

import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../../FormComponent/ToolSelector/ToolSelect';
import { SmallAddIcon } from '@chakra-ui/icons';
import { updateGeneratedSkill } from '@/components/core/chat/HelperBot/generatedSkill/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const TTSSelect = dynamic(() => import('@/components/core/app/TTSSelect'));
const QGConfig = dynamic(() => import('@/components/core/app/QGConfig'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const InputGuideConfig = dynamic(() => import('@/components/core/app/InputGuideConfig'));
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));
const FileSelectConfig = dynamic(() => import('@/components/core/app/FileSelect'));

type EditFormProps = {
  model: string;
  fileSelectConfig?: AppFileSelectConfigType;
  skill: SkillEditType;
  onFieldChange: (updates: Partial<SkillEditType>) => void;
  onClose: () => void;
  onSave: (skill: SkillEditType) => void;
};

const EditForm = ({
  model,
  fileSelectConfig,
  skill,
  onFieldChange,
  onClose,
  onSave
}: EditFormProps) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const appId = useContextSelector(AppContext, (v) => v.appId);

  const selectedModel = getWebLLMModel(model);
  const selectDatasets = skill.dataset?.list || [];
  const selectedTools = skill.selectedTools || [];

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const handleSave = async () => {
    try {
      let dbId = skill.dbId;

      const result = await updateGeneratedSkill({
        ...(dbId ? { id: dbId } : { appId, chatId: 'temp-chat-id', chatItemId: 'temp-item-id' }),
        name: skill.name,
        description: skill.description || '',
        steps: skill.stepsText || '',
        status: 'active'
      });

      if (!dbId) {
        dbId = result._id;
      }

      onSave({ ...skill, dbId });

      toast({
        title: dbId ? '技能更新成功' : '技能保存成功',
        status: 'success'
      });
    } catch (error) {
      console.error('保存失败:', error);
      toast({
        title: '保存失败',
        status: 'error'
      });
    }
  };

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
            onClick={onClose}
          />
          <Box color={'myGray.900'} flex={'1 0 0'} w={'0'} className={'textEllipsis'}>
            {skill.name || t('app:skill_empty_name')}
          </Box>

          <Button
            variant={'primaryOutline'}
            size={'sm'}
            leftIcon={<MyIcon name="save" w={'1rem'} />}
            onClick={handleSave}
          >
            {t('common:Save')}
          </Button>
        </HStack>
        {/* Name */}
        <HStack mt={5}>
          <FormLabel mr={3} required>
            {t('common:Name')}
          </FormLabel>
          <Input
            value={skill.name}
            onChange={(e) => onFieldChange({ name: e.target.value })}
            bg={'myGray.50'}
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
            value={skill.description}
            onChange={(e) => onFieldChange({ description: e.target.value })}
            bg={'myGray.50'}
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
              value={skill.stepsText || ''}
              onChange={(e) => onFieldChange({ stepsText: e.target.value })}
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
              onFieldChange({
                selectedTools: [e, ...(selectedTools || [])]
              });
            }}
            onUpdateTool={(e) => {
              onFieldChange({
                selectedTools: selectedTools?.map((item) => (item.id === e.id ? e : item)) || []
              });
            }}
            onRemoveTool={(id) => {
              onFieldChange({
                selectedTools: selectedTools?.filter((item) => item.id !== id) || []
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
            onFieldChange({
              dataset: { list: e }
            });
          }}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);
