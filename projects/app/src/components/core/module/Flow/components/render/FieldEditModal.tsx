import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ModalFooter,
  ModalBody,
  Flex,
  Switch,
  Input,
  Textarea
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@/components/MyModal';
import { ModuleDataTypeEnum } from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';
import MySelect from '@/components/Select';
import { FlowValueTypeMap } from '@/web/core/modules/constants/dataType';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { EditInputFieldMap, EditNodeFieldType } from '@fastgpt/global/core/module/node/type.d';
import { useToast } from '@/web/common/hooks/useToast';

const FieldEditModal = ({
  editField = {
    key: true,
    name: true,
    description: true,
    dataType: true
  },
  defaultField,
  keys = [],
  onClose,
  onSubmit
}: {
  editField?: EditInputFieldMap;
  defaultField: EditNodeFieldType;
  keys: string[];
  onClose: () => void;
  onSubmit: (e: { data: EditNodeFieldType; changeKey: boolean }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isCreate = useMemo(() => !defaultField.key, [defaultField.key]);

  const inputTypeList = [
    {
      label: t('core.module.inputType.target'),
      value: FlowNodeInputTypeEnum.target,
      valueType: ModuleDataTypeEnum.string
    },
    {
      label: t('core.module.inputType.input'),
      value: FlowNodeInputTypeEnum.input,
      valueType: ModuleDataTypeEnum.string
    },
    {
      label: t('core.module.inputType.textarea'),
      value: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleDataTypeEnum.string
    },
    {
      label: t('core.module.inputType.switch'),
      value: FlowNodeInputTypeEnum.switch,
      valueType: ModuleDataTypeEnum.boolean
    },
    {
      label: t('core.module.inputType.selectDataset'),
      value: FlowNodeInputTypeEnum.selectDataset,
      valueType: ModuleDataTypeEnum.selectDataset
    }
  ];
  const dataTypeSelectList = Object.values(FlowValueTypeMap)
    .slice(0, -2)
    .map((item) => ({
      label: t(item.label),
      value: item.value
    }));

  const { register, getValues, setValue, handleSubmit } = useForm<EditNodeFieldType>({
    defaultValues: defaultField
  });
  const [refresh, setRefresh] = useState(false);

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/module/extract.png"
      title={t('app.Input Field Settings')}
      onClose={onClose}
    >
      <ModalBody overflow={'visible'}>
        {/* input type select: target, input, textarea.... */}
        {editField.inputType && (
          <Flex alignItems={'center'} mb={5}>
            <Box flex={'0 0 70px'}>{t('core.module.Input Type')}</Box>
            <MySelect
              w={'288px'}
              list={inputTypeList}
              value={getValues('inputType')}
              onchange={(e: string) => {
                const type = e as `${FlowNodeInputTypeEnum}`;
                const selectedItem = inputTypeList.find((item) => item.value === type);
                setValue('inputType', type);
                setValue('valueType', selectedItem?.valueType);

                if (type === FlowNodeInputTypeEnum.selectDataset) {
                  setValue('label', selectedItem?.label);
                }

                setRefresh(!refresh);
              }}
            />
          </Flex>
        )}
        {editField.required && (
          <Flex alignItems={'center'} mb={5}>
            <Box flex={'0 0 70px'}>{t('common.Require Input')}</Box>
            <Switch {...register('required')} />
          </Flex>
        )}
        {editField.dataType && (
          <Flex mb={5} alignItems={'center'}>
            <Box flex={'0 0 70px'}>{t('core.module.Data Type')}</Box>
            <MySelect
              w={'288px'}
              list={dataTypeSelectList}
              value={getValues('valueType')}
              onchange={(e: string) => {
                const type = e as `${ModuleDataTypeEnum}`;
                setValue('valueType', type);

                if (
                  type === ModuleDataTypeEnum.chatHistory ||
                  type === ModuleDataTypeEnum.datasetQuote
                ) {
                  const label = dataTypeSelectList.find((item) => item.value === type)?.label;
                  setValue('label', label);
                }

                setRefresh(!refresh);
              }}
            />
          </Flex>
        )}
        {editField.name && (
          <Flex mb={5} alignItems={'center'}>
            <Box flex={'0 0 70px'}>{t('core.module.Field Name')}</Box>
            <Input placeholder="预约字段/sql语句……" {...register('label', { required: true })} />
          </Flex>
        )}
        {editField.key && (
          <Flex mb={5} alignItems={'center'}>
            <Box flex={'0 0 70px'}>{t('core.module.Field key')}</Box>
            <Input placeholder="appointment/sql" {...register('key', { required: true })} />
          </Flex>
        )}
        {editField.description && (
          <Flex mb={5} alignItems={'flex-start'}>
            <Box flex={'0 0 70px'}>{t('core.module.Field Description')}</Box>
            <Textarea placeholder={t('common.choosable')} rows={3} {...register('description')} />
          </Flex>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          onClick={handleSubmit((data) => {
            if (!data.key) return;
            if (isCreate && keys.includes(data.key)) {
              return toast({
                status: 'warning',
                title: t('core.module.edit.Field Already Exist')
              });
            }
            onSubmit({
              data,
              changeKey: !keys.includes(data.key)
            });
          })}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);
