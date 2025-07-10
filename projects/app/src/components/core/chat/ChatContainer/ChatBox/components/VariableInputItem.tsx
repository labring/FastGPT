import InputRender from '@/components/InputRender';
import { formatInputType } from '@/components/InputRender/utils';
import { Box, Flex } from '@chakra-ui/react';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

export const VariableInputItem = ({
  item,
  variablesForm
}: {
  item: VariableItemType;
  variablesForm: UseFormReturn<any>;
}) => {
  const {
    control,
    formState: { errors }
  } = variablesForm;

  return (
    <Box _notLast={{ mb: 4 }} px={1}>
      <Flex alignItems={'center'} mb={1}>
        {item.required && <Box color={'red.500'}>*</Box>}
        <FormLabel>{item.label}</FormLabel>
        {item.description && <QuestionTip ml={1} label={item.description} />}
      </Flex>

      <Controller
        key={`variables.${item.key}`}
        control={control}
        name={`variables.${item.key}`}
        rules={{
          required: item.required
        }}
        render={({ field: { onChange, value } }) => {
          const inputType = formatInputType({ inputType: item.type, valueType: item.valueType });

          return (
            <InputRender
              inputType={inputType}
              value={value}
              onChange={onChange}
              placeholder={item.description}
              isInvalid={errors?.variables && Object.keys(errors.variables).includes(item.key)}
              isDisabled={false}
              maxLength={item.maxLength}
              min={item.min}
              max={item.max}
              list={item.enums}
            />
          );
        }}
      />
    </Box>
  );
};

export const NodeVariableInputItem = ({
  item,
  variablesForm
}: {
  item: FlowNodeInputItemType;
  variablesForm: UseFormReturn<any>;
}) => {
  const {
    control,
    formState: { errors }
  } = variablesForm;

  return (
    <Box _notLast={{ mb: 4 }} px={1}>
      <Flex alignItems={'center'} mb={1}>
        {item.required && <Box color={'red.500'}>*</Box>}
        {item.label}
        {item.description && <QuestionTip ml={1} label={item.description} />}
      </Flex>

      <Controller
        key={`nodeVariables.${item.key}`}
        control={control}
        name={`nodeVariables.${item.key}`}
        rules={{
          required: item.required
        }}
        render={({ field: { onChange, value } }) => {
          const inputType = formatInputType({
            inputType: item.renderTypeList[0],
            valueType: item.valueType
          });

          return (
            <InputRender
              inputType={inputType}
              value={value}
              onChange={onChange}
              placeholder={item.placeholder || item.description}
              isInvalid={
                errors?.nodeVariables && Object.keys(errors.nodeVariables).includes(item.key)
              }
              isDisabled={false}
              maxLength={item.maxLength}
              min={item.min}
              max={item.max}
              list={item.list}
              canSelectFile={item.canSelectFile}
              canSelectImg={item.canSelectImg}
              maxFiles={item.maxFiles}
            />
          );
        }}
      />
    </Box>
  );
};

export default { VariableInputItem, NodeVariableInputItem };
