import React, { useState } from 'react';
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
import Avatar from '@/components/Avatar';
import { FlowNodeValTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { useTranslation } from 'next-i18next';
import MySelect from '@/components/Select';

const typeSelectList = [
  {
    label: '字符串',
    value: FlowNodeValTypeEnum.string
  },
  {
    label: '数字',
    value: FlowNodeValTypeEnum.number
  },
  {
    label: '布尔',
    value: FlowNodeValTypeEnum.boolean
  },
  {
    label: '历史记录',
    value: FlowNodeValTypeEnum.chatHistory
  },
  {
    label: '引用内容',
    value: FlowNodeValTypeEnum.datasetQuote
  },
  {
    label: '任意',
    value: FlowNodeValTypeEnum.any
  }
];

export type EditFieldModeType = 'input' | 'output' | 'pluginInput';
export type EditFieldType = {
  key: string;
  label?: string;
  valueType?: `${FlowNodeValTypeEnum}`;
  description?: string;
  required?: boolean;
};

const FieldEditModal = ({
  mode,
  defaultField = {
    label: '',
    key: '',
    description: '',
    valueType: FlowNodeValTypeEnum.string,
    required: false
  },
  onClose,
  onSubmit
}: {
  mode: EditFieldModeType;
  defaultField?: EditFieldType;
  onClose: () => void;
  onSubmit: (data: EditFieldType) => void;
}) => {
  const { t } = useTranslation();
  const { register, getValues, setValue, handleSubmit } = useForm<EditFieldType>({
    defaultValues: defaultField
  });
  const [refresh, setRefresh] = useState(false);

  const title = ['input', 'pluginInput'].includes(mode)
    ? t('app.Input Field Settings')
    : t('app.Output Field Settings');

  return (
    <MyModal
      isOpen={true}
      title={
        <Flex alignItems={'center'}>
          <Avatar src={'/imgs/module/extract.png'} mr={2} w={'20px'} objectFit={'cover'} />
          {title}
        </Flex>
      }
      onClose={onClose}
    >
      <ModalBody minH={'260px'} overflow={'visible'}>
        {mode === 'input' && (
          <Flex alignItems={'center'} mb={5}>
            <Box flex={'0 0 70px'}>必填</Box>
            <Switch {...register('required')} />
          </Flex>
        )}
        <Flex mb={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>字段类型</Box>
          <MySelect
            w={'288px'}
            list={typeSelectList}
            value={getValues('valueType')}
            onchange={(e: string) => {
              const type = e as `${FlowNodeValTypeEnum}`;
              setValue('valueType', type);

              if (
                type === FlowNodeValTypeEnum.chatHistory ||
                type === FlowNodeValTypeEnum.datasetQuote
              ) {
                const label = typeSelectList.find((item) => item.value === type)?.label;
                setValue('label', label);
              }

              setRefresh(!refresh);
            }}
          />
        </Flex>
        <Flex mb={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>字段名</Box>
          <Input
            placeholder="预约字段/sql语句……"
            {...register('label', { required: '字段名不能为空' })}
          />
        </Flex>

        <Flex mb={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>字段 key</Box>
          <Input
            placeholder="appointment/sql"
            {...register('key', { required: '字段 key 不能为空' })}
          />
        </Flex>
        <Flex mb={5} alignItems={'flex-start'}>
          <Box flex={'0 0 70px'}>字段描述</Box>
          <Textarea placeholder="可选" rows={3} {...register('description')} />
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
          取消
        </Button>
        <Button onClick={handleSubmit(onSubmit)}>确认</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(FieldEditModal);
