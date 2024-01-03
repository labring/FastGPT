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
  Image,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  BoxProps,
  useDisclosure
} from '@chakra-ui/react';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import { VariableInputEnum } from '@fastgpt/global/core/module/constants';
import type { VariableItemType } from '@fastgpt/global/core/module/type.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useForm } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import MyModal from '@/components/MyModal';
import MyTooltip from '@/components/MyTooltip';
import { variableTip } from '@fastgpt/global/core/module/template/tip';
import { useTranslation } from 'next-i18next';
import { useToast } from '@/web/common/hooks/useToast';
import MyRadio from '@/components/common/MyRadio';

const VariableEdit = ({
  variables,
  onChange
}: {
  variables: VariableItemType[];
  onChange: (data: VariableItemType[]) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [refresh, setRefresh] = useState(false);

  const VariableTypeList = useMemo(
    () => [
      {
        title: t('core.module.variable.input type'),
        icon: 'core/app/variable/input',
        value: VariableInputEnum.input
      },
      {
        title: t('core.module.variable.textarea type'),
        icon: 'core/app/variable/textarea',
        value: VariableInputEnum.textarea
      },
      {
        title: t('core.module.variable.select type'),
        icon: 'core/app/variable/select',
        value: VariableInputEnum.select
      }
    ],
    [t]
  );

  const { isOpen: isOpenEdit, onOpen: onOpenEdit, onClose: onCloseEdit } = useDisclosure();
  const {
    reset: resetEdit,
    register: registerEdit,
    getValues: getValuesEdit,
    setValue: setValuesEdit,
    control: editVariableController,
    handleSubmit: handleSubmitEdit
  } = useForm<{ variable: VariableItemType }>();

  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control: editVariableController,
    name: 'variable.enums'
  });

  const BoxBtnStyles: BoxProps = {
    cursor: 'pointer',
    px: 3,
    py: 1,
    borderRadius: 'md',
    _hover: {
      bg: 'myGray.150'
    }
  };

  const formatVariables = useMemo(() => {
    return variables.map((item) => ({
      ...item,
      icon: VariableTypeList.find((type) => type.value === item.type)?.icon
    }));
  }, [VariableTypeList, variables]);

  return (
    <Box>
      <Flex alignItems={'center'}>
        <Image alt={''} src={'/imgs/module/variable.png'} objectFit={'contain'} w={'18px'} />
        <Box ml={2} flex={1}>
          {t('core.module.Variable')}
          <MyTooltip label={variableTip} forceShow>
            <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
          </MyTooltip>
        </Box>
        <Flex
          {...BoxBtnStyles}
          alignItems={'center'}
          onClick={() => {
            resetEdit({ variable: addVariable() });
            onOpenEdit();
          }}
        >
          <SmallAddIcon />
          {t('common.Add New')}
        </Flex>
      </Flex>
      {formatVariables.length > 0 && (
        <Box mt={2} borderRadius={'md'} overflow={'hidden'} borderWidth={'1px'} borderBottom="none">
          <TableContainer>
            <Table bg={'white'}>
              <Thead>
                <Tr>
                  <Th w={'18px !important'} p={0} />
                  <Th>{t('core.module.variable.variable name')}</Th>
                  <Th>{t('core.module.variable.key')}</Th>
                  <Th>{t('common.Require Input')}</Th>
                  <Th></Th>
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
        iconSrc="/imgs/module/variable.png"
        title={t('core.module.Variable Setting')}
        isOpen={isOpenEdit}
        onClose={onCloseEdit}
      >
        <ModalBody>
          <Flex alignItems={'center'}>
            <Box w={'70px'}>{t('common.Require Input')}</Box>
            <Switch {...registerEdit('variable.required')} />
          </Flex>
          <Flex mt={5} alignItems={'center'}>
            <Box w={'80px'}>{t('core.module.variable.variable name')}</Box>
            <Input
              {...registerEdit('variable.label', {
                required: t('core.module.variable.variable name is required')
              })}
            />
          </Flex>
          <Flex mt={5} alignItems={'center'}>
            <Box w={'80px'}>{t('core.module.variable.key')}</Box>
            <Input
              {...registerEdit('variable.key', {
                required: t('core.module.variable.key is required')
              })}
            />
          </Flex>

          <Box mt={5} mb={2}>
            {t('core.module.Field Type')}
          </Box>
          <MyRadio
            gridGap={4}
            gridTemplateColumns={'repeat(3,1fr)'}
            value={getValuesEdit('variable.type')}
            list={VariableTypeList}
            color={'myGray.600'}
            hiddenCircle
            onChange={(e) => {
              setValuesEdit('variable.type', e as any);
              setRefresh(!refresh);
            }}
          />

          {getValuesEdit('variable.type') === VariableInputEnum.input && (
            <>
              <Box mt={5} mb={2}>
                {t('core.module.variable.text max length')}
              </Box>
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

          {getValuesEdit('variable.type') === VariableInputEnum.select && (
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
  const newVariable = { ...defaultVariable, key: nanoid(), id: '' };
  return newVariable;
};
