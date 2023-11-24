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

export type EditFieldModeType = 'input' | 'output' | 'pluginInput';
export type EditFieldType = {
  type?: `${FlowNodeInputTypeEnum}`; // input type
  key: string;
  label?: string;
  valueType?: `${ModuleDataTypeEnum}`;
  description?: string;
  required?: boolean;
  createSign?: boolean;
};

const FieldEditModal = ({
  mode,
  defaultField,
  onClose,
  onSubmit
}: {
  mode: EditFieldModeType;
  defaultField: EditFieldType;
  onClose: () => void;
  onSubmit: (data: EditFieldType) => void;
}) => {
  const { t } = useTranslation();
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

  const { register, getValues, setValue, handleSubmit } = useForm<EditFieldType>({
    defaultValues: defaultField
  });
  const [refresh, setRefresh] = useState(false);

  const title = ['input', 'pluginInput'].includes(mode)
    ? t('app.Input Field Settings')
    : t('app.Output Field Settings');

  const showValueTypeSelect = useMemo(() => {
    return getValues('type') === FlowNodeInputTypeEnum.target || mode === 'output';
  }, [getValues, mode, refresh]);

  return (
    <MyModal isOpen={true} iconSrc="/imgs/module/extract.png" title={title} onClose={onClose}>
      <ModalBody minH={'260px'} overflow={'visible'}>
        {/* input type select: target, input, textarea.... */}
        {mode === 'pluginInput' && (
          <Flex alignItems={'center'} mb={5}>
            <Box flex={'0 0 70px'}>{t('core.module.Input Type')}</Box>
            <MySelect
              w={'288px'}
              list={inputTypeList}
              value={getValues('type')}
              onchange={(e: string) => {
                const type = e as `${FlowNodeInputTypeEnum}`;
                const selectedItem = inputTypeList.find((item) => item.value === type);
                setValue('type', type);
                setValue('valueType', selectedItem?.valueType);

                if (type === FlowNodeInputTypeEnum.selectDataset) {
                  setValue('label', selectedItem?.label);
                }

                setRefresh(!refresh);
              }}
            />
          </Flex>
        )}
        {['input', 'pluginInput'].includes(mode) && (
          <Flex alignItems={'center'} mb={5}>
            <Box flex={'0 0 70px'}>{t('common.Require Input')}</Box>
            <Switch {...register('required')} />
          </Flex>
        )}
        {showValueTypeSelect && (
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

        <Flex mb={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>{t('core.module.Field Name')}</Box>
          <Input
            placeholder="预约字段/sql语句……"
            {...register('label', { required: '字段名不能为空' })}
          />
        </Flex>
        <Flex mb={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>{t('core.module.Field key')}</Box>
          <Input
            placeholder="appointment/sql"
            {...register('key', { required: '字段 key 不能为空' })}
          />
        </Flex>
        <Flex mb={5} alignItems={'flex-start'}>
          <Box flex={'0 0 70px'}>{t('core.module.Field Description')}</Box>
          <Textarea placeholder="可选" rows={3} {...register('description')} />
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button onClick={handleSubmit(onSubmit)}>{t('common.Confirm')}</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);

export const defaultInputField: EditFieldType = {
  label: '',
  key: '',
  description: '',
  type: FlowNodeInputTypeEnum.target,
  valueType: ModuleDataTypeEnum.string,
  required: true,
  createSign: true
};
export const defaultOutputField: EditFieldType = {
  label: '',
  key: '',
  description: '',
  valueType: ModuleDataTypeEnum.string,
  required: true,
  createSign: true
};
