import React, { useMemo, useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import {
  Box,
  BoxProps,
  Button,
  Flex,
  Image,
  Link,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea
} from '@chakra-ui/react';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Prompt_QuotePromptList, Prompt_QuoteTemplateList } from '@/global/core/prompt/AIChat';
import { chatModelList, feConfigs } from '@/web/common/system/staticData';
import MySlider from '@/components/Slider';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import dynamic from 'next/dynamic';
import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';
import type { AIChatModuleProps } from '@fastgpt/global/core/module/node/type.d';
import type { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type.d';
import { SimpleModeTemplate_FastGPT_Universal } from '@/global/core/app/constants';
import { getDocPath } from '@/web/common/system/doc';
import PromptTextarea from '@/components/common/Textarea/PromptTextarea';

const PromptTemplate = dynamic(() => import('@/components/PromptTemplate'));

const AIChatSettingsModal = ({
  isAdEdit,
  onClose,
  onSuccess,
  defaultData,
  simpleModeTemplate = SimpleModeTemplate_FastGPT_Universal
}: {
  isAdEdit?: boolean;
  onClose: () => void;
  onSuccess: (e: AIChatModuleProps) => void;
  defaultData: AIChatModuleProps;
  simpleModeTemplate?: AppSimpleEditConfigTemplateType;
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);

  const { register, handleSubmit, getValues, setValue } = useForm({
    defaultValues: defaultData
  });

  const [selectTemplateData, setSelectTemplateData] = useState<{
    title: string;
    templates: PromptTemplateItem[];
  }>();

  const tokenLimit = useMemo(() => {
    return (
      chatModelList.find((item) => item.model === getValues(ModuleInputKeyEnum.aiModel))
        ?.maxResponse || 4000
    );
  }, [getValues, refresh]);

  const LabelStyles: BoxProps = {
    fontSize: ['sm', 'md']
  };
  const selectTemplateBtn: BoxProps = {
    color: 'primary.500',
    cursor: 'pointer'
  };

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/module/AI.png"
      title={
        <>
          {t('app.AI Advanced Settings')}
          {feConfigs?.docUrl && (
            <Link
              href={getDocPath('/docs/use-cases/ai_settings/')}
              target={'_blank'}
              ml={1}
              textDecoration={'underline'}
              fontWeight={'normal'}
              fontSize={'md'}
            >
              查看说明
            </Link>
          )}
        </>
      }
      isCentered
      w={'700px'}
      h={['90vh', 'auto']}
    >
      <ModalBody flex={['1 0 0', 'auto']} overflowY={'auto'} minH={'40vh'}>
        {isAdEdit && (
          <Flex alignItems={'center'}>
            <Box {...LabelStyles} w={'80px'}>
              返回AI内容
            </Box>
            <Box flex={1} ml={'10px'}>
              <Switch
                isChecked={getValues(ModuleInputKeyEnum.aiChatIsResponseText)}
                size={'lg'}
                onChange={(e) => {
                  const value = e.target.checked;
                  setValue(ModuleInputKeyEnum.aiChatIsResponseText, value);
                  setRefresh((state) => !state);
                }}
              />
            </Box>
          </Flex>
        )}
        {simpleModeTemplate?.systemForm?.aiSettings?.temperature && (
          <Flex alignItems={'center'} mb={10} mt={isAdEdit ? 8 : 5}>
            <Box {...LabelStyles} mr={2} w={'80px'}>
              温度
            </Box>
            <Box flex={1} ml={'10px'}>
              <MySlider
                markList={[
                  { label: '严谨', value: 0 },
                  { label: '发散', value: 10 }
                ]}
                width={'95%'}
                min={0}
                max={10}
                value={getValues(ModuleInputKeyEnum.aiChatTemperature)}
                onChange={(e) => {
                  setValue(ModuleInputKeyEnum.aiChatTemperature, e);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Flex>
        )}
        {simpleModeTemplate?.systemForm?.aiSettings?.maxToken && (
          <Flex alignItems={'center'} mt={12} mb={10}>
            <Box {...LabelStyles} mr={2} w={'80px'}>
              回复上限
            </Box>
            <Box flex={1} ml={'10px'}>
              <MySlider
                markList={[
                  { label: '100', value: 100 },
                  { label: `${tokenLimit}`, value: tokenLimit }
                ]}
                width={'95%'}
                min={100}
                max={tokenLimit}
                step={50}
                value={getValues(ModuleInputKeyEnum.aiChatMaxToken)}
                onChange={(val) => {
                  setValue(ModuleInputKeyEnum.aiChatMaxToken, val);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Flex>
        )}

        {simpleModeTemplate?.systemForm?.aiSettings?.quoteTemplate && (
          <Box>
            <Flex {...LabelStyles} mb={1}>
              引用内容模板
              <MyTooltip
                label={t('template.Quote Content Tip', {
                  default: Prompt_QuoteTemplateList[0].value
                })}
                forceShow
              >
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
              <Box flex={1} />
              <Box
                {...selectTemplateBtn}
                onClick={() =>
                  setSelectTemplateData({
                    title: '选择知识库提示词模板',
                    templates: Prompt_QuoteTemplateList
                  })
                }
              >
                选择模板
              </Box>
            </Flex>

            <PromptTextarea
              bg={'myWhite.400'}
              rows={8}
              placeholder={t('template.Quote Content Tip', {
                default: Prompt_QuoteTemplateList[0].value
              })}
              defaultValue={getValues(ModuleInputKeyEnum.aiChatQuoteTemplate)}
              onBlur={(e) => {
                setValue(ModuleInputKeyEnum.aiChatQuoteTemplate, e.target.value);
                setRefresh(!refresh);
              }}
            />
          </Box>
        )}
        {simpleModeTemplate?.systemForm?.aiSettings?.quotePrompt && (
          <Box mt={4}>
            <Flex {...LabelStyles} mb={1}>
              引用内容提示词
              <MyTooltip
                label={t('template.Quote Prompt Tip', { default: Prompt_QuotePromptList[0].value })}
                forceShow
              >
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
            </Flex>
            <PromptTextarea
              bg={'myWhite.400'}
              rows={11}
              placeholder={t('template.Quote Prompt Tip', {
                default: Prompt_QuotePromptList[0].value
              })}
              defaultValue={getValues(ModuleInputKeyEnum.aiChatQuotePrompt)}
              onBlur={(e) => {
                setValue(ModuleInputKeyEnum.aiChatQuotePrompt, e.target.value);
                setRefresh(!refresh);
              }}
            />
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button ml={4} onClick={handleSubmit(onSuccess)}>
          {t('Confirm')}
        </Button>
      </ModalFooter>
      {!!selectTemplateData && (
        <PromptTemplate
          title={selectTemplateData.title}
          templates={selectTemplateData.templates}
          onClose={() => setSelectTemplateData(undefined)}
          onSuccess={(e) => {
            const quoteVal = e.value;
            const promptVal = Prompt_QuotePromptList.find((item) => item.title === e.title)?.value;
            setValue(ModuleInputKeyEnum.aiChatQuoteTemplate, quoteVal);
            setValue(ModuleInputKeyEnum.aiChatQuotePrompt, promptVal);
          }}
        />
      )}
    </MyModal>
  );
};

export default AIChatSettingsModal;
