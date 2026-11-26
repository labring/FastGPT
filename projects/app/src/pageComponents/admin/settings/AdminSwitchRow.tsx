import React from 'react';
import { Flex, HStack, Text, Switch } from '@chakra-ui/react';
import { useFormContext } from 'react-hook-form';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type AdminSwitchRowProps = {
  label: string;
  name?: string;
  tooltip?: string;
  isChecked?: boolean;
  onChange?: (checked: boolean) => void;
  isDisabled?: boolean;
};

/** 统一的行内开关项（左侧 Label + 问号提示，右侧 Switch）。文案由调用方传入已翻译字符串。 */
const AdminSwitchRow = ({
  label,
  name,
  tooltip,
  isChecked = false,
  onChange,
  isDisabled = false
}: AdminSwitchRowProps) => {
  const form = useFormContext();
  const error = name ? form?.getFieldState(name, form.formState).error : undefined;
  return (
    <Flex
      alignItems={'center'}
      justifyContent={'space-between'}
      py={2}
      borderRadius={'md'}
      transition={'all 0.2s'}
      borderColor={error ? 'red.500' : undefined}
      borderWidth={error ? '1px' : undefined}
      aria-invalid={Boolean(error) || undefined}
    >
      <HStack spacing={1.5} maxW={'calc(100% - 60px)'}>
        <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
          {label}
        </Text>
        {tooltip && <QuestionTip label={tooltip} />}
        {error?.message && (
          <Text color={'red.500'} fontSize={'xs'}>
            {error.message}
          </Text>
        )}
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
