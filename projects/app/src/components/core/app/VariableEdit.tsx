import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  ModalFooter,
  ModalBody,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Flex,
  Switch,
  Input,
  FormControl,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useDisclosure
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
import { useFieldArray } from 'react-hook-form';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyRadio from '@/components/common/MyRadio';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import MySelect from '@fastgpt/web/components/common/MySelect';

export const defaultVariable: VariableItemType = {
  id: nanoid(),
  key: 'key',
  label: 'label',
  type: VariableInputEnum.input,
  required: true,
  maxLen: 50,
  enums: [{ value: '' }],
  valueType: WorkflowIOValueTypeEnum.string
};
export const addVariable = () => {
  const newVariable = { ...defaultVariable, key: '', id: '' };
  return newVariable;
};
const valueTypeMap = {
  [VariableInputEnum.input]: WorkflowIOValueTypeEnum.string,
  [VariableInputEnum.select]: WorkflowIOValueTypeEnum.string,
  [VariableInputEnum.textarea]: WorkflowIOValueTypeEnum.string,
  [VariableInputEnum.custom]: WorkflowIOValueTypeEnum.any
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
  const [refresh, setRefresh] = useState(false);

  const VariableTypeList = useMemo(
    () =>
      Object.entries(variableMap).map(([key, value]) => ({
        title: t(value.title as any),
        icon: value.icon,
        value: key
      })),
    [t]
  );

  const { isOpen: isOpenEdit, onOpen: onOpenEdit, onClose: onCloseEdit } = useDisclosure();
  const {
    setValue,
    reset: resetEdit,
    register: registerEdit,
    getValues: getValuesEdit,
    setValue: setValuesEdit,
    control: editVariableController,
    handleSubmit: handleSubmitEdit,
    watch
  } = useForm<{ variable: VariableItemType }>();

  const variableType = watch('variable.type');
  const valueType = watch('variable.valueType');

  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control: editVariableController,
    name: 'variable.enums'
  });

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

  const valueTypeSelectList = useMemo(
    () =>
      Object.values(FlowValueTypeMap)
        .map((item) => ({
          label: t(item.label as any),
          value: item.value
        }))
        .filter(
          (item) =>
            ![
              WorkflowIOValueTypeEnum.arrayAny,
              WorkflowIOValueTypeEnum.selectApp,
              WorkflowIOValueTypeEnum.selectDataset,
              WorkflowIOValueTypeEnum.dynamic
            ].includes(item.value)
        ),
    [t]
  );
  const showValueTypeSelect = variableType === VariableInputEnum.custom;

  const onSubmit = useCallback(
    ({ variable }: { variable: VariableItemType }) => {
      variable.key = variable.key.trim();

      // check select
      if (variable.type === VariableInputEnum.select) {
        const enums = variable.enums.filter((item) => item.value);
        if (enums.length === 0) {
          toast({
            status: 'warning',
            title: t('common:core.module.variable.variable option is required')
          });
          return;
        }
      }

      // check repeat key
      const existingVariable = variables.find(
        (item) => item.key === variable.key && item.id !== variable.id
      );
      if (existingVariable) {
        toast({
          status: 'warning',
          title: t('common:core.module.variable.key already exists')
        });
        return;
      }

      // set valuetype based on variable.type
      variable.valueType =
        variable.type === VariableInputEnum.custom
          ? variable.valueType
          : valueTypeMap[variable.type];

      // set default required value based on variableType
      if (variable.type === VariableInputEnum.custom) {
        variable.required = false;
      }

      const onChangeVariable = [...variables];
      // update
      if (variable.id) {
        const index = variables.findIndex((item) => item.id === variable.id);
        onChangeVariable[index] = variable;
      } else {
        onChangeVariable.push({
          ...variable,
          id: nanoid()
        });
      }
      onChange(onChangeVariable);
      onCloseEdit();
    },
    [onChange, onCloseEdit, t, toast, variables]
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
            resetEdit({ variable: addVariable() });
            onOpenEdit();
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
                  <Th fontSize={'mini'}>{t('common:core.module.variable.variable name')}</Th>
                  <Th fontSize={'mini'}>{t('common:core.module.variable.key')}</Th>
                  <Th fontSize={'mini'}>{t('common:common.Require Input')}</Th>
                  <Th fontSize={'mini'} borderRadius={'none !important'}></Th>
                </Tr>
              </Thead>
              <Tbody>
                {formatVariables.map((item) => (
                  <Tr key={item.id}>
                    <Td textAlign={'center'} p={0} pl={3}>
                      <MyIcon name={item.icon as any} w={'14px'} color={'myGray.500'} />
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
                          resetEdit({ variable: item });
                          onOpenEdit();
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
      <MyModal
        iconSrc="core/app/simpleMode/variable"
        title={t('common:core.module.Variable Setting')}
        isOpen={isOpenEdit}
        onClose={onCloseEdit}
        maxW={['90vw', '500px']}
      >
        <ModalBody>
          {variableType !== VariableInputEnum.custom && (
            <Flex alignItems={'center'}>
              <FormLabel w={'70px'}>{t('common:common.Require Input')}</FormLabel>
              <Switch {...registerEdit('variable.required')} />
            </Flex>
          )}
          <Flex mt={5} alignItems={'center'}>
            <FormLabel w={'80px'}>{t('common:core.module.variable.variable name')}</FormLabel>
            <Input
              {...registerEdit('variable.label', {
                required: t('common:core.module.variable.variable name is required')
              })}
            />
          </Flex>
          <Flex mt={5} alignItems={'center'}>
            <FormLabel w={'80px'}>{t('common:core.module.variable.key')}</FormLabel>
            <Input
              {...registerEdit('variable.key', {
                required: t('common:core.module.variable.key is required')
              })}
            />
          </Flex>
          <Flex mt={5} alignItems={'center'}>
            <FormLabel w={'80px'}>{t('workflow:value_type')}</FormLabel>
            {showValueTypeSelect ? (
              <Box flex={1}>
                <MySelect<WorkflowIOValueTypeEnum>
                  list={valueTypeSelectList.filter(
                    (item) => item.value !== WorkflowIOValueTypeEnum.arrayAny
                  )}
                  value={valueType}
                  onchange={(e) => {
                    setValue('variable.valueType', e);
                  }}
                />
              </Box>
            ) : (
              <Box fontSize={'14px'}>{valueTypeMap[variableType]}</Box>
            )}
          </Flex>

          <FormLabel mt={5} mb={2}>
            {t('common:core.workflow.Variable.Variable type')}
          </FormLabel>
          <MyRadio
            gridGap={4}
            gridTemplateColumns={'repeat(2,1fr)'}
            value={variableType}
            list={VariableTypeList}
            color={'myGray.600'}
            hiddenCircle
            onChange={(e) => {
              setValuesEdit('variable.type', e as any);
              setRefresh(!refresh);
            }}
          />

          {/* desc */}
          {variableMap[variableType]?.desc && (
            <Box mt={2} fontSize={'sm'} color={'myGray.500'} whiteSpace={'pre-wrap'}>
              {t(variableMap[variableType].desc as any)}
            </Box>
          )}

          {variableType === VariableInputEnum.input && (
            <>
              <FormLabel mt={5} mb={2}>
                {t('common:core.module.variable.text max length')}
              </FormLabel>
              <Box>
                <NumberInput max={500} min={1} step={1} position={'relative'}>
                  <NumberInputField
                    {...registerEdit('variable.maxLen', {
                      min: 1,
                      max: 500,
                      valueAsNumber: true
                    })}
                    max={500}
                  />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </Box>
            </>
          )}

          {variableType === VariableInputEnum.select && (
            <>
              <Box mt={5} mb={2}>
                {t('common:core.module.variable.variable options')}
              </Box>
              <Box>
                {selectEnums.map((item, i) => (
                  <Flex key={item.id} mb={2} alignItems={'center'}>
                    <FormControl>
                      <Input
                        {...registerEdit(`variable.enums.${i}.value`, {
                          required: t(
                            'common:core.module.variable.variable option is value is required'
                          )
                        })}
                      />
                    </FormControl>
                    {selectEnums.length > 1 && (
                      <MyIcon
                        ml={3}
                        name={'delete'}
                        w={'16px'}
                        cursor={'pointer'}
                        p={2}
                        borderRadius={'md'}
                        _hover={{ bg: 'red.100' }}
                        onClick={() => removeEnums(i)}
                      />
                    )}
                  </Flex>
                ))}
              </Box>
              <Button
                variant={'solid'}
                w={'100%'}
                textAlign={'left'}
                leftIcon={<SmallAddIcon />}
                bg={'myGray.100 !important'}
                onClick={() => appendEnums({ value: '' })}
              >
                {t('common:core.module.variable add option')}
              </Button>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant={'whiteBase'} mr={3} onClick={onCloseEdit}>
            {t('common:common.Close')}
          </Button>
          <Button onClick={handleSubmitEdit(onSubmit)}>
            {getValuesEdit('variable.id')
              ? t('common:common.Confirm Update')
              : t('common:common.Add New')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Box>
  );
};

export default React.memo(VariableEdit);
