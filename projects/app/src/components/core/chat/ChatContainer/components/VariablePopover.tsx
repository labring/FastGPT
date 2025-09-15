import { Box, Button, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useEffect, useMemo } from 'react';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { ChatTypeEnum } from '../ChatBox/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type';

const VariablePopover = ({ chatType }: { chatType: ChatTypeEnum }) => {
  const { t } = useTranslation();
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );

  const showExternalVariables = [ChatTypeEnum.log, ChatTypeEnum.test, ChatTypeEnum.chat].includes(
    chatType
  );
  const showInternalVariables = [ChatTypeEnum.log, ChatTypeEnum.test].includes(chatType);
  const { commonVariableList, externalVariableList, internalVariableList } = useMemo(() => {
    const {
      commonVariableList,
      externalVariableList,
      internalVariableList
    }: {
      commonVariableList: VariableItemType[];
      externalVariableList: VariableItemType[];
      internalVariableList: VariableItemType[];
    } = {
      commonVariableList: [],
      externalVariableList: [],
      internalVariableList: []
    };
    variables.forEach((item) => {
      if (item.type === VariableInputEnum.custom) {
        externalVariableList.push(item);
      } else if (item.type === VariableInputEnum.internal) {
        internalVariableList.push(item);
      } else {
        commonVariableList.push(item);
      }
    });
    return {
      externalVariableList: showExternalVariables ? externalVariableList : [],
      internalVariableList: showInternalVariables ? internalVariableList : [],
      commonVariableList
    };
  }, [showExternalVariables, showInternalVariables, variables]);

  const hasVariables =
    commonVariableList.length > 0 ||
    internalVariableList.length > 0 ||
    externalVariableList.length > 0;

  const { getValues, reset } = variablesForm;

  useEffect(() => {
    const values = getValues();
    variables.forEach((item) => {
      const val = getValues(`variables.${item.key}`);
      if (item.defaultValue !== undefined && (val === undefined || val === null || val === '')) {
        values.variables[item.key] = item.defaultValue;
      }
    });
    reset(values);
  }, [getValues, reset, variables]);

  return hasVariables ? (
    <MyPopover
      placement="bottom"
      trigger={'click'}
      closeOnBlur={true}
      Trigger={
        <Button variant={'whiteBase'} size={'sm'} leftIcon={<MyIcon name={'edit'} w={4} />}>
          {t('common:core.module.Variable')}
        </Button>
      }
    >
      {({ onClose }) => (
        <Box p={4} maxH={'60vh'} overflow={'auto'}>
          {internalVariableList.length > 0 && (
            <Box textAlign={'left'}>
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
                {t('chat:internal_variables_tip')}
              </Flex>
              {internalVariableList.map((item) => (
                <LabelAndFormRender
                  {...item}
                  key={item.key}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type)}
                  form={variablesForm}
                  fieldName={`variables.${item.key}`}
                  bg={'myGray.50'}
                />
              ))}
            </Box>
          )}
          {internalVariableList.length > 0 &&
            [...commonVariableList, externalVariableList].length > 0 && <MyDivider h={'1px'} />}

          {externalVariableList.length > 0 && (
            <Box textAlign={'left'}>
              {chatType !== ChatTypeEnum.chat && (
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
              )}
              {externalVariableList.map((item) => (
                <LabelAndFormRender
                  {...item}
                  key={item.key}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type)}
                  form={variablesForm}
                  fieldName={`variables.${item.key}`}
                  bg={'myGray.50'}
                />
              ))}
            </Box>
          )}
          {externalVariableList.length > 0 && commonVariableList.length > 0 && (
            <MyDivider h={'1px'} />
          )}

          {commonVariableList.length > 0 && (
            <Box>
              {commonVariableList.map((item) => (
                <LabelAndFormRender
                  {...item}
                  key={item.key}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type)}
                  form={variablesForm}
                  fieldName={`variables.${item.key}`}
                  bg={'myGray.50'}
                />
              ))}
            </Box>
          )}
        </Box>
      )}
    </MyPopover>
  ) : null;
};

export default VariablePopover;
