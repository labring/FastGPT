import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Stack,
  Switch,
  Textarea
} from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import React, { useMemo } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';

const InputTypeConfig = ({
  form,
  isEdit,
  onClose,
  type,
  inputType,
  maxLength,
  max,
  min,
  selectValueTypeList,
  defaultJsonValue,
  isToolInput,
  setIsToolInput,
  valueType,
  defaultValueType,
  onSubmitSuccess,
  onSubmitError
}: {
  // Common fields
  form: UseFormReturn<any>;
  isEdit: boolean;
  onClose: () => void;
  type: 'plugin' | 'formInput';
  inputType: FlowNodeInputTypeEnum;

  maxLength?: number;
  max?: number;
  min?: number;

  selectValueTypeList?: WorkflowIOValueTypeEnum[];
  defaultJsonValue?: string;

  // Plugin-specific fields
  isToolInput?: boolean;
  setIsToolInput?: () => void;
  valueType?: WorkflowIOValueTypeEnum;
  defaultValueType?: WorkflowIOValueTypeEnum;

  // Update methods
  onSubmitSuccess: (data: any, action: 'confirm' | 'continue') => void;
  onSubmitError: (e: Object) => void;
}) => {
  const { t } = useTranslation();

  const { register, setValue, handleSubmit, control } = form;

  const {
    fields: selectEnums,
    append: appendEnums,
    remove: removeEnums
  } = useFieldArray({
    control,
    name: 'list'
  });

  const valueTypeSelectList = Object.values(FlowValueTypeMap).map((item) => ({
    label: t(item.label as any),
    value: item.value
  }));

  const showValueTypeSelect =
    inputType === FlowNodeInputTypeEnum.reference ||
    inputType === FlowNodeInputTypeEnum.customVariable;

  const showRequired = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.addInputParam, FlowNodeInputTypeEnum.customVariable];
    return !list.includes(inputType);
  }, [inputType]);

  const showMaxLenInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.textarea];
    return list.includes(inputType);
  }, [inputType]);

  const showMinMaxInput = useMemo(() => {
    const list = [FlowNodeInputTypeEnum.numberInput];
    return list.includes(inputType);
  }, [inputType]);

  const showDefaultValue = useMemo(() => {
    const list = [
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.switch
    ];

    return list.includes(inputType);
  }, [inputType]);

  return (
    <Stack flex={1} borderLeft={'1px solid #F0F1F6'} justifyContent={'space-between'}>
      <Flex flexDirection={'column'} p={8} gap={4} flex={'1 0 0'} overflow={'auto'}>
        <Flex alignItems={'center'}>
          <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
            {type === 'formInput'
              ? t('common:core.module.input_name')
              : t('common:core.module.Field Name')}
          </FormLabel>
          <Input
            bg={'myGray.50'}
            placeholder="appointment/sql"
            {...register(type === 'formInput' ? 'label' : 'key', {
              required: true
            })}
          />
        </Flex>
        <Flex alignItems={'flex-start'}>
          <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
            {type === 'formInput'
              ? t('common:core.module.input_description')
              : t('workflow:field_description')}
          </FormLabel>
          <Textarea
            bg={'myGray.50'}
            placeholder={t('workflow:field_description_placeholder')}
            rows={3}
            {...register('description', { required: isToolInput ? true : false })}
          />
        </Flex>

        {/* value type */}
        {type === 'plugin' && (
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
              {t('common:core.module.Data Type')}
            </FormLabel>
            {showValueTypeSelect ? (
              <Box flex={1}>
                <MySelect<WorkflowIOValueTypeEnum>
                  list={valueTypeSelectList.filter(
                    (item) => item.value !== WorkflowIOValueTypeEnum.arrayAny
                  )}
                  value={valueType}
                  onchange={(e) => {
                    setValue('valueType', e);
                  }}
                />
              </Box>
            ) : (
              <Box fontSize={'14px'}>{defaultValueType}</Box>
            )}
          </Flex>
        )}
        {showRequired && (
          <Flex alignItems={'center'} minH={'40px'}>
            <FormLabel flex={'1'} fontWeight={'medium'}>
              {t('workflow:field_required')}
            </FormLabel>
            <Switch {...register('required')} />
          </Flex>
        )}

        {/* reference */}
        {inputType === FlowNodeInputTypeEnum.reference && (
          <>
            <Flex alignItems={'center'} minH={'40px'}>
              <FormLabel flex={'1'} fontWeight={'medium'}>
                {t('workflow:field_used_as_tool_input')}
              </FormLabel>
              <Switch
                isChecked={isToolInput}
                onChange={(e) => {
                  setIsToolInput && setIsToolInput();
                  console.log(isToolInput);
                }}
              />
            </Flex>
          </>
        )}

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

        {showDefaultValue && (
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
            {inputType === FlowNodeInputTypeEnum.JSONEditor && (
              <JsonEditor
                bg={'myGray.50'}
                resize
                w={'full'}
                onChange={(e) => {
                  setValue('defaultValue', e);
                }}
                defaultValue={String(defaultJsonValue)}
              />
            )}
            {inputType === FlowNodeInputTypeEnum.switch && <Switch {...register('defaultValue')} />}
          </Flex>
        )}

        {inputType === FlowNodeInputTypeEnum.addInputParam && (
          <>
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 100px'} fontWeight={'medium'}>
                {t('common:core.module.Input Type')}
              </FormLabel>
              <Box fontSize={'14px'}>{t('workflow:only_the_reference_type_is_supported')}</Box>
            </Flex>
            <Box>
              <HStack mb={1}>
                <FormLabel fontWeight={'medium'}>{t('workflow:optional_value_type')}</FormLabel>
                <QuestionTip label={t('workflow:optional_value_type_tip')} />
              </HStack>
              <MultipleSelect<WorkflowIOValueTypeEnum>
                list={valueTypeSelectList}
                bg={'myGray.50'}
                value={selectValueTypeList || []}
                onSelect={(e) => {
                  setValue('customInputConfig.selectValueTypeList', e);
                }}
              />
            </Box>
          </>
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
                        onChange: (e: any) => {
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
          onClick={handleSubmit(
            (data: FlowNodeInputItemType) => onSubmitSuccess(data, 'confirm'),
            onSubmitError
          )}
          w={20}
        >
          {t('common:common.Confirm')}
        </Button>
        {!isEdit && (
          <Button
            fontWeight={'medium'}
            onClick={handleSubmit(
              (data: FlowNodeInputItemType) => onSubmitSuccess(data, 'continue'),
              onSubmitError
            )}
            w={20}
          >
            {t('common:common.Continue_Adding')}
          </Button>
        )}
      </Flex>
    </Stack>
  );
};

export default React.memo(InputTypeConfig);
