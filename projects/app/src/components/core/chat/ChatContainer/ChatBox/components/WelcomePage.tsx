import Markdown from '@/components/Markdown';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React, { useEffect, useMemo } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { Box, Button, Card, Flex, Switch, Textarea, Text } from '@chakra-ui/react';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { type ChatBoxInputFormType } from '../type.d';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { type VariableItemType } from '@fastgpt/global/core/app/type';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatBoxContext } from '../Provider';
import dynamic from 'next/dynamic';

const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));
type WelcomePageProps = {
  welcomeText: string;
  chatStarted: boolean;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  showExternalVariables: boolean;
};

export const VariableInputItem = ({
  item,
  variablesForm
}: {
  item: VariableItemType;
  variablesForm: UseFormReturn<any>;
}) => {
  const {
    control,
    setValue,
    formState: { errors }
  } = variablesForm;

  return (
    <Box key={item.id} mb={4} pl={1}>
      <Box
        as={'label'}
        display={'flex'}
        position={'relative'}
        mb={1}
        alignItems={'center'}
        w={'full'}
      >
        {item.label}
        {item.required && (
          <Box position={'absolute'} top={'-2px'} left={'-8px'} color={'red.500'}>
            *
          </Box>
        )}
        {item.description && <QuestionTip ml={1} label={item.description} />}
      </Box>

      <Controller
        key={`variables.${item.key}`}
        control={control}
        name={`variables.${item.key}`}
        rules={{
          required: item.required
        }}
        render={({ field: { onChange, value } }) => {
          if (item.type === VariableInputEnum.input) {
            return (
              <MyTextarea
                autoHeight
                minH={40}
                maxH={160}
                bg={'myGray.50'}
                value={value}
                isInvalid={errors?.variables && Object.keys(errors.variables).includes(item.key)}
                onChange={onChange}
              />
            );
          }
          if (item.type === VariableInputEnum.select) {
            return (
              <MySelect
                width={'100%'}
                list={(item.enums || []).map((item: { value: any }) => ({
                  label: item.value,
                  value: item.value
                }))}
                value={value}
                onChange={(e) => setValue(`variables.${item.key}`, e)}
              />
            );
          }
          if (item.type === VariableInputEnum.numberInput) {
            return (
              <MyNumberInput
                step={1}
                min={item.min}
                max={item.max}
                bg={'white'}
                value={value}
                onChange={onChange}
                isInvalid={errors?.variables && Object.keys(errors.variables).includes(item.key)}
              />
            );
          }
          return (
            <Textarea
              value={value}
              onChange={onChange}
              rows={5}
              bg={'myGray.50'}
              maxLength={item.maxLength || 4000}
            />
          );
        }}
      />
    </Box>
  );
};

export const ExternalVariableInputItem = ({
  item,
  variablesForm,
  showTag = false
}: {
  item: VariableItemType;
  variablesForm: UseFormReturn<any>;
  showTag?: boolean;
}) => {
  const { t } = useTranslation();
  const { control } = variablesForm;

  const Label = useMemo(() => {
    return (
      <Box display={'flex'} position={'relative'} mb={1} alignItems={'center'} w={'full'}>
        {item.label}
        {item.description && <QuestionTip ml={1} label={item.description} />}
        {showTag && (
          <Flex
            color={'primary.600'}
            bg={'primary.100'}
            px={2}
            py={1}
            gap={1}
            ml={2}
            fontSize={'mini'}
            rounded={'sm'}
          >
            <MyIcon name={'common/info'} color={'primary.600'} w={4} />
            {t('chat:variable_invisable_in_share')}
          </Flex>
        )}
      </Box>
    );
  }, [item.description, item.label, showTag, t]);

  return (
    <Box key={item.id} mb={4} pl={1}>
      {Label}
      <Controller
        key={`variables.${item.key}`}
        control={control}
        name={`variables.${item.key}`}
        render={({ field: { onChange, value } }) => {
          if (item.valueType === WorkflowIOValueTypeEnum.string) {
            return (
              <MyTextarea
                autoHeight
                minH={40}
                maxH={160}
                bg={'myGray.50'}
                value={value}
                onChange={onChange}
              />
            );
          }
          if (item.valueType === WorkflowIOValueTypeEnum.number) {
            return <MyNumberInput step={1} bg={'myGray.50'} value={value} onChange={onChange} />;
          }
          if (item.valueType === WorkflowIOValueTypeEnum.boolean) {
            return <Switch isChecked={value} onChange={onChange} />;
          }
          return <JsonEditor bg={'myGray.50'} resize value={value} onChange={onChange} />;
        }}
      />
    </Box>
  );
};

const VariableInput = ({
  chatForm,
  chatStarted,
  showExternalVariables = false
}: {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatStarted: boolean;
  showExternalVariables?: boolean;
}) => {
  const { t } = useTranslation();

  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const allVariableList = useContextSelector(ChatBoxContext, (v) => v.allVariableList);

  const externalVariableList = useMemo(
    () =>
      allVariableList.filter((item) =>
        showExternalVariables ? item.type === VariableInputEnum.custom : false
      ),
    [allVariableList, showExternalVariables]
  );

  const { getValues, setValue, handleSubmit: handleSubmitChat } = variablesForm;

  useEffect(() => {
    allVariableList.forEach((item) => {
      const val = getValues(`variables.${item.key}`);
      if (item.defaultValue !== undefined && (val === undefined || val === null || val === '')) {
        setValue(`variables.${item.key}`, item.defaultValue);
      }
    });
  }, [allVariableList, getValues, setValue, variableList]);

  return (
    <Box py={3}>
      {externalVariableList.length > 0 && (
        <Box textAlign={'left'}>
          <Card
            order={2}
            mt={2}
            w={'400px'}
            {...MessageCardStyle}
            bg={'white'}
            boxShadow={'0 0 8px rgba(0,0,0,0.15)'}
          >
            <Flex
              color={'primary.600'}
              bg={'primary.100'}
              mb={3}
              px={3}
              py={1.5}
              gap={1}
              fontSize={'mini'}
              rounded={'sm'}
            >
              <MyIcon name={'common/info'} color={'primary.600'} w={4} />
              {t('chat:variable_invisable_in_share')}
            </Flex>
            {externalVariableList.map((item) => (
              <ExternalVariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
            ))}
            {variableList.length === 0 && !chatStarted && (
              <Box>
                <Button
                  leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                  size={'sm'}
                  maxW={'100px'}
                  onClick={handleSubmitChat(() => {
                    chatForm.setValue('chatStarted', true);
                  })}
                >
                  {t('common:core.chat.Start Chat')}
                </Button>
              </Box>
            )}
          </Card>
        </Box>
      )}

      {variableList.length > 0 && (
        <Box textAlign={'left'}>
          <Card
            order={2}
            w={'400px'}
            padding={'24px 32px'}
            bg={'white'}
            borderRadius={'12px'}
            border={'0.5px solid var(--Gray-Modern-250, #DFE2EA)'}
            gap={'10px'}
            justifyContent={'center'}
          >
            {variableList.map((item) => (
              <VariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
            ))}
            {!chatStarted && (
              <Box>
                <Button
                  leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                  size={'sm'}
                  maxW={'100px'}
                  onClick={handleSubmitChat(() => {
                    console.log('start chat');
                    chatForm.setValue('chatStarted', true);
                  })}
                >
                  {t('common:core.chat.Start Chat')}
                </Button>
              </Box>
            )}
          </Card>
        </Box>
      )}
    </Box>
  );
};

const WelcomePage = ({
  welcomeText,
  chatStarted,
  chatForm,
  showExternalVariables
}: WelcomePageProps) => {
  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.avatar);
  const appName = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app.name);
  return (
    <Flex
      flexDirection={'column'}
      alignItems={'center'}
      padding={'0px'}
      gap={'16px'}
      width={'388px'}
      height={'auto'}
      flex={'none'}
      order={0}
      flexGrow={0}
      margin={'0 auto'}
      py={6}
    >
      {/* Logo and Title */}
      <Flex
        flexDirection={'row'}
        alignItems={'center'}
        padding={'0px'}
        gap={'20px'}
        width={'100%'}
        maxWidth={'388px'}
        height={'60px'}
        flex={'none'}
        order={0}
        flexGrow={0}
      >
        {/* Logo Container */}
        <Box
          boxSizing={'border-box'}
          width={'60px'}
          height={'60px'}
          borderRadius={'15px'}
          flex={'none'}
          order={0}
          flexGrow={0}
          position={'relative'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          {/* Logo Icon */}

          <Avatar
            width={'40px'}
            height={'40px'}
            src={appAvatar}
            backgroundSize={'cover'}
            backgroundPosition={'center'}
            borderRadius={'10px'}
          />
        </Box>

        {/* Title */}
        <Text
          flex={1}
          height={'48px'}
          fontFamily={'Inter'}
          fontStyle={'normal'}
          fontWeight={700}
          fontSize={'34.2857px'}
          lineHeight={'140%'}
          display={'flex'}
          alignItems={'center'}
          color={'#111824'}
          whiteSpace={'nowrap'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
          order={1}
        >
          {appName}
        </Text>
      </Flex>

      {/* Welcome Message with Markdown */}
      <Box
        width={'388px'}
        fontFamily={'PingFang SC'}
        fontStyle={'normal'}
        fontWeight={400}
        fontSize={'18px'}
        lineHeight={'26px'}
        letterSpacing={'0.15px'}
        color={'#707070'}
        flex={'none'}
        order={1}
        alignSelf={'stretch'}
        flexGrow={0}
        textAlign={'center'}
      >
        <Markdown source={`~~~guide \n${welcomeText}`} forbidZhFormat />
      </Box>
      <Box id="variable-input" order={2}>
        <VariableInput
          chatStarted={chatStarted}
          chatForm={chatForm}
          showExternalVariables={showExternalVariables}
        />
      </Box>
    </Flex>
  );
};

export default WelcomePage;
