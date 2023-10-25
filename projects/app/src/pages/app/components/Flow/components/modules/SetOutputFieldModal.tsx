import React, { useMemo, useState } from 'react';
import { Box, Button, ModalHeader, ModalFooter, ModalBody, Flex, Input } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import MyModal from '@/components/MyModal';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import { FlowOutputItemTypeEnum, FlowValueTypeEnum, FlowValueTypeStyle } from '@/constants/flow';
import { useTranslation } from 'react-i18next';
import MySelect from '@/components/Select';
import { FlowOutputItemType } from '@/types/core/app/flow';

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
    label: '任意',
    value: FlowValueTypeEnum.any
  }
];

const SetInputFieldModal = ({
  defaultField,
  onClose,
  onSubmit
}: {
  defaultField: FlowOutputItemType;
  onClose: () => void;
  onSubmit: (data: FlowOutputItemType) => void;
}) => {
  const { t } = useTranslation();
  const { register, getValues, setValue, handleSubmit } = useForm<FlowOutputItemType>({
    defaultValues: defaultField
  });
  const [refresh, setRefresh] = useState(false);

  return (
    <MyModal isOpen={true} onClose={onClose}>
      <ModalHeader display={'flex'} alignItems={'center'}>
        <Avatar src={'/imgs/module/extract.png'} mr={2} w={'20px'} objectFit={'cover'} />
        {t('app.Output Field Settings')}
      </ModalHeader>
      <ModalBody>
        <Flex mt={5} alignItems={'center'}>
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
        <Flex mt={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>字段名</Box>
          <Input
            placeholder="预约字段/sql语句……"
            {...register('label', { required: '字段名不能为空' })}
          />
        </Flex>

        <Flex mt={5} alignItems={'center'}>
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

export default React.memo(SetInputFieldModal);
