import { Box, Button, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useEffect } from 'react';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';

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
        <Box p={4} maxH={'60vh'} overflow={'auto'}>
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
                <LabelAndFormRender
                  {...item}
                  key={item.key}
                  formKey={`variables.${item.key}`}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type)}
                  variablesForm={variablesForm}
                  bg={'myGray.50'}
                />
              ))}
            </Box>
          )}
          {hasExternalVariable && hasVariable && <MyDivider h={'1px'} />}
          {hasVariable && (
            <Box>
              {variableList.map((item) => (
                <LabelAndFormRender
                  {...item}
                  key={item.key}
                  formKey={`variables.${item.key}`}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type)}
                  variablesForm={variablesForm}
                  bg={'myGray.50'}
                />
              ))}
            </Box>
          )}
        </Box>
      )}
    </MyPopover>
  );
};

export default VariablePopover;
