import React, { useRef } from 'react';
import { Box, Button, Flex, Text, Textarea } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'next-i18next';
import { updateChatUserFeedback } from '@/web/core/chat/feedback/api';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import FeedbackDrawer from './FeedbackDrawer';

type FeedbackContentProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
  title: string;
  placeholder: string;
  submitText: string;
  closeText: string;
  titleFontSize: string;
  titleLineHeight: string;
  gap: string;
  textareaHeight: string;
  titleProps?: React.ComponentProps<typeof Text>;
  showCloseButton?: boolean;
  submitFullWidth?: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

/**
 * 点踩反馈弹窗内容。桌面 Modal 和移动端 Drawer 共用提交控件，
 * 只通过布局参数区分不同端的标题、间距和 textarea 尺寸。
 */
const FeedbackContent = ({
  textareaRef,
  isLoading,
  title,
  placeholder,
  submitText,
  closeText,
  titleFontSize,
  titleLineHeight,
  gap,
  textareaHeight,
  titleProps,
  showCloseButton = true,
  submitFullWidth = false,
  onClose,
  onSubmit
}: FeedbackContentProps) => {
  return (
    <Box display={'flex'} flexDirection={'column'} gap={gap}>
      <Text
        fontSize={titleFontSize}
        fontWeight={500}
        lineHeight={titleLineHeight}
        color={'myGray.900'}
        {...titleProps}
      >
        {title}
      </Text>
      <Textarea
        ref={textareaRef}
        h={textareaHeight}
        minH={textareaHeight}
        py={'8px'}
        px={'12px'}
        resize={'none'}
        placeholder={placeholder}
      />
      <Flex justifyContent={'flex-end'} gap={2}>
        {showCloseButton && (
          <Button variant={'whiteBase'} onClick={onClose}>
            {closeText}
          </Button>
        )}
        <Button w={submitFullWidth ? '100%' : 'auto'} isLoading={isLoading} onClick={onSubmit}>
          {submitText}
        </Button>
      </Flex>
    </Box>
  );
};

const FeedbackModal = ({
  appId,
  chatId,
  dataId,
  onSuccess,
  onClose
}: {
  appId: string;
  chatId: string;
  dataId: string;
  onSuccess: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  const { runAsync, loading: isLoading } = useRequest(
    async () => {
      const val = ref.current?.value || t('common:core.chat.feedback.No Content');
      return updateChatUserFeedback({
        appId,
        chatId,
        dataId,
        userBadFeedback: val,
        ...outLinkAuthData
      });
    },
    {
      onSuccess() {
        onSuccess(ref.current?.value || t('common:core.chat.feedback.No Content'));
      },
      successToast: t('common:core.chat.Feedback Success'),
      errorToast: t('common:core.chat.Feedback Failed')
    }
  );

  const contentText = {
    title: t('common:core.chat.Feedback Modal'),
    placeholder: t('common:core.chat.Feedback Modal Tip'),
    submitText: t('common:core.chat.Feedback Submit'),
    closeText: t('common:Close')
  };

  if (!isPc) {
    return (
      <FeedbackDrawer onClose={onClose}>
        <FeedbackContent
          textareaRef={ref}
          isLoading={isLoading}
          {...contentText}
          titleFontSize={'16px'}
          titleLineHeight={'20px'}
          gap={'12px'}
          textareaHeight={'110px'}
          titleProps={{ textAlign: 'center', h: '24px', lineHeight: '24px' }}
          showCloseButton={false}
          submitFullWidth
          onClose={onClose}
          onSubmit={runAsync}
        />
      </FeedbackDrawer>
    );
  }

  return (
    <MyModal isOpen onClose={onClose} w={'560px'} maxW={'560px'} minW={'560px'} minH={'214px'}>
      <Box p={'32px'} display={'flex'} flexDirection={'column'} gap={'24px'}>
        <FeedbackContent
          textareaRef={ref}
          isLoading={isLoading}
          {...contentText}
          titleFontSize={'20px'}
          titleLineHeight={'25px'}
          gap={'24px'}
          textareaHeight={'110px'}
          onClose={onClose}
          onSubmit={runAsync}
        />
      </Box>
    </MyModal>
  );
};

export default FeedbackModal;
