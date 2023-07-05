import React, { useCallback, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  Input,
  Grid,
  useTheme,
  Card
} from '@chakra-ui/react';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImg } from '@/utils/file';
import { getErrText } from '@/utils/tools';
import { useToast } from '@/hooks/useToast';
import { postCreateApp } from '@/api/app';
import { useRouter } from 'next/router';
import { chatAppDemo } from '@/constants/app';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';

type FormType = {
  avatar: string;
  name: string;
  templateId: number;
};

const templates = [
  {
    id: 0,
    icon: 'settings',
    name: '简单的对话',
    intro: '一个极其简单的 AI 对话应用',
    modules: chatAppDemo.modules
  },
  {
    id: 1,
    icon: 'settings',
    name: '基础知识库',
    intro: '每次提问时进行一次知识库搜索，将搜索结果注入 LLM 模型进行参考回答',
    modules: chatAppDemo.modules
  },
  {
    id: 2,
    icon: 'settings',
    name: '问答前引导',
    intro: '可以在每次对话开始前提示用户填写一些内容，作为本次对话的永久内容',
    modules: chatAppDemo.modules
  },
  {
    id: 3,
    icon: 'settings',
    name: '意图识别 + 知识库',
    intro: '先对用户的问题进行分类，再根据不同类型问题，执行不同的操作',
    modules: chatAppDemo.modules
  }
];

const CreateModal = ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => {
  const [refresh, setRefresh] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const theme = useTheme();
  const { register, setValue, getValues, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: '/icon/logo.png',
      name: '',
      templateId: 0
    }
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

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

  const onclickCreate = useCallback(
    async (data: FormType) => {
      setCreating(true);
      try {
        const id = await postCreateApp({
          avatar: data.avatar,
          name: data.name,
          modules: templates.find((item) => item.id === data.templateId)?.modules || []
        });
        toast({
          title: '创建成功',
          status: 'success'
        });
        router.push(`/app/detail?appId=${id}`);
        onClose();
        onSuccess();
      } catch (error) {
        toast({
          title: getErrText(error, '创建应用异常'),
          status: 'error'
        });
      }
      setCreating(false);
    },
    [onClose, onSuccess, router, toast]
  );

  return (
    <Modal isOpen onClose={onClose}>
      <ModalOverlay />
      <ModalContent w={'700px'} maxW={'90vw'}>
        <ModalHeader fontSize={'2xl'}>开始创建你的 AI 应用</ModalHeader>
        <ModalBody>
          <Box color={'myGray.800'}>取个响亮的名字</Box>
          <Flex mt={3} alignItems={'center'}>
            <Avatar
              src={getValues('avatar')}
              w={['32px', '36px']}
              h={['32px', '36px']}
              cursor={'pointer'}
              title={'点击选择头像'}
              borderRadius={'md'}
              onClick={onOpenSelectFile}
            />
            <Input
              ml={4}
              bg={'myWhite.600'}
              {...register('name', {
                required: '应用名不能为空~'
              })}
            />
          </Flex>
          <Box mt={7} mb={3} color={'myGray.800'}>
            从模板中选择
          </Box>
          <Grid
            userSelect={'none'}
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)']}
            gridGap={4}
          >
            {templates.map((item) => (
              <Card
                key={item.id}
                border={theme.borders.base}
                p={3}
                borderRadius={'md'}
                cursor={'pointer'}
                boxShadow={'sm'}
                {...(getValues('templateId') === item.id
                  ? {
                      bg: 'myBlue.300'
                    }
                  : {
                      _hover: {
                        boxShadow: 'md'
                      }
                    })}
                onClick={() => {
                  setValue('templateId', item.id);
                  setRefresh((state) => !state);
                }}
              >
                <Flex alignItems={'center'}>
                  <MyIcon name={'apikey'} w={'16px'} />
                  <Box ml={3} fontWeight={'bold'}>
                    {item.name}
                  </Box>
                </Flex>
                <Box fontSize={'sm'} mt={4}>
                  {item.intro}
                </Box>
              </Card>
            ))}
          </Grid>
        </ModalBody>

        <ModalFooter>
          <Button variant={'base'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button isLoading={creating} onClick={handleSubmit(onclickCreate)}>
            确认创建
          </Button>
        </ModalFooter>
      </ModalContent>

      <File onSelect={onSelectFile} />
    </Modal>
  );
};

export default CreateModal;
