import React, { useCallback } from 'react';
import {
  Card,
  Box,
  Flex,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Select,
  Input
} from '@chakra-ui/react';
import { useForm, useFieldArray } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { putUserInfo } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { UserType } from '@/types/user';

const NumberSetting = () => {
  const { userInfo, updateUserInfo } = useUserStore();
  const { setLoading } = useGlobalStore();
  const { register, handleSubmit, control } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const { toast } = useToast();
  const {
    fields: accounts,
    append: appendAccount,
    remove: removeAccount
  } = useFieldArray({
    control,
    name: 'accounts'
  });

  const onclickSave = useCallback(
    async (data: UserUpdateParams) => {
      setLoading(true);
      try {
        await putUserInfo(data);
        updateUserInfo(data);
        toast({
          title: '更新成功',
          status: 'success'
        });
      } catch (error) {}
      setLoading(false);
    },
    [setLoading, toast, updateUserInfo]
  );

  return (
    <>
      <Card px={6} py={4}>
        <Box fontSize={'xl'} fontWeight={'bold'}>
          账号信息
        </Box>
        <Box mt={6}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 60px'}>邮箱:</Box>
            <Box>{userInfo?.email}</Box>
          </Flex>
        </Box>
        {/* <Box mt={6}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 60px'}>余额:</Box>
            <Box>
              <strong>{userInfo?.balance}</strong> 元
            </Box>
            <Button size={'sm'} w={'80px'} ml={5}>
              充值
            </Button>
          </Flex>
        </Box> */}
      </Card>
      <Card mt={6} px={6} py={4}>
        <Flex mb={5} justifyContent={'space-between'}>
          <Box fontSize={'xl'} fontWeight={'bold'}>
            关联账号
          </Box>
          <Box>
            {accounts.length === 0 && (
              <Button
                mr={5}
                variant="outline"
                onClick={() =>
                  appendAccount({
                    type: 'openai',
                    value: ''
                  })
                }
              >
                新增
              </Button>
            )}
            <Button onClick={handleSubmit(onclickSave)}>保存</Button>
          </Box>
        </Flex>
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>账号类型</Th>
                <Th>值</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {accounts.map((item, i) => (
                <Tr key={item.id}>
                  <Td minW={'200px'}>
                    <Select
                      {...register(`accounts.${i}.type`, {
                        required: '类型不能为空'
                      })}
                    >
                      <option value="openai">openai</option>
                    </Select>
                  </Td>
                  <Td minW={'200px'} whiteSpace="pre-wrap" wordBreak={'break-all'}>
                    <Input
                      {...register(`accounts.${i}.value`, {
                        required: '账号不能为空'
                      })}
                    ></Input>
                  </Td>
                  <Td>
                    <Button onClick={() => removeAccount(i)}>删除</Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>
    </>
  );
};

export default NumberSetting;
