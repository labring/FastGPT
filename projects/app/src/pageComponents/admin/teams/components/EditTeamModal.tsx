import { Box, Button, FormControl, FormLabel, Input, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { POST } from '@/web/admin/common/request';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

export default function EditTeamModal(props: { data: any; updateData: any }) {
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

  const onSubmit = async (formData: any) => {
    POST(`/proApi/admin/routes/teams/updateTeam`, formData)
      .then(() => {
        toast({
          title: '变更成功',
          status: 'success'
        });
        updateData();
        onClose();
      })
      .catch((err) => {
        toast({
          title: err.message,
          status: 'error'
        });
      });
  };

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
        maxW={['90vw', '700px']}
        title={'团队编辑'}
        footer={
          <>
            <Button variant="whiteBase" onClick={onClose}>
              关闭
            </Button>
            <Button variant="primary" onClick={handleSubmit(onSubmit)}>
              确定
            </Button>
          </>
        }
      >
        <FormControl mt={4}>
          <FormLabel htmlFor="name" mb={0} fontWeight="bold">
            团队名
          </FormLabel>
          <Input {...register('name', {})} id="name" variant="outline" placeholder="团队名" />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="balance" mb={0} fontWeight="bold">
            余额
            {errors && !!errors?.balance && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                *必填
              </Box>
            )}
          </FormLabel>
          <Input
            {...register('balance', {
              required: 'This is required'
            })}
            id="balance"
            variant="outline"
            placeholder="余额"
          />
        </FormControl>
      </MyModal>
    </>
  );
}
