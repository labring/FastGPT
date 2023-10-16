import React, { useMemo, useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'react-i18next';
import { EditFormType } from '@/utils/app';
import { useForm } from 'react-hook-form';
import {
  Box,
  BoxProps,
  Button,
  Flex,
  Link,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea
} from '@chakra-ui/react';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { defaultQuotePrompt, defaultQuoteTemplate } from '@/global/core/prompt/AIChat';
import { chatModelList, feConfigs } from '@/web/common/store/static';
import MySlider from '@/components/Slider';
import { SystemInputEnum } from '@/constants/app';

const AIChatSettingsModal = ({
  isAdEdit,
  onClose,
  onSuccess,
  defaultData
}: {
  isAdEdit?: boolean;
  onClose: () => void;
  onSuccess: (e: EditFormType['chatModel']) => void;
  defaultData: EditFormType['chatModel'];
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);

  const { register, handleSubmit, getValues, setValue } = useForm({
    defaultValues: defaultData
  });

  const tokenLimit = useMemo(() => {
    return chatModelList.find((item) => item.model === getValues('model'))?.contextMaxToken || 4000;
  }, [getValues, refresh]);

  const LabelStyles: BoxProps = {
    whiteSpace: 'nowrap',
    w: '80px',
    fontSize: ['sm', 'md']
  };

  return (
    <MyModal
      isOpen
      title={
        <Flex alignItems={'flex-end'}>
          {t('app.AI Settings')}
          {feConfigs?.show_doc && (
            <Link
              href={'https://doc.fastgpt.run/docs/use-cases/prompt/'}
              target={'_blank'}
              ml={1}
              textDecoration={'underline'}
              fontWeight={'normal'}
              fontSize={'md'}
            >
              查看说明
            </Link>
          )}
        </Flex>
      }
      isCentered
      w={'700px'}
      h={['90vh', 'auto']}
    >
      <ModalBody flex={['1 0 0', 'auto']} overflowY={'auto'}>
        {isAdEdit && (
          <Flex alignItems={'center'}>
            <Box {...LabelStyles}>返回AI内容</Box>
            <Box flex={1} ml={'10px'}>
              <Switch
                isChecked={getValues(SystemInputEnum.isResponseAnswerText)}
                size={'lg'}
                onChange={(e) => {
                  const value = e.target.checked;
                  setValue(SystemInputEnum.isResponseAnswerText, value);
                  setRefresh((state) => !state);
                }}
              />
            </Box>
          </Flex>
        )}
        <Flex alignItems={'center'} mb={10} mt={isAdEdit ? 8 : 5}>
          <Box {...LabelStyles} mr={2}>
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
              value={getValues('temperature')}
              onChange={(e) => {
                setValue('temperature', e);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} mt={12} mb={10}>
          <Box {...LabelStyles} mr={2}>
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
              value={getValues('maxToken')}
              onChange={(val) => {
                setValue('maxToken', val);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Box>
          <Box {...LabelStyles} mb={1}>
            引用内容模板
            <MyTooltip
              label={t('template.Quote Content Tip', { default: defaultQuoteTemplate })}
              forceShow
            >
              <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
            </MyTooltip>
          </Box>
          <Textarea
            rows={6}
            placeholder={t('template.Quote Content Tip', { default: defaultQuoteTemplate }) || ''}
            borderColor={'myGray.100'}
            {...register('quoteTemplate')}
          />
        </Box>
        <Box mt={4}>
          <Box {...LabelStyles} mb={1}>
            引用内容提示词
            <MyTooltip
              label={t('template.Quote Prompt Tip', { default: defaultQuotePrompt })}
              forceShow
            >
              <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
            </MyTooltip>
          </Box>
          <Textarea
            rows={11}
            placeholder={t('template.Quote Prompt Tip', { default: defaultQuotePrompt }) || ''}
            borderColor={'myGray.100'}
            {...register('quotePrompt')}
          />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'base'} onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button ml={4} onClick={handleSubmit(onSuccess)}>
          {t('Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default AIChatSettingsModal;
