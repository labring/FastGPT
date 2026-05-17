import { Button, Flex } from '@chakra-ui/react';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';
import { FormInputComponent } from '../Interactive/InteractiveComponents';
import { onSendPrompt } from './utils';

const RenderUserFormInteractive = React.memo(function RenderUserFormInteractive({
  interactive,
  isLastChild
}: {
  interactive: UserInputInteractive;
  isLastChild: boolean;
}) {
  const { t } = useTranslation();

  const defaultValues = useMemo(() => {
    return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
      // 使用 ?? 运算符，只有 undefined 或 null 时才使用 defaultValue
      acc[item.key] = item.value ?? item.defaultValue;
      return acc;
    }, {});
  }, [interactive]);

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
