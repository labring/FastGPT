import React from 'react';
import { Box, FormControl, FormErrorMessage, HStack, Text } from '@chakra-ui/react';
import { useFormContext, type FieldError } from 'react-hook-form';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type AdminFormItemProps = {
  label: string;
  name?: string;
  tooltip?: string;
  description?: string;
  isRequired?: boolean;
  children: React.ReactNode;
  mb?: number | string;
};

/**
 * 统一的表单字段垂直排布项（Label + 提示问号 + 下方输入控件）。
 * 文案由调用方传入已翻译的字符串，本组件只负责布局。
 */
const AdminFormItem = ({
  label,
  name,
  tooltip,
  description,
  isRequired,
  children,
  mb = 6
}: AdminFormItemProps) => {
  const form = useFormContext();
  const { t } = useSafeTranslation();
  /** Controller 与 register 都携带 name；沿布局节点查找，统一绑定字段错误。 */
  const findFieldNames = (nodes: React.ReactNode): string[] =>
    React.Children.toArray(nodes).flatMap((node) => {
      if (!React.isValidElement<{ name?: string; children?: React.ReactNode }>(node)) return [];
      return node.props.name ? [node.props.name] : findFieldNames(node.props.children);
    });
  const names = name ? [name] : findFieldNames(children);
  const error = names
    .map((name) => {
      let current: unknown = form?.formState.errors;
      for (const segment of name.split('.')) {
        if (!current || typeof current !== 'object') return;
        if ('message' in current && typeof current.message === 'string')
          return current as FieldError;
        current = (current as Record<string, unknown>)[segment];
      }
      return current as FieldError | undefined;
    })
    .find(Boolean);
  const hasInlineError = React.Children.toArray(children).some(
    (node) => React.isValidElement<{ color?: string }>(node) && node.props.color === 'red.500'
  );
  return (
    <FormControl isInvalid={Boolean(error)} mb={mb}>
      <HStack spacing={1.5} mb={2}>
        {isRequired && (
          <Text as={'span'} color={'red.500'}>
            *
          </Text>
        )}
        <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
          {label}
        </Text>
        {tooltip && <QuestionTip label={tooltip} />}
      </HStack>
      <Box w={'100%'}>{children}</Box>
      {!hasInlineError && error && (
        <FormErrorMessage>{error.message || t('admin:failed_to_save_settings')}</FormErrorMessage>
      )}
      {description && (
        <Text fontSize={'xs'} color={'myGray.500'} mt={1.5}>
          {description}
        </Text>
      )}
    </FormControl>
  );
};

export default React.memo(AdminFormItem);
