import React, { useEffect, useState } from 'react';
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
  Grid,
  FormControl,
  useTheme,
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
import MyIcon from '@/components/Icon';
import { useForm } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import MyModal from '@/components/MyModal';
import MyTooltip from '@/components/MyTooltip';
import { variableTip } from '@fastgpt/global/core/module/template/tip';
import { useTranslation } from 'next-i18next';
import { useToast } from '@/web/common/hooks/useToast';

const VariableEdit = ({
  variables,
  onChange
}: {
  variables: VariableItemType[];
  onChange: (data: VariableItemType[]) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const theme = useTheme();
  const [refresh, setRefresh] = useState(false);

  const VariableTypeList = [
    {
      label: t('core.module.variable.text type'),
      icon: 'settingLight',
      key: VariableInputEnum.input
    },
    {
      label: t('core.module.variable.select type'),
      icon: 'settingLight',
      key: VariableInputEnum.select
    }
  ];

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
    py: '2px',
    borderRadius: 'md',
    _hover: {
      bg: 'myGray.200'
    }
  };

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
          onClick={() => {
            resetEdit({ variable: addVariable() });
            onOpenEdit();
          }}
        >
          +&ensp;{t('common.Add New')}
        </Flex>
      </Flex>
      {variables.length > 0 && (
        <Box mt={2} borderRadius={'lg'} overflow={'hidden'} borderWidth={'1px'} borderBottom="none">
          <TableContainer>
            <Table bg={'white'}>
              <Thead>
                <Tr>
                  <Th>{t('core.module.variable.variable name')}</Th>
                  <Th>{t('core.module.variable.key')}</Th>
                  <Th>{t('common.Require Input')}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {variables.map((item, index) => (
                  <Tr key={item.id}>
                    <Td>{item.label} </Td>
                    <Td>{item.key}</Td>
                    <Td>{item.required ? '✔' : ''}</Td>
                    <Td>
                      <MyIcon
                        mr={3}
                        name={'settingLight'}
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
          <Grid gridTemplateColumns={'repeat(2,130px)'} gridGap={4}>
            {VariableTypeList.map((item) => (
              <Flex
                key={item.key}
                px={4}
                py={1}
                border={theme.borders.base}
                borderRadius={'md'}
                cursor={'pointer'}
                {...(item.key === getValuesEdit('variable.type')
                  ? {
                      bg: 'myWhite.600'
                    }
                  : {
                      _hover: {
                        boxShadow: 'md'
                      },
                      onClick: () => {
                        setValuesEdit('variable.type', item.key);
                        setRefresh(!refresh);
                      }
                    })}
              >
                <MyIcon name={item.icon as any} w={'16px'} />
                <Box ml={3}>{item.label}</Box>
              </Flex>
            ))}
          </Grid>

          {getValuesEdit('variable.type') === VariableInputEnum.input && (
            <>
              <Box mt={5} mb={2}>
                {t('core.module.variable.text max length')}
              </Box>
              <Box>
                <NumberInput max={100} min={1} step={1} position={'relative'}>
                  <NumberInputField
                    {...registerEdit('variable.maxLen', {
                      min: 1,
                      max: 100,
                      valueAsNumber: true
                    })}
                    max={100}
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
                    <MyIcon
                      ml={3}
                      name={'delete'}
                      w={'16px'}
                      cursor={'pointer'}
                      p={2}
                      borderRadius={'lg'}
                      _hover={{ bg: 'red.100' }}
                      onClick={() => removeEnums(i)}
                    />
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
          <Button variant={'base'} mr={3} onClick={onCloseEdit}>
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
