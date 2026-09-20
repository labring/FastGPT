import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Radio,
  RadioGroup,
  useDisclosure
} from '@chakra-ui/react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { POST } from '@/web/admin/common/request';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
import { isAccountCancellationAnonymizedUsername } from '@fastgpt/global/support/user/account/cancellation/utils';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

type TFormData = {
  username: string;
  password: string;
  status: string;
};

export default function UserEditModal(props: { data: any; getData: any }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { data, getData } = props;
  const { toast } = useToast();

  const { register, handleSubmit, reset } = useForm({
    defaultValues: data
  });

  const { runAsync: onSubmit, loading } = useRequest(
    async (formData: TFormData) => {
      return POST(`/proApi/admin/routes/users/updateUser`, {
        _id: data._id,
        username: formData.username,
        status: formData.status,
        password: formData.password ? hashStr(formData.password) : undefined
      });
    },
    {
      successToast: '更新成功',
      onSuccess() {
        getData();
        onClose();
      }
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

  const { runAsync: onDeleteUser } = useRequest(
    () =>
      POST(`/proApi/admin/routes/users/delete`, {
        username: data.username
      }),
    {
      successToast: '账号已注销',
      onSuccess() {
        onClose();
        getData();
      }
    }
  );

  return (
    <>
      <Button
        variant={'whiteBase'}
        size={'sm'}
        onClick={() => {
          onOpen();
          reset(data);
        }}
      >
        编辑
      </Button>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={'编辑用户'}
        maxW={['90vw', '700px']}
        footer={
          <>
            <Box flex={'1'}>
              {!isAccountCancellationAnonymizedUsername(data.username) && (
                <PopoverConfirm
                  content={`确认注销该账号？会将该用户下关键资源删除，并将用户名修改为 ${data.username}-随机数-delete`}
                  type="delete"
                  onConfirm={onDeleteUser}
                  Trigger={
                    <Button alignSelf={'flex-start'} variant={'dangerFill'}>
                      注销
                    </Button>
                  }
                />
              )}
            </Box>
            <Button variant={'whiteBase'} onClick={onClose}>
              关闭
            </Button>
            <Button
              isLoading={loading}
              variant={'primary'}
              onClick={handleSubmit(onSubmit, onSubmitErr)}
            >
              确定
            </Button>
          </>
        }
      >
        <FormControl mt={4}>
          <FormLabel htmlFor="username" fontWeight="bold">
            用户名
          </FormLabel>
          <Input {...register('username')} id="username" variant="outline" placeholder="" />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="password" fontWeight="bold">
            密码
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
        <FormControl mt={4}>
          <FormLabel htmlFor="password" mb={0} fontWeight="bold">
            用户状态
          </FormLabel>
          <RadioGroup defaultValue={data?.status}>
            <HStack spacing={6} mt={2}>
              <Radio {...register('status')} value="active" size="lg">
                active
              </Radio>
              <Radio {...register('status')} value="forbidden" size="lg">
                forbidden
              </Radio>
            </HStack>
          </RadioGroup>
        </FormControl>
      </MyModal>
    </>
  );
}
