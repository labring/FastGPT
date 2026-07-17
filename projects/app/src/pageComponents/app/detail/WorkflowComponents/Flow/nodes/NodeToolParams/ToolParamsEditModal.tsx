import { toolValueTypeList } from '@fastgpt/global/core/workflow/constants';
import { Box, Button, Flex, Input, Switch, Textarea } from '@chakra-ui/react';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { parseToolParamJsonSchema } from '@fastgpt/global/core/app/jsonschema';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import React, { useCallback, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { defaultEditFormData } from '../render/RenderToolInput/EditFieldModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { z } from 'zod';
import { toolParamKeyReg } from './utils';

const customValueType = 'custom' as const;

const ToolParamsEditModal = ({
  defaultValue = defaultEditFormData,
  nodeId,
  onClose
}: {
  defaultValue: FlowNodeInputItemType;
  nodeId: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const { register, setValue, handleSubmit, control, getValues, trigger } =
    useForm<FlowNodeInputItemType>({
      defaultValues: defaultValue
    });
  const valueType = useWatch({ control, name: 'valueType' });
  const [isCustomSchema, setIsCustomSchema] = useState(
    !!defaultValue.customJsonSchema || defaultValue.valueType === WorkflowIOValueTypeEnum.object
  );
  const [isCustomSchemaInvalid, setIsCustomSchemaInvalid] = useState(false);
  const [customSchemaInput, setCustomSchemaInput] = useState(() => {
    if (!defaultValue.key) return '';

    const schema =
      defaultValue.customJsonSchema ??
      (defaultValue.valueType === WorkflowIOValueTypeEnum.object
        ? {
            type: 'object',
            description:
              defaultValue.toolDescription ?? defaultValue.description ?? defaultValue.key,
            properties: {}
          }
        : undefined);
    if (!schema) return '';

    return JSON.stringify(schema, null, 2);
  });

  const valueTypeList = useMemo<
    { label: string; value: WorkflowIOValueTypeEnum | typeof customValueType }[]
  >(
    () => [
      ...toolValueTypeList.filter((item) => item.value !== WorkflowIOValueTypeEnum.object),
      {
        label: t('workflow:tool_params.custom_type'),
        value: customValueType
      }
    ],
    [t]
  );

  const showSubmitError = useCallback(
    (error: unknown) => {
      const zodMessage = error instanceof z.ZodError ? error.issues[0]?.message : undefined;
      const message = zodMessage
        ? t(zodMessage as any)
        : error instanceof Error
          ? error.message
          : t('common:plugin.Invalid Schema');
      toast({
        status: 'error',
        title: message
      });
    },
    [t, toast]
  );

  const { run: onClickSubmit } = useRequest(
    async (e: FlowNodeInputItemType, customParam?: ReturnType<typeof parseToolParamJsonSchema>) => {
      const key = e.key.trim();
      const toolDescription = customParam?.description ?? e.toolDescription;

      const inputConfig: FlowNodeInputItemType = {
        ...e,
        key,
        label: key,
        description: toolDescription,
        toolDescription,
        valueType: customParam?.valueType ?? e.valueType,
        customJsonSchema: customParam?.schema
      };
      const { customJsonSchema: _customJsonSchema, ...outputConfig } = inputConfig;
      if (defaultValue.key) {
        // edit
        onChangeNode({
          nodeId,
          type: 'replaceInput',
          key: defaultValue.key,
          value: inputConfig
        });
        onChangeNode({
          nodeId,
          type: 'replaceOutput',
          key: defaultValue.key,
          value: {
            ...outputConfig,
            id: key,
            label: key,
            type: FlowNodeOutputTypeEnum.static
          }
        });
      } else {
        // create
        onChangeNode({
          nodeId,
          type: 'addInput',
          value: {
            ...inputConfig
          }
        });
        onChangeNode({
          nodeId,
          type: 'addOutput',
          value: {
            ...outputConfig,
            id: key,
            label: key,
            type: FlowNodeOutputTypeEnum.static
          }
        });
      }
      onClose();
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  const onClickCustomSubmit = useCallback(async () => {
    if (!(await trigger('key'))) return;

    try {
      const customParam = parseToolParamJsonSchema(customSchemaInput);
      onClickSubmit(getValues(), customParam);
    } catch (error) {
      setIsCustomSchemaInvalid(true);
      showSubmitError(error);
    }
  }, [customSchemaInput, getValues, onClickSubmit, showSubmitError, trigger]);

  const onClickSubmitError = useCallback(
    (e: object) => {
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

  const showEnumInput = useMemo(() => {
    return !(
      isCustomSchema ||
      valueType === WorkflowIOValueTypeEnum.boolean ||
      valueType === WorkflowIOValueTypeEnum.arrayBoolean
    );
  }, [isCustomSchema, valueType]);

  return (
    <MyModal
      isOpen
      title={t('workflow:tool_field')}
      onClose={onClose}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            onClick={
              isCustomSchema
                ? onClickCustomSubmit
                : handleSubmit((data) => onClickSubmit(data), onClickSubmitError)
            }
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Box>
        <Flex alignItems={'center'} mb={5}>
          <FormLabel flex={'0 0 80px'}>{t('workflow:field_required')}</FormLabel>
          <Switch {...register('required')} />
        </Flex>
        <Flex alignItems={'center'} mb={5}>
          <FormLabel flex={'0 0 80px'}>{t('common:core.module.Data Type')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect<WorkflowIOValueTypeEnum | typeof customValueType>
              bg={'white'}
              list={valueTypeList}
              value={isCustomSchema ? customValueType : valueType}
              onChange={(value) => {
                if (value === customValueType) {
                  setIsCustomSchema(true);
                  return;
                }
                setIsCustomSchema(false);
                setIsCustomSchemaInvalid(false);
                setValue('valueType', value);
              }}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} mb={5}>
          <FormLabel flex={'0 0 80px'} required>
            <Flex alignItems={'center'}>
              {t('workflow:tool_params.params_name')}
              <QuestionTip ml={1} label={t('workflow:tool_params.params_name_tip')} />
            </Flex>
          </FormLabel>
          <Input
            bg={'white'}
            {...register('key', {
              required: true,
              pattern: {
                value: toolParamKeyReg,
                message: t('workflow:tool_params.params_name_tip')
              }
            })}
            placeholder={t('workflow:tool_params.params_name_placeholder')}
          />
        </Flex>
        {isCustomSchema ? (
          <Box>
            <Flex alignItems={'center'} mb={2}>
              <FormLabel required>JSON Schema</FormLabel>
              <QuestionTip label={t('workflow:tool_params.custom_schema_tip')} />
            </Flex>
            <JsonEditor
              value={customSchemaInput}
              onChange={(value) => {
                setCustomSchemaInput(value);
                setIsCustomSchemaInvalid(false);
              }}
              placeholder={t('workflow:tool_params.custom_schema_placeholder')}
              defaultHeight={160}
              bg={'white'}
              isInvalid={isCustomSchemaInvalid}
              resize
            />
          </Box>
        ) : (
          <>
            <Flex alignItems={'center'} mb={showEnumInput ? 5 : 0}>
              <FormLabel flex={'0 0 80px'} required>
                {t('workflow:tool_params.params_description')}
              </FormLabel>
              <Input
                bg={'white'}
                {...register('toolDescription', {
                  required: true
                })}
                placeholder={t('workflow:tool_params.params_description_placeholder')}
              />
            </Flex>
          </>
        )}
        {showEnumInput && (
          <Box>
            <Flex alignItems={'center'} mb={2}>
              <FormLabel>{t('workflow:tool_params.enum_values')}</FormLabel>
              <QuestionTip label={t('workflow:tool_params.enum_values_tip')} />
            </Flex>
            <Textarea
              bg={'white'}
              {...register('enum')}
              placeholder={t('workflow:tool_params.enum_placeholder')}
            />
          </Box>
        )}
      </Box>
    </MyModal>
  );
};

export default React.memo(ToolParamsEditModal);
