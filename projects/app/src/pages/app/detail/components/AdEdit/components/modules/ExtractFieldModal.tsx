import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ModalHeader,
  ModalFooter,
  ModalBody,
  Flex,
  Switch,
  Input
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
          <Input
            placeholder="name/age/sql"
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

export default React.memo(ExtractFieldModal);
