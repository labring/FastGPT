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
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/Markdown';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { Controller, useForm } from 'react-hook-form';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import InputRender from '@/components/core/app/formRender';

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
  onSubmit
}: {
  collectionForm: UserInputInteractive;
  onSubmit: (formData: string) => void;
}) {
  const { t } = useTranslation();
  const { control, handleSubmit } = useForm();

  const submitted = collectionForm.params.submitted;

  return (
    <Box>
      <Box mb={3}>{collectionForm.params.description}</Box>
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
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  return (
    <Box
      _hover={{
        '& .controler': {
          display: 'flex'
        }
      }}
    >
      <Box
        px={4}
        py={3}
        borderRadius={'sm'}
        display="inline-block"
        maxW={['calc(100% - 25px)', 'calc(100% - 40px)']}
        color={'myGray.900'}
        bg={'myGray.100'}
      >
        {chat.value.map((value, i) => {
          if ('text' in value && value.text) {
            return (
              <RenderText
                key={i}
                showAnimation={isChatting && isLastChild}
                text={value.text.content}
              />
            );
          }
          if ('reasoning' in value && value.reasoning) {
            return (
              <RenderResoningContent
                key={i}
                isChatting={isChatting}
                isLastResponseValue={isLastChild}
                content={value.reasoning.content}
              />
            );
          }
          if ('collectionForm' in value && value.collectionForm) {
            return (
              <RenderCollectionForm
                key={i}
                collectionForm={value.collectionForm}
                onSubmit={onSubmitCollectionForm}
              />
            );
          }
        })}
      </Box>
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
