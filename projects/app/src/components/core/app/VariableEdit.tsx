import React, { useMemo, useState } from 'react';
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
import { VariableInputEnum, variableMap } from '@fastgpt/global/core/workflow/constants';
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
        title: t(value.title),
        icon: value.icon,
        value: key
      })),
    [t]
  );

  const { isOpen: isOpenEdit, onOpen: onOpenEdit, onClose: onCloseEdit } = useDisclosure();
  const {
    reset: resetEdit,
    register: registerEdit,
    getValues: getValuesEdit,
    setValue: setValuesEdit,
    control: editVariableController,
    handleSubmit: handleSubmitEdit,
    watch
  } = useForm<{ variable: VariableItemType }>();

  const variableType = watch('variable.type');

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

  return (
    <Box>
      <Flex alignItems={'center'}>
        <MyIcon name={'core/app/simpleMode/variable'} w={'20px'} />
        <FormLabel ml={2} fontWeight={'medium'}>
          {t('core.module.Variable')}
        </FormLabel>
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
          {t('common.Add New')}
        </Button>
      </Flex>
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
                  <Th fontSize={'mini'}>{t('core.module.variable.variable name')}</Th>
                  <Th fontSize={'mini'}>{t('core.module.variable.key')}</Th>
                  <Th fontSize={'mini'}>{t('common.Require Input')}</Th>
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
      <MyModal
        iconSrc="core/app/simpleMode/variable"
        title={t('core.module.Variable Setting')}
        isOpen={isOpenEdit}
        onClose={onCloseEdit}
        maxW={['90vw', '500px']}
      >
        <ModalBody>
          {variableType !== VariableInputEnum.custom && (
            <Flex alignItems={'center'}>
              <FormLabel w={'70px'}>{t('common.Require Input')}</FormLabel>
              <Switch {...registerEdit('variable.required')} />
            </Flex>
          )}
          <Flex mt={5} alignItems={'center'}>
            <FormLabel w={'80px'}>{t('core.module.variable.variable name')}</FormLabel>
            <Input
              {...registerEdit('variable.label', {
                required: t('core.module.variable.variable name is required')
              })}
            />
          </Flex>
          <Flex mt={5} alignItems={'center'}>
            <FormLabel w={'80px'}>{t('core.module.variable.key')}</FormLabel>
            <Input
              {...registerEdit('variable.key', {
                required: t('core.module.variable.key is required')
              })}
            />
          </Flex>

          <FormLabel mt={5} mb={2}>
            {t('core.workflow.Variable.Variable type')}
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
              {t(variableMap[variableType].desc)}
            </Box>
          )}

          {variableType === VariableInputEnum.input && (
            <>
              <FormLabel mt={5} mb={2}>
                {t('core.module.variable.text max length')}
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
                {t('core.module.variable.variable options')}
              </Box>
              <Box>
                {selectEnums.map((item, i) => (
                  <Flex key={item.id} mb={2} alignItems={'center'}>
                    <FormControl>
                      <Input
                        {...registerEdit(`variable.enums.${i}.value`, {
                          required: t('core.module.variable.variable option is value is required')
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
                {t('core.module.variable add option')}
              </Button>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant={'whiteBase'} mr={3} onClick={onCloseEdit}>
            {t('common.Close')}
          </Button>
          <Button
            onClick={handleSubmitEdit(({ variable }) => {
              // check select
              if (variable.type === VariableInputEnum.select) {
                const enums = variable.enums.filter((item) => item.value);
                if (enums.length === 0) {
                  toast({
                    status: 'warning',
                    title: t('core.module.variable.variable option is required')
                  });
                  return;
                }
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
            })}
          >
            {getValuesEdit('variable.id') ? t('common.Confirm Update') : t('common.Add New')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Box>
  );
};

export default React.memo(VariableEdit);

export const defaultVariable: VariableItemType = {
  id: nanoid(),
  key: 'key',
  label: 'label',
  type: VariableInputEnum.input,
  required: true,
  maxLen: 50,
  enums: [{ value: '' }]
};
export const addVariable = () => {
  const newVariable = { ...defaultVariable, key: '', id: '' };
  return newVariable;
};
