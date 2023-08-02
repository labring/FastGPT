import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ModalHeader,
  ModalFooter,
  ModalBody,
  Flex,
  Switch,
  Input,
  FormControl
} from '@chakra-ui/react';
import type { ContextExtractAgentItemType } from '@/types/app';
import { useForm } from 'react-hook-form';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import MyModal from '@/components/MyModal';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';

const ExtractFieldModal = ({
  defaultField = {
    desc: '',
    key: '',
    required: true
  },
  onClose,
  onSubmit
}: {
  defaultField?: ContextExtractAgentItemType;
  onClose: () => void;
  onSubmit: (data: ContextExtractAgentItemType) => void;
}) => {
  const { register, handleSubmit } = useForm<ContextExtractAgentItemType>({
    defaultValues: defaultField
  });
  const isEdit = useMemo(() => !!defaultField.key, [defaultField]);

  return (
    <MyModal isOpen={true} onClose={onClose}>
      <ModalHeader display={'flex'} alignItems={'center'}>
        <Avatar src={'/imgs/module/extract.png'} mr={2} w={'20px'} objectFit={'cover'} />
        提取字段配置
      </ModalHeader>
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 70px'}>必填</Box>
          <Switch {...register('required')} />
        </Flex>
        <Flex mt={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>字段描述</Box>
          <Input
            placeholder="姓名/年龄/sql语句……"
            {...register('desc', { required: '字段描述不能为空' })}
          />
        </Flex>
        <Flex mt={5} alignItems={'center'}>
          <Box flex={'0 0 70px'}>字段 key</Box>
          <MyTooltip label={isEdit ? '不支持修改 key' : ''} shouldWrapChildren={false}>
            <Input
              isDisabled={isEdit}
              placeholder="name/age/sql"
              {...register('key', { required: '字段 key 不能为空' })}
            />
          </MyTooltip>
        </Flex>
        <Box mt={1} pl={'70px'} color={'myGray.600'} fontSize={'sm'}>
          注意: key 字段创建后无法修改
        </Box>
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

export default React.memo(ExtractFieldModal);
