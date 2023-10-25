import React, { useState } from 'react';
import { Box, Button, ModalFooter, ModalBody, Flex, Switch, Input } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@/components/MyModal';
import Avatar from '@/components/Avatar';
import { FlowValueTypeEnum } from '@/constants/flow';
import { useTranslation } from 'react-i18next';
import MySelect from '@/components/Select';

const typeSelectList = [
  {
    label: '字符串',
    value: FlowValueTypeEnum.string
  },
  {
    label: '数字',
    value: FlowValueTypeEnum.number
  },
  {
    label: '布尔',
    value: FlowValueTypeEnum.boolean
  },
  {
    label: '历史记录',
    value: FlowValueTypeEnum.chatHistory
  },
  {
    label: '引用内容',
    value: FlowValueTypeEnum.datasetQuote
  },
  {
    label: '任意',
    value: FlowValueTypeEnum.any
  }
];

export type EditFieldType = {
  label?: string;
  key: string;
  valueType?: `${FlowValueTypeEnum}`;
  required?: boolean;
};

const FieldEditModal = ({
  type,
  defaultField = {
    label: '',
    key: '',
    valueType: FlowValueTypeEnum.string,
    required: false
  },
  onClose,
  onSubmit
}: {
  type: 'input' | 'output';
  defaultField?: EditFieldType;
  onClose: () => void;
  onSubmit: (data: EditFieldType) => void;
}) => {
  const { t } = useTranslation();
  const { register, getValues, setValue, handleSubmit } = useForm<EditFieldType>({
    defaultValues: defaultField
  });
  const [refresh, setRefresh] = useState(false);

  return (
    <MyModal
      isOpen={true}
      title={
        <Flex alignItems={'center'}>
          <Avatar src={'/imgs/module/extract.png'} mr={2} w={'20px'} objectFit={'cover'} />
          {type === 'input' ? t('app.Input Field Settings') : t('app.Output Field Settings')}
        </Flex>
      }
      onClose={onClose}
    >
      <ModalBody minH={'260px'} overflow={'visible'}>
        {type === 'input' && (
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
            onchange={(e: any) => {
              setValue('valueType', e);
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
