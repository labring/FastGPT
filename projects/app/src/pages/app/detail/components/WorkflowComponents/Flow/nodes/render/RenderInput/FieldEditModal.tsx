import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
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

const FieldModal = ({
  customInputConfig,
  defaultInput,
  keys,
  onClose,
  onSubmit
}: {
  customInputConfig: CustomFieldConfigType;
  defaultInput: FlowNodeInputItemType;
  keys: string[];
  onClose: () => void;
  onSubmit: (e: { data: FlowNodeInputItemType; isChangeKey: boolean }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!defaultInput.key;

  const { register, setValue, handleSubmit, watch } = useForm<FlowNodeInputItemType>({
    defaultValues: defaultInput
  });
  const inputType = FlowNodeInputTypeEnum.reference;

  // value type select
  const showValueTypeSelect = useMemo(() => {
    if (!customInputConfig.selectValueTypeList || customInputConfig.selectValueTypeList.length <= 1)
      return false;
    if (inputType === FlowNodeInputTypeEnum.reference) return true;

    return false;
  }, [customInputConfig.selectValueTypeList, inputType]);
  const valueTypeSelectList = useMemo(() => {
    if (!customInputConfig.selectValueTypeList) return [];

    const dataTypeSelectList = Object.values(FlowValueTypeMap).map((item) => ({
      label: t(item.label as any),
      value: item.value
    }));

    return dataTypeSelectList.filter((item) =>
      customInputConfig.selectValueTypeList?.includes(item.value)
    );
  }, [customInputConfig.selectValueTypeList, t]);
  const valueType = watch('valueType');
  useMount(() => {
    if (
      customInputConfig.selectValueTypeList &&
      customInputConfig.selectValueTypeList.length > 0 &&
      !valueType
    ) {
      setValue('valueType', customInputConfig.selectValueTypeList[0]);
    }
  });

  const onSubmitSuccess = useCallback(
    (data: FlowNodeInputItemType) => {
      const isChangeKey = defaultInput.key !== data.key;

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

      data.key = data?.key?.trim();
      data.label = data.key;

      onSubmit({
        data,
        isChangeKey
      });
      onClose();
    },
    [defaultInput.key, isEdit, keys, onClose, onSubmit, toast, t]
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
      title={isEdit ? t('workflow:edit_input') : t('workflow:add_new_input')}
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
          {customInputConfig.showDescription && (
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

export const defaultInput: FlowNodeInputItemType = {
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  valueType: WorkflowIOValueTypeEnum.string,
  canEdit: true,
  key: '',
  label: ''
};
