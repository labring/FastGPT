import React from 'react';
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
  Textarea
} from '@chakra-ui/react';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { defaultQuotePrompt, defaultQuoteTemplate } from '@/prompts/core/AIChat';
import { feConfigs } from '@/store/static';

const AIChatSettingsModal = ({
  onClose,
  onSuccess,
  defaultData
}: {
  onClose: () => void;
  onSuccess: (e: EditFormType['chatModel']) => void;
  defaultData: EditFormType['chatModel'];
}) => {
  const { t } = useTranslation();

  const { register, handleSubmit } = useForm({
    defaultValues: defaultData
  });

  const LabelStyles: BoxProps = {
    fontWeight: 'bold',
    mb: 1,
    fontSize: ['sm', 'md']
  };

  return (
    <MyModal
      isOpen
      title={
        <Flex alignItems={'flex-end'}>
          {t('app.Quote Prompt Settings')}
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
      w={'700px'}
    >
      <ModalBody>
        <Box>
          <Box {...LabelStyles}>
            引用内容模板
            <MyTooltip
              label={t('template.Quote Content Tip', { default: defaultQuoteTemplate })}
              forceShow
            >
              <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
            </MyTooltip>
          </Box>
          <Textarea
            rows={4}
            placeholder={t('template.Quote Content Tip', { default: defaultQuoteTemplate }) || ''}
            borderColor={'myGray.100'}
            {...register('quoteTemplate')}
          />
        </Box>
        <Box mt={4}>
          <Box {...LabelStyles}>
            引用内容提示词
            <MyTooltip
              label={t('template.Quote Prompt Tip', { default: defaultQuotePrompt })}
              forceShow
            >
              <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
            </MyTooltip>
          </Box>
          <Textarea
            rows={6}
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
