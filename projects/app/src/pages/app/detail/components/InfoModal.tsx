import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  FormControl,
  Input,
  Textarea,
  ModalFooter,
  ModalBody
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { AppSchema } from '@/types/mongoSchema';
import { useToast } from '@/hooks/useToast';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/web/file';
import { getErrText } from '@/utils/tools';
import { useUserStore } from '@/store/user';
import { useRequest } from '@/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyModal from '@/components/MyModal';

const InfoModal = ({
  defaultApp,
  onClose,
  onSuccess
}: {
  defaultApp: AppSchema;
  onClose: () => void;
  onSuccess?: () => void;
}) => {
  const { toast } = useToast();
  const { updateAppDetail } = useUserStore();

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
    reset,
    handleSubmit
  } = useForm({
    defaultValues: defaultApp
  });
  const [refresh, setRefresh] = useState(false);

  // 提交保存模型修改
  const { mutate: saveSubmitSuccess, isLoading: btnLoading } = useRequest({
    mutationFn: async (data: AppSchema) => {
      await updateAppDetail(data._id, {
        name: data.name,
        avatar: data.avatar,
        intro: data.intro,
        share: data.share
      });
    },
    onSuccess() {
      onSuccess && onSuccess();
      onClose();
      toast({
        title: '更新成功',
        status: 'success'
      });
    },
    errorToast: '更新失败'
  });

  // 提交保存表单失败
  const saveSubmitError = useCallback(() => {
    // deep search message
    const deepSearch = (obj: any): string => {
      if (!obj) return '提交表单错误';
      if (!!obj.message) {
        return obj.message;
      }
      return deepSearch(Object.values(obj)[0]);
    };
    toast({
      title: deepSearch(errors),
      status: 'error',
      duration: 4000,
      isClosable: true
    });
  }, [errors, toast]);

  const saveUpdateModel = useCallback(
    () => handleSubmit((data) => saveSubmitSuccess(data), saveSubmitError)(),
    [handleSubmit, saveSubmitError, saveSubmitSuccess]
  );

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImg({
          file,
          maxW: 100,
          maxH: 100
        });
        setValue('avatar', src);
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: getErrText(err, '头像选择异常'),
          status: 'warning'
        });
      }
    },
    [setValue, toast]
  );

  return (
    <MyModal isOpen={true} onClose={onClose} title={'应用信息设置'}>
      <ModalBody>
        <Box>头像 & 名称</Box>
        <Flex mt={2} alignItems={'center'}>
          <Avatar
            src={getValues('avatar')}
            w={['26px', '34px']}
            h={['26px', '34px']}
            cursor={'pointer'}
            borderRadius={'lg'}
            mr={4}
            title={'点击切换头像'}
            onClick={() => onOpenSelectFile()}
          />
          <FormControl>
            <Input
              bg={'myWhite.600'}
              placeholder={'给应用设置一个名称'}
              {...register('name', {
                required: '展示名称不能为空'
              })}
            ></Input>
          </FormControl>
        </Flex>
        <Box mt={7} mb={1}>
          应用介绍
        </Box>
        {/* <Box color={'myGray.500'} mb={2} fontSize={'sm'}>
            该介绍主要用于记忆和在应用市场展示
          </Box> */}
        <Textarea
          rows={4}
          maxLength={500}
          placeholder={'给你的 AI 应用一个介绍'}
          bg={'myWhite.600'}
          {...register('intro')}
        />
      </ModalBody>

      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
          取消
        </Button>
        <Button isLoading={btnLoading} onClick={saveUpdateModel}>
          保存
        </Button>
      </ModalFooter>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default InfoModal;
