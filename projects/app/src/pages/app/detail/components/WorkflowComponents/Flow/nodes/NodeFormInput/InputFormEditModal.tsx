import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Switch,
  Textarea
} from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { useFieldArray, useForm } from 'react-hook-form';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { useToast } from '@fastgpt/web/hooks/useToast';

export const defaultFormInput = {
  type: FlowNodeInputTypeEnum.input,
  label: '',
  value: '',
  valueType: WorkflowIOValueTypeEnum.string,
  required: false
};

const InputFormEditModal = ({
  defaultValue,
  onClose,
  onSubmit
}: {
  defaultValue: UserInputFormItemType;
  onClose: () => void;
  onSubmit: (data: UserInputFormItemType) => void;
}) => {
  const isEdit = !!defaultValue.label;
  const { t } = useTranslation();
  const { toast } = useToast();

  const { register, setValue, handleSubmit, watch, control, reset } = useForm({
    defaultValues: {
      ...defaultValue,
      list: defaultValue.list?.length ? defaultValue.list : [{ label: '', value: '' }]
    }
  });

  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control,
    name: 'list'
  });

  const inputType = watch('type') || FlowNodeInputTypeEnum.input;

  const maxLength = watch('maxLength');
  const max = watch('max');
  const min = watch('min');

  const inputTypeList = [
    {
      icon: 'core/workflow/inputType/input',
      label: t('common:core.workflow.inputType.input'),
      value: FlowNodeInputTypeEnum.input,
      defaultValueType: WorkflowIOValueTypeEnum.string
    },
    {
      icon: 'core/workflow/inputType/textarea',
      label: t('common:core.workflow.inputType.textarea'),
      value: FlowNodeInputTypeEnum.textarea,
      defaultValueType: WorkflowIOValueTypeEnum.string
    },
    {
      icon: 'core/workflow/inputType/numberInput',
      label: t('common:core.workflow.inputType.number input'),
      value: FlowNodeInputTypeEnum.numberInput,
      defaultValueType: WorkflowIOValueTypeEnum.number
    },
    {
      icon: 'core/workflow/inputType/option',
      label: t('common:core.workflow.inputType.select'),
      value: FlowNodeInputTypeEnum.select,
      defaultValueType: WorkflowIOValueTypeEnum.string
    }
  ];

  const showMaxLenInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.textarea];
    return list.includes(inputType);
  }, [inputType]);
  const showMinMaxInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.numberInput];
    return list.includes(inputType);
  }, [inputType]);

  const onSubmitSuccess = useCallback(
    (data: UserInputFormItemType, action: 'confirm' | 'continue') => {
      if (action === 'confirm') {
        onSubmit(data);
        onClose();
      } else if (action === 'continue') {
        onSubmit(data);
        toast({
          status: 'success',
          title: t('common:common.Add Success')
        });
        reset(defaultFormInput);
      }
    },
    [toast, t, reset, onSubmit, onClose, defaultFormInput]
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
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="file/fill/manual"
      title={isEdit ? t('workflow:edit_input') : t('workflow:add_new_input')}
      maxW={['90vw', '878px']}
      w={'100%'}
      isCentered
    >
      <Flex h={'494px'}>
        <Stack gap={4} p={8}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'}>
            {t('common:core.module.Input Type')}
          </FormLabel>
          <Flex flexDirection={'column'} gap={4}>
            <Box display={'grid'} gridTemplateColumns={'repeat(2, 1fr)'} gap={4}>
              {inputTypeList.map((item) => {
                const isSelected = inputType === item.value;
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
                    <Box as="span" color={isSelected ? 'myGray.900' : 'inherit'} pr={4}>
                      {item.label}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Flex>
        </Stack>
        <Stack flex={1} borderLeft={'1px solid #F0F1F6'} justifyContent={'space-between'}>
          <Flex flexDirection={'column'} p={8} gap={4} flex={'1 0 0'} overflow={'auto'}>
            <Flex alignItems={'center'} position={'relative'}>
              <Box position={'absolute'} left={-2} top={'-1px'} color={'red.600'}>
                *
              </Box>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.input_name')}
              </FormLabel>
              <Input
                bg={'myGray.50'}
                placeholder="appointment/sql"
                {...register('label', {
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'flex-start'}>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.input_description')}
              </FormLabel>
              <Textarea
                bg={'myGray.50'}
                placeholder={t('common:core.module.input_description_placeholder')}
                rows={3}
                {...register('description')}
              />
            </Flex>
            <Flex alignItems={'center'} minH={'40px'}>
              <FormLabel flex={'1'} fontWeight={'medium'}>
                {t('workflow:field_required')}
              </FormLabel>
              <Switch {...register('required')} />
            </Flex>
            {showMaxLenInput && (
              <Flex alignItems={'center'}>
                <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                  {t('common:core.module.Max Length')}
                </FormLabel>
                <MyNumberInput
                  flex={'1 0 0'}
                  bg={'myGray.50'}
                  placeholder={t('common:core.module.Max Length placeholder')}
                  value={maxLength}
                  onChange={(e) => {
                    // @ts-ignore
                    setValue('maxLength', e || '');
                  }}
                />
              </Flex>
            )}
            {showMinMaxInput && (
              <>
                <Flex alignItems={'center'}>
                  <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                    {t('common:core.module.Max Value')}
                  </FormLabel>
                  <MyNumberInput
                    flex={'1 0 0'}
                    bg={'myGray.50'}
                    value={max}
                    onChange={(e) => {
                      // @ts-ignore
                      setValue('max', e || '');
                    }}
                  />
                </Flex>
                <Flex alignItems={'center'}>
                  <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                    {t('common:core.module.Min Value')}
                  </FormLabel>
                  <MyNumberInput
                    flex={'1 0 0'}
                    bg={'myGray.50'}
                    value={min}
                    onChange={(e) => {
                      // @ts-ignore
                      setValue('min', e || '');
                    }}
                  />
                </Flex>
              </>
            )}
            {inputType !== FlowNodeInputTypeEnum.select && (
              <Flex alignItems={'center'} minH={'40px'}>
                <FormLabel
                  flex={inputType === FlowNodeInputTypeEnum.switch ? 1 : '0 0 100px'}
                  fontWeight={'medium'}
                >
                  {t('common:core.module.Default Value')}
                </FormLabel>
                {inputType === FlowNodeInputTypeEnum.numberInput && (
                  <Input
                    bg={'myGray.50'}
                    max={max}
                    min={min}
                    type={'number'}
                    {...register('defaultValue')}
                  />
                )}
                {inputType === FlowNodeInputTypeEnum.input && (
                  <Input bg={'myGray.50'} maxLength={maxLength} {...register('defaultValue')} />
                )}
                {inputType === FlowNodeInputTypeEnum.textarea && (
                  <Textarea bg={'myGray.50'} maxLength={maxLength} {...register('defaultValue')} />
                )}
              </Flex>
            )}
            {inputType === FlowNodeInputTypeEnum.select && (
              <>
                <Flex flexDirection={'column'} gap={4}>
                  {selectEnums.map((item, i) => (
                    <Flex key={item.id} alignItems={'center'}>
                      <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                        {`${t('common:core.module.variable.variable options')} ${i + 1}`}
                      </FormLabel>
                      <FormControl>
                        <Input
                          fontSize={'12px'}
                          bg={'myGray.50'}
                          placeholder={`${t('common:core.module.variable.variable options')} ${i + 1}`}
                          {...register(`list.${i}.label`, {
                            required: true,
                            onChange: (e) => {
                              setValue(`list.${i}.value`, e.target.value);
                            }
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
                </Flex>
                <Button
                  variant={'whiteBase'}
                  leftIcon={<MyIcon name={'common/addLight'} w={'16px'} />}
                  onClick={() => appendEnums({ label: '', value: '' })}
                  fontWeight={'medium'}
                  fontSize={'12px'}
                  w={'24'}
                  py={2}
                >
                  {t('common:core.module.variable add option')}
                </Button>
              </>
            )}
          </Flex>
          <Flex justify={'flex-end'} gap={3} pb={8} pr={8}>
            <Button variant={'whiteBase'} fontWeight={'medium'} onClick={onClose} w={20}>
              {t('common:common.Close')}
            </Button>
            <Button
              variant={'primaryOutline'}
              fontWeight={'medium'}
              onClick={handleSubmit((data) => onSubmitSuccess(data, 'confirm'), onSubmitError)}
              w={20}
            >
              {t('common:common.Confirm')}
            </Button>
            {!isEdit && (
              <Button
                fontWeight={'medium'}
                onClick={handleSubmit((data) => onSubmitSuccess(data, 'continue'), onSubmitError)}
                w={20}
              >
                {t('common:common.Continue_Adding')}
              </Button>
            )}
          </Flex>
        </Stack>
      </Flex>
    </MyModal>
  );
};

export default React.memo(InputFormEditModal);
