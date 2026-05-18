import { Button, Flex } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';
import { normalizeFormInputResultFile } from '../FormInputResult';
import { FormInputComponent } from '../Interactive/InteractiveComponents';
import { onSendPrompt } from './utils';

const normalizeRecoveredFormValue = ({
  inputType,
  value
}: {
  inputType: FlowNodeInputTypeEnum;
  value: unknown;
}) => {
  if (inputType !== FlowNodeInputTypeEnum.fileSelect || !Array.isArray(value)) {
    return value;
  }

  return value
    .map(normalizeFormInputResultFile)
    .filter((file): file is NonNullable<ReturnType<typeof normalizeFormInputResultFile>> =>
      Boolean(file)
    );
};

const getInputFormValueFromResponseData = ({
  responseData,
  interactive,
  inputKey
}: {
  responseData?: ChatHistoryItemResType[];
  interactive: UserInputInteractive;
  inputKey: string;
}) => {
  const entryNodeIds = (interactive as UserInputInteractive & { entryNodeIds?: string[] })
    .entryNodeIds;
  const formInputResult = responseData
    ?.slice()
    .reverse()
    .find(
      (item) =>
        item.formInputResult &&
        (!item.nodeId || !entryNodeIds?.length || entryNodeIds.includes(item.nodeId))
    )?.formInputResult;

  if (!formInputResult || typeof formInputResult !== 'object' || Array.isArray(formInputResult)) {
    return;
  }

  return (formInputResult as Record<string, unknown>)[inputKey];
};

const RenderUserFormInteractive = React.memo(function RenderUserFormInteractive({
  interactive,
  responseData,
  isLastChild
}: {
  interactive: UserInputInteractive;
  responseData?: ChatHistoryItemResType[];
  isLastChild: boolean;
}) {
  const { t } = useTranslation();

  const defaultValues = useMemo(() => {
    return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
      const responseValue = getInputFormValueFromResponseData({
        responseData,
        interactive,
        inputKey: item.key
      });
      if (responseValue !== undefined) {
        acc[item.key] = normalizeRecoveredFormValue({
          inputType: item.type,
          value: responseValue
        });
        return acc;
      }

      // 使用 ?? 运算符，只有 undefined 或 null 时才使用 defaultValue
      acc[item.key] = item.value ?? item.defaultValue;
      return acc;
    }, {});
  }, [interactive, responseData]);

  const handleFormSubmit = useCallback(
    (data: Record<string, any>) => {
      const finalData: Record<string, any> = {};
      interactive.params.inputForm?.forEach((item) => {
        if (item.key in data) {
          finalData[item.key] = data[item.key];
        }
      });

      onSendPrompt(JSON.stringify(finalData));
    },
    [interactive.params.inputForm]
  );

  return (
    <Flex flexDirection={'column'} gap={2} minW={'250px'}>
      <FormInputComponent
        interactiveParams={{
          ...interactive.params,
          // 如果不是最后一条消息，此时不能再提交了。
          submitted: interactive.params.submitted || !isLastChild
        }}
        defaultValues={defaultValues}
        SubmitButton={({ onSubmit, isFileUploading }) => (
          <Button
            onClick={() => onSubmit(handleFormSubmit)()}
            isDisabled={isFileUploading}
            isLoading={isFileUploading}
          >
            {t('common:Submit')}
          </Button>
        )}
      />
    </Flex>
  );
});

export default RenderUserFormInteractive;
