import React from 'react';
import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type AdminFormItemProps = {
  label: string;
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
  tooltip,
  description,
  isRequired,
  children,
  mb = 6
}: AdminFormItemProps) => {
  return (
    <Flex flexDirection={'column'} mb={mb}>
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
      {description && (
        <Text fontSize={'xs'} color={'myGray.500'} mt={1.5}>
          {description}
        </Text>
      )}
    </Flex>
  );
};

export default React.memo(AdminFormItem);
