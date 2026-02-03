import React, { useMemo } from 'react';
import type { HelperBotChatItemSiteType } from '@fastgpt/global/core/chat/helperBot/type';
import {
  Box,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Flex,
  HStack,
  Button
} from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/Markdown';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/helperBot/type';
import { Controller, useForm } from 'react-hook-form';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import InputRender from '@/components/core/app/formRender';
import ChatAvatar from '@/components/core/chat/ChatContainer/ChatBox/components/ChatAvatar';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const isTextValue = (value: unknown): value is { text: { content: string } } =>
  !!value && typeof value === 'object' && 'text' in value;
const isReasoningValue = (value: unknown): value is { reasoning: { content: string } } =>
  !!value && typeof value === 'object' && 'reasoning' in value;
const isCollectionFormValue = (value: unknown): value is { collectionForm: UserInputInteractive } =>
  !!value && typeof value === 'object' && 'collectionForm' in value;
const isPlanHintValue = (value: unknown): value is { planHint: { type: 'generation' } } =>
  !!value && typeof value === 'object' && 'planHint' in value;

const waitingDot = keyframes`
  0% { opacity: 0.2; }
  20% { opacity: 1; }
  100% { opacity: 0.2; }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

const accordionButtonStyle = {
  w: 'auto',
  bg: 'white',
  borderRadius: 'md',
  borderWidth: '1px',
  borderColor: 'myGray.200',
  boxShadow: '1',
  pl: 3,
  pr: 2.5,
  _hover: {
    bg: 'auto'
  }
};
const RenderResoningContent = React.memo(function RenderResoningContent({
  content,
  isChatting,
  isLastResponseValue
}: {
  content: string;
  isChatting: boolean;
  isLastResponseValue: boolean;
}) {
  const { t } = useTranslation();
  const showAnimation = isChatting && isLastResponseValue;

  return (
    <Accordion allowToggle defaultIndex={isLastResponseValue ? 0 : undefined}>
      <AccordionItem borderTop={'none'} borderBottom={'none'}>
        <AccordionButton {...accordionButtonStyle} py={1}>
          <HStack mr={2} spacing={1}>
            <MyIcon name={'core/chat/think'} w={'0.85rem'} />
            <Box fontSize={'sm'}>{t('chat:ai_reasoning')}</Box>
          </HStack>

          {showAnimation && <MyIcon name={'common/loading'} w={'0.85rem'} />}
          <AccordionIcon color={'myGray.600'} ml={5} />
        </AccordionButton>
        <AccordionPanel
          py={0}
          pr={0}
          pl={3}
          mt={2}
          borderLeft={'2px solid'}
          borderColor={'myGray.300'}
          color={'myGray.500'}
        >
          <Markdown source={content} showAnimation={showAnimation} />
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});
const RenderText = React.memo(function RenderText({
  showAnimation,
  text
}: {
  showAnimation: boolean;
  text: string;
}) {
  const source = useMemo(() => {
    if (!text) return '';

    // Remove quote references if not showing response detail
    return text;
  }, [text]);

  return <Markdown source={source} showAnimation={showAnimation} />;
});
const RenderCollectionForm = React.memo(function RenderCollectionForm({
  collectionForm,
  onSubmit,
  showDescription = true
}: {
  collectionForm: UserInputInteractive;
  onSubmit: (formData: string) => void;
  showDescription?: boolean;
}) {
  const { t } = useTranslation();
  const { control, handleSubmit } = useForm();

  const submitted = collectionForm.params.submitted;

  return (
    <Box>
      {showDescription && <Box mb={3}>{collectionForm.params.description}</Box>}
      <Flex flexDirection={'column'} gap={3}>
        {collectionForm.params.inputForm.map((input) => {
          const inputType = nodeInputTypeToInputType([input.type]);

          return (
            <Controller
              key={input.key}
              control={control}
              name={input.key}
              render={({ field: { onChange, value }, fieldState: { error } }) => {
                return (
                  <Box>
                    <FormLabel whiteSpace={'pre-wrap'} mb={0.5}>
                      {input.label}
                    </FormLabel>
                    <InputRender
                      {...input}
                      inputType={inputType}
                      value={value}
                      onChange={onChange}
                      isDisabled={submitted}
                      isInvalid={!!error}
                      isRichText={false}
                    />
                  </Box>
                );
              }}
            />
          );
        })}
      </Flex>

      {!submitted && (
        <Flex justifyContent={'flex-end'} mt={4}>
          <Button
            size={'sm'}
            onClick={handleSubmit((data) => {
              // 需要把 label 作为 key
              const dataByLabel = Object.fromEntries(
                collectionForm.params.inputForm.map((input) => [input.label, data[input.key]])
              );
              onSubmit(JSON.stringify(dataByLabel));
            })}
          >
            {t('common:Submit')}
          </Button>
        </Flex>
      )}
    </Box>
  );
});

const AIItem = ({
  chat,
  isChatting,
  isLastChild,
  onSubmitCollectionForm
}: {
  chat: HelperBotChatItemSiteType;
  isChatting: boolean;
  isLastChild: boolean;
  onSubmitCollectionForm: (formData: string) => void;
}) => {
  const aiAvatar = getWebReqUrl('/imgs/bot.svg');
  const hasPlanHint = chat.value.some((value) => isPlanHintValue(value));
  const hasCollectionForm = chat.value.some((value) => isCollectionFormValue(value));
  const questionText = chat.value.find((value) => isTextValue(value))?.text?.content;
  const fallbackQuestion = chat.value.find((value) => isCollectionFormValue(value))?.collectionForm
    ?.params?.description;
  const hasTextContent = chat.value.some(
    (value) => isTextValue(value) && value.text?.content?.trim()
  );
  const hasReasoningContent = chat.value.some(
    (value) => isReasoningValue(value) && value.reasoning?.content?.trim()
  );
  const hasRenderableContent = hasTextContent || hasReasoningContent || hasCollectionForm;
  const shouldShowWaiting =
    !hasPlanHint && !hasCollectionForm && isChatting && isLastChild && !hasRenderableContent;
  const shouldShowQuestion =
    !hasPlanHint && hasCollectionForm && !hasTextContent && !hasReasoningContent;

  return (
    <Box
      _hover={{
        '& .controler': {
          display: 'flex'
        }
      }}
    >
      <Flex alignItems={'flex-start'} justifyContent={'flex-start'} gap={2} w={'100%'}>
        <ChatAvatar type={ChatRoleEnum.AI} src={aiAvatar} />
        <Box
          px={4}
          py={3}
          borderRadius={'sm'}
          display="inline-block"
          maxW={['calc(100% - 25px)', 'calc(100% - 40px)']}
          color={'myGray.900'}
          bg={'myGray.100'}
        >
          {hasPlanHint && (
            <Box color={'myGray.500'} fontSize={'sm'}>
              规划已生成，您可继续对话来微调当前规划
            </Box>
          )}
          {shouldShowWaiting && (
            <Flex alignItems={'center'} gap={2} color={'myGray.500'} fontSize={'sm'}>
              <Box
                w={'6px'}
                h={'6px'}
                borderRadius={'full'}
                bg={'green.500'}
                animation={`${blink} 1.5s infinite`}
              />
              <Box>
                正在回答请稍后
                <Box as="span" animation={`${waitingDot} 1.2s infinite`}>
                  .
                </Box>
                <Box as="span" animation={`${waitingDot} 1.2s 0.2s infinite`}>
                  .
                </Box>
                <Box as="span" animation={`${waitingDot} 1.2s 0.4s infinite`}>
                  .
                </Box>
              </Box>
            </Flex>
          )}
          {shouldShowQuestion && (questionText || fallbackQuestion) && (
            <Box
              px={3}
              py={2}
              borderRadius={'md'}
              bg={'myGray.50'}
              color={'myGray.700'}
              fontSize={'sm'}
              display={'inline-block'}
            >
              {questionText || fallbackQuestion}
            </Box>
          )}
          {!hasPlanHint &&
            hasRenderableContent &&
            chat.value.map((value, i) => {
              if (isTextValue(value)) {
                return (
                  <RenderText
                    key={i}
                    showAnimation={isChatting && isLastChild}
                    text={value.text.content}
                  />
                );
              }
              if (isReasoningValue(value)) {
                return (
                  <RenderResoningContent
                    key={i}
                    isChatting={isChatting}
                    isLastResponseValue={isLastChild}
                    content={value.reasoning.content}
                  />
                );
              }
              if (isCollectionFormValue(value)) {
                return (
                  <RenderCollectionForm
                    key={i}
                    collectionForm={value.collectionForm}
                    onSubmit={onSubmitCollectionForm}
                    showDescription={!shouldShowQuestion}
                  />
                );
              }
            })}
        </Box>
      </Flex>
      {/* Controller */}
      <Flex h={'26px'} mt={1}>
        {/* <Flex className="controler" display={['flex', 'none']} alignItems={'center'} gap={1}>
          <MyTooltip label={t('common:Copy')}>
            <MyIconButton
              icon="copy"
              color={'myGray.500'}
              onClick={() => {
                const text = chat.value
                  .map((value) => {
                    if ('text' in value) {
                      return value.text || '';
                    }
                    return '';
                  })
                  .join('');
                return copyData(text ?? '');
              }}
            />
          </MyTooltip>
          <MyTooltip label={t('common:Delete')}>
            <MyIconButton
              icon="delete"
              color={'myGray.500'}
              hoverColor={'red.600'}
              hoverBg={'red.50'}
              // onClick={() => copyData(text ?? '')}
            />
          </MyTooltip>
        </Flex> */}
      </Flex>
    </Box>
  );
};

export default AIItem;
