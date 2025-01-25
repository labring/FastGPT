import {
  FlowNodeOutputTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Stack,
  Textarea
} from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  CustomFieldConfigType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useToast } from '@fastgpt/web/hooks/useToast';
import React, { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { getNanoid } from '@fastgpt/global/common/string/tools';

const FieldModal = ({
  customFieldConfig,
  defaultValue,
  keys,
  onClose,
  onSubmit
}: {
  customFieldConfig: CustomFieldConfigType;
  defaultValue: FlowNodeOutputItemType;
  keys: string[];
  onClose: () => void;
  onSubmit: (e: { data: FlowNodeOutputItemType; isChangeKey: boolean }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!defaultValue.key;

  const { register, setValue, handleSubmit, watch } = useForm<FlowNodeOutputItemType>({
    defaultValues: defaultValue
  });

  const valueType = watch('valueType');
  // value type select
  const showValueTypeSelect = useMemo(() => {
    if (!customFieldConfig.selectValueTypeList || customFieldConfig.selectValueTypeList.length <= 1)
      return false;

    return true;
  }, [customFieldConfig.selectValueTypeList]);
  const valueTypeSelectList = useMemo(() => {
    if (!customFieldConfig.selectValueTypeList) return [];

    const dataTypeSelectList = Object.values(FlowValueTypeMap)
      .slice(0, -1)
      .map((item) => ({
        label: t(item.label as any),
        value: item.value
      }));

    return dataTypeSelectList.filter((item) =>
      customFieldConfig.selectValueTypeList?.includes(item.value)
    );
  }, [customFieldConfig.selectValueTypeList, t]);

  const onSubmitSuccess = useCallback(
    (data: FlowNodeOutputItemType) => {
      const isChangeKey = defaultValue.key !== data.key;

      if (keys.includes(data.key)) {
        // 只要编辑状态，且未改变key，就不提示
        if (!isEdit || isChangeKey) {
          toast({
            status: 'warning',
            title: t('workflow:field_name_already_exists')
          });
          return;
        }
      }

      data.id = data.id || getNanoid();
      data.key = data?.key?.trim();
      data.label = data.key;

      onSubmit({
        data,
        isChangeKey
      });
      onClose();
    },
    [defaultValue.key, isEdit, keys, onClose, onSubmit, toast, t]
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
      iconSrc="/imgs/workflow/extract.png"
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
              {t('workflow:Variable_name')}
            </FormLabel>
            <Input
              bg={'myGray.50'}
              placeholder="appointment/sql"
              {...register('key', {
                required: true
              })}
            />
          </Flex>
          {customFieldConfig.showDescription && (
            <Flex mt={3} alignItems={'center'}>
              <FormLabel flex={'0 0 70px'}>{t('workflow:input_description')}</FormLabel>
              <Textarea bg={'myGray.50'} {...register('description', {})} />
            </Flex>
          )}
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

export default FieldModal;

export const defaultOutput: FlowNodeOutputItemType = {
  id: '',
  valueType: WorkflowIOValueTypeEnum.string,
  type: FlowNodeOutputTypeEnum.dynamic,
  key: '',
  label: ''
};
