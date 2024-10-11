import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Stack
} from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  VariableInputEnum,
  variableMap,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useForm } from 'react-hook-form';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import InputTypeConfig from '@/pages/app/detail/components/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig';

export const defaultVariable: VariableItemType = {
  id: nanoid(),
  key: '',
  label: '',
  type: VariableInputEnum.input,
  description: '',
  required: true,
  valueType: WorkflowIOValueTypeEnum.string
};

type InputItemType = VariableItemType & {
  list: { label: string; value: string }[];
};

export const addVariable = () => {
  const newVariable = { ...defaultVariable, key: '', id: '', list: [{ value: '', label: '' }] };
  return newVariable;
};

const VariableEdit = ({
  variables = [],
  onChange
}: {
  variables?: VariableItemType[];
  onChange: (data: VariableItemType[]) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const form = useForm<VariableItemType>();
  const { setValue, reset, watch, getValues } = form;
  const value = getValues();
  const type = watch('type');
  const valueType = watch('valueType');
  const max = watch('max');
  const min = watch('min');
  const defaultValue = watch('defaultValue');

  const inputTypeList = useMemo(
    () =>
      Object.values(variableMap).map((item) => ({
        icon: item.icon,
        label: t(item.label as any),
        value: item.value,
        defaultValueType: item.defaultValueType,
        description: item.description ? t(item.description as any) : ''
      })),
    [t]
  );

  const defaultValueType = useMemo(() => {
    const item = inputTypeList.find((item) => item.value === type);
    return item?.defaultValueType;
  }, [inputTypeList, type]);

  const formatVariables = useMemo(() => {
    const results = formatEditorVariablePickerIcon(variables);
    return results.map((item) => {
      const variable = variables.find((variable) => variable.key === item.key);
      return {
        ...variable,
        icon: item.icon
      };
    });
  }, [variables]);

  const onSubmitSuccess = useCallback(
    (data: InputItemType, action: 'confirm' | 'continue') => {
      data.label = data?.label?.trim();

      const existingVariable = variables.find(
        (item) => item.label === data.label && item.id !== data.id
      );
      if (existingVariable) {
        toast({
          status: 'warning',
          title: t('common:core.module.variable.key already exists')
        });
        return;
      }

      data.key = data.label;
      data.enums = data.list;

      if (data.type === VariableInputEnum.custom) {
        data.required = false;
      }

      if (data.type === VariableInputEnum.numberInput) {
        data.valueType = WorkflowIOValueTypeEnum.number;
      }
      if (data.type === VariableInputEnum.switch) {
        data.valueType = WorkflowIOValueTypeEnum.boolean;
      }

      const onChangeVariable = [...variables];
      if (data.id) {
        const index = variables.findIndex((item) => item.id === data.id);
        onChangeVariable[index] = data;
      } else {
        onChangeVariable.push({
          ...data,
          id: nanoid()
        });
      }

      if (action === 'confirm') {
        onChange(onChangeVariable);
        reset({});
      } else if (action === 'continue') {
        onChange(onChangeVariable);
        toast({
          status: 'success',
          title: t('common:common.Add Success')
        });
        reset(addVariable());
      }
    },
    [variables, toast, t, onChange, reset]
  );

  const onSubmitError = useCallback(
    (e: Object) => {
      for (const item of Object.values(e)) {
        if (item.message) {
          toast({
            status: 'warning',
            title: item.message
          });
          break;
        }
      }
    },
    [toast]
  );

  return (
    <Box>
      {/* Row box */}
      <Flex alignItems={'center'}>
        <MyIcon name={'core/app/simpleMode/variable'} w={'20px'} />
        <FormLabel ml={2}>{t('common:core.module.Variable')}</FormLabel>
        <ChatFunctionTip type={'variable'} />
        <Box flex={1} />
        <Button
          variant={'transparentBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          onClick={() => {
            reset(addVariable());
          }}
        >
          {t('common:common.Add New')}
        </Button>
      </Flex>
      {/* Form render */}
      {formatVariables.length > 0 && (
        <Box mt={2} borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'} borderBottom="none">
          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th
                    fontSize={'mini'}
                    borderRadius={'none !important'}
                    w={'18px !important'}
                    p={0}
                  />
                  <Th fontSize={'mini'}>{t('workflow:Variable_name')}</Th>
                  <Th fontSize={'mini'}>{t('common:core.module.variable.key')}</Th>
                  <Th fontSize={'mini'}>{t('common:common.Require Input')}</Th>
                  <Th fontSize={'mini'} borderRadius={'none !important'}></Th>
                </Tr>
              </Thead>
              <Tbody>
                {formatVariables.map((item) => (
                  <Tr key={item.id}>
                    <Td p={0} pl={3}>
                      <MyIcon name={item.icon as any} w={'16px'} color={'myGray.500'} />
                    </Td>
                    <Td>{item.label}</Td>
                    <Td>{item.key}</Td>
                    <Td>{item.required ? '✔' : ''}</Td>
                    <Td>
                      <MyIcon
                        mr={3}
                        name={'common/settingLight'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() => {
                          const formattedItem = {
                            ...item,
                            list: item.enums || []
                          };
                          reset(formattedItem);
                        }}
                      />
                      <MyIcon
                        name={'delete'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() =>
                          onChange(variables.filter((variable) => variable.id !== item.id))
                        }
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Edit modal */}
      {!!Object.keys(value).length && (
        <MyModal
          iconSrc="core/app/simpleMode/variable"
          title={t('common:core.module.Variable Setting')}
          isOpen={true}
          onClose={() => reset({})}
          maxW={['90vw', '928px']}
          w={'100%'}
        >
          <Flex h={'560px'}>
            <Stack gap={4} p={8}>
              <FormLabel color={'myGray.600'} fontWeight={'medium'}>
                {t('common:core.module.Input Type')}
              </FormLabel>
              <Flex flexDirection={'column'} gap={4}></Flex>
              <Box display={'grid'} gridTemplateColumns={'repeat(2, 1fr)'} gap={4}>
                {inputTypeList.map((item) => {
                  const isSelected = type === item.value;
                  return (
                    <Box
                      display={'flex'}
                      key={item.label}
                      border={isSelected ? '1px solid #3370FF' : '1px solid #DFE2EA'}
                      p={3}
                      rounded={'6px'}
                      fontWeight={'medium'}
                      fontSize={'14px'}
                      alignItems={'center'}
                      cursor={'pointer'}
                      boxShadow={isSelected ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'}
                      _hover={{
                        '& > svg': {
                          color: 'primary.600'
                        },
                        '& > span': {
                          color: 'myGray.900'
                        },
                        border: '1px solid #3370FF',
                        boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
                      }}
                      onClick={() => {
                        setValue('type', item.value);
                      }}
                    >
                      <MyIcon
                        name={item.icon as any}
                        w={'20px'}
                        mr={1.5}
                        color={isSelected ? 'primary.600' : 'myGray.400'}
                      />
                      <Box
                        as="span"
                        color={isSelected ? 'myGray.900' : 'inherit'}
                        pr={4}
                        whiteSpace="nowrap"
                      >
                        {item.label}
                      </Box>
                      {item.description && (
                        <QuestionTip label={item.description as string} ml={1} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Stack>
            <InputTypeConfig
              form={form}
              type={'variable'}
              isEdit={!!value.label}
              inputType={type}
              valueType={valueType}
              defaultValue={defaultValue}
              defaultValueType={defaultValueType}
              max={max}
              min={min}
              onClose={() => reset({})}
              onSubmitSuccess={onSubmitSuccess}
              onSubmitError={onSubmitError}
            />
          </Flex>
        </MyModal>
      )}
    </Box>
  );
};

export default React.memo(VariableEdit);
