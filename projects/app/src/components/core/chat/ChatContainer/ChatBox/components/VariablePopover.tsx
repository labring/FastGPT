import { Box, Button, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useEffect } from 'react';
import { ExternalVariableInputItem, VariableInputItem } from './VariableInput';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

const VariablePopover = ({
  showExternalVariables = false
}: {
  showExternalVariables?: boolean;
}) => {
  const { t } = useTranslation();
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const variableList = variables.filter((item) => item.type !== VariableInputEnum.custom);
  const externalVariableList = variables.filter((item) =>
    showExternalVariables ? item.type === VariableInputEnum.custom : false
  );

  const hasExternalVariable = externalVariableList.length > 0;
  const hasVariable = variableList.length > 0;

  const { getValues, setValue } = variablesForm;

  useEffect(() => {
    variables.forEach((item) => {
      const val = getValues(`variables.${item.key}`);
      if (item.defaultValue !== undefined && (val === undefined || val === null || val === '')) {
        setValue(`variables.${item.key}`, item.defaultValue);
      }
    });
  }, [variables]);

  return (
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
        <Box p={4}>
          {hasExternalVariable && (
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
                {t('chat:variable_invisable_in_share')}
              </Flex>
              {externalVariableList.map((item) => (
                <ExternalVariableInputItem
                  key={item.id}
                  item={item}
                  variablesForm={variablesForm}
                />
              ))}
            </Box>
          )}
          {hasExternalVariable && hasVariable && <MyDivider h={'1px'} />}
          {hasVariable && (
            <Box textAlign={'left'}>
              {variableList.map((item) => (
                <VariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
              ))}
            </Box>
          )}
          <Flex w={'full'} justifyContent={'flex-end'}>
            <Button size={'sm'} onClick={onClose}>
              {t('common:common.Confirm')}
            </Button>
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
};

export default VariablePopover;
