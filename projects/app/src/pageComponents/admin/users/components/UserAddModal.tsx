import { Box, Button, FormControl, FormLabel, Input, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { POST } from '@/web/admin/common/request';
import { AddIcon } from '@chakra-ui/icons';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';

type TFormData = {
  username: string;
  password: string;
};

export default function UserAddModal(props: { data: any; updateData: any }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { data, updateData } = props;
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    defaultValues: data
  });

  const { runAsync: onSubmit, loading: isLoading } = useRequest(
    (formData: TFormData) => {
      return POST(`/proApi/admin/routes/users/addUser`, {
        ...formData,
        password: hashStr(formData.password)
      });
    },
    {
      onSuccess() {
        updateData();
        onClose();
      },
      successToast: '添加成功'
    }
  );

  const onSubmitErr = (err: Record<string, any>) => {
    const val = Object.values(err)[0];
    if (!val) return;
    if (val.message) {
      toast({
        status: 'warning',
        title: val.message,
        duration: 3000,
        isClosable: true
      });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        h="100%"
        leftIcon={<AddIcon boxSize={2} />}
        onClick={() => {
          onOpen();
          reset(data);
        }}
      >
        添加用户
      </Button>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={'添加用户'}
        maxW={['90vw', '700px']}
        footer={
          <>
            <Button variant="whiteBase" onClick={onClose}>
              关闭
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit(onSubmit, onSubmitErr)}
              isLoading={isLoading}
            >
              确定
            </Button>
          </>
        }
      >
        <FormControl>
          <FormLabel htmlFor="username" fontWeight="bold">
            用户名
            {errors && !!errors?.username && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                *必填
              </Box>
            )}
          </FormLabel>
          <Input
            {...register('username', {
              required: 'This is required'
            })}
            id="username"
            variant="outline"
            placeholder="用户名"
          />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="password" fontWeight="bold">
            密码
            {errors && !!errors?.password && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                *必填
              </Box>
            )}
          </FormLabel>
          <Input
            {...register('password', {
              validate: (val) => {
                if (!val) return true;
                if (!checkPasswordRule(val)) {
                  return '密码至少 8 位，且至少包含两种组合：数字、字母或特殊字符';
                }
                return true;
              }
            })}
            variant="outline"
            placeholder="密码至少 8 位，且至少包含两种组合：数字、字母或特殊字符"
          />
        </FormControl>
      </MyModal>
    </>
  );
}
