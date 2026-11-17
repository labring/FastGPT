import React from 'react';
import { Flex, HStack, Text, Switch } from '@chakra-ui/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type AdminSwitchRowProps = {
  label: string;
  tooltip?: string;
  isChecked?: boolean;
  onChange?: (checked: boolean) => void;
  isDisabled?: boolean;
};

/** 统一的行内开关项（左侧 Label + 问号提示，右侧 Switch）。文案由调用方传入已翻译字符串。 */
const AdminSwitchRow = ({
  label,
  tooltip,
  isChecked = false,
  onChange,
  isDisabled = false
}: AdminSwitchRowProps) => {
  return (
    <Flex
      alignItems={'center'}
      justifyContent={'space-between'}
      py={2}
      borderRadius={'md'}
      transition={'all 0.2s'}
    >
      <HStack spacing={1.5} maxW={'calc(100% - 60px)'}>
        <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
          {label}
        </Text>
        {tooltip && <QuestionTip label={tooltip} />}
      </HStack>
      <Switch
        isChecked={isChecked}
        onChange={(e) => onChange?.(e.target.checked)}
        isDisabled={isDisabled}
        colorScheme={'blue'}
      />
    </Flex>
  );
};

export default React.memo(AdminSwitchRow);
