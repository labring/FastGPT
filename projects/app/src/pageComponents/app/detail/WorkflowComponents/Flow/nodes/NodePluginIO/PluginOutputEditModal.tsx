import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Stack,
  Textarea,
  Switch
} from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  CustomFieldConfigType,
  FlowNodeInputItemType
} from '@fastgpt/global/core/workflow/type/io';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useToast } from '@fastgpt/web/hooks/useToast';
import React, { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useMount } from 'ahooks';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const PluginOutputEditModal = ({
  customOutputConfig,
  defaultOutput,
  keys,
  onClose,
  onSubmit
}: {
  customOutputConfig: CustomFieldConfigType;
  defaultOutput: FlowNodeInputItemType;
  keys: string[];
  onClose: () => void;
  onSubmit: (e: { data: FlowNodeInputItemType; isChangeKey: boolean }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!defaultOutput.key;

  const { register, setValue, handleSubmit, watch } = useForm<FlowNodeInputItemType>({
    defaultValues: { ...defaultOutput, isToolOutput: defaultOutput.isToolOutput !== false }
  });
  const inputType = FlowNodeInputTypeEnum.reference;

  // value type select
  const showValueTypeSelect = useMemo(() => {
    if (
      !customOutputConfig.selectValueTypeList ||
      customOutputConfig.selectValueTypeList.length <= 1
    )
      return false;
    if (inputType === FlowNodeInputTypeEnum.reference) return true;

    return false;
  }, [customOutputConfig.selectValueTypeList, inputType]);
  const valueTypeSelectList = useMemo(() => {
    if (!customOutputConfig.selectValueTypeList) return [];

    const dataTypeSelectList = Object.values(FlowValueTypeMap).map((item) => ({
      label: t(item.label as any),
      value: item.value
    }));

    return dataTypeSelectList.filter((item) =>
      customOutputConfig.selectValueTypeList?.includes(item.value)
    );
  }, [customOutputConfig.selectValueTypeList, t]);

  const valueType = watch('valueType');

  useMount(() => {
    if (
      customOutputConfig.selectValueTypeList &&
      customOutputConfig.selectValueTypeList.length > 0 &&
      !valueType
    ) {
      setValue('valueType', customOutputConfig.selectValueTypeList[0]);
    }
  });

  const onSubmitSuccess = useCallback(
    (data: FlowNodeInputItemType) => {
      const isChangeKey = defaultOutput.key !== data.key;

      if (keys.includes(data.key)) {
        if (!isEdit || isChangeKey) {
          toast({
            status: 'warning',
            title: t('workflow:field_name_already_exists')
          });
          return;
        }
      }

      data.key = data?.key?.trim();
      data.label = data.key;
      data.required = true;

      onSubmit({
        data,
        isChangeKey
      });
      onClose();
    },
    [defaultOutput.key, isEdit, keys, onClose, onSubmit, toast, t]
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
      iconSrc="core/workflow/template/pluginOutput"
      title={isEdit ? t('workflow:edit_output') : t('workflow:add_new_output')}
      overflow={'unset'}
    >
      <ModalBody w={'100%'} overflow={'auto'} display={'flex'} flexDirection={['column', 'row']}>
        <Stack w={'100%'} spacing={3}>
          {showValueTypeSelect && (
            <Flex alignItems={'center'}>
              <FormLabel flex={'0 0 70px'}>{t('common:core.module.Data Type')}</FormLabel>
              <Box flex={1}>
                <MySelect<WorkflowIOValueTypeEnum>
                  w={'full'}
                  list={valueTypeSelectList.filter(
                    (item) => item.value !== WorkflowIOValueTypeEnum.arrayAny
                  )}
                  value={valueType}
                  onchange={(e) => {
                    setValue('valueType', e);
                  }}
                />
              </Box>
            </Flex>
          )}
          {/* key */}
          <Flex mt={3} alignItems={'center'}>
            <FormLabel flex={'0 0 70px'} required>
              {t('common:core.module.Field Name')}
            </FormLabel>
            <Input
              bg={'myGray.50'}
              placeholder="appointment/sql"
              {...register('key', {
                required: true
              })}
            />
          </Flex>

          <Flex mt={3} alignItems={'center'}>
            <FormLabel flex={'0 0 70px'}>{t('workflow:input_description')}</FormLabel>
            <Textarea bg={'myGray.50'} {...register('description', {})} />
          </Flex>
          <Flex mt={3} alignItems={'center'}>
            <FormLabel>{t('workflow:is_tool_output_label')}</FormLabel>
            <QuestionTip label={t('workflow:plugin_output_tool')} ml={1} />
            <Box flex={1} />
            <Switch {...register('isToolOutput')} />
          </Flex>
        </Stack>
      </ModalBody>
      <ModalFooter gap={3}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button onClick={handleSubmit(onSubmitSuccess, onSubmitError)}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default PluginOutputEditModal;

export const defaultOutput: FlowNodeInputItemType = {
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  valueType: WorkflowIOValueTypeEnum.string,
  canEdit: true,
  key: '',
  label: '',
  isToolOutput: true
};
