import React, { useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Input,
  Textarea
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { customAlphabet } from 'nanoid';
import { encode } from 'gpt-token-utils';
import { useConfirm } from '@/hooks/useConfirm';
import { useMutation } from '@tanstack/react-query';
import { postModelDataSplitData, getWebContent } from '@/api/model';
import { formatPrice } from '@/utils/user';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

const SelectUrlModal = ({
  onClose,
  onSuccess,
  modelId
}: {
  onClose: () => void;
  onSuccess: () => void;
  modelId: string;
}) => {
  const { toast } = useToast();
  const [webUrl, setWebUrl] = useState('');
  const [webText, setWebText] = useState('');
  const [prompt, setPrompt] = useState(''); // 提示词
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认导入该文件，需要一定时间进行拆解，该任务无法终止！如果余额不足，任务讲被终止。'
  });

  const { mutate: onclickImport, isLoading: isImporting } = useMutation({
    mutationFn: async () => {
      if (!webText) return;
      await postModelDataSplitData({
        modelId,
        text: webText,
        prompt: `下面是"${prompt || '一段长文本'}"`
      });
      toast({
        title: '导入数据成功,需要一段拆解和训练',
        status: 'success'
      });
      onClose();
      onSuccess();
    },
    onError(error) {
      console.log(error);
      toast({
        title: '导入数据失败',
        status: 'error'
      });
    }
  });

  const { mutate: onclickFetchingUrl, isLoading: isFetching } = useMutation({
    mutationFn: async () => {
      if (!webUrl) return;
      const res = await getWebContent(webUrl);
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(res, 'text/html');
      const data = htmlDoc?.body?.innerText || '';

      if (!data) {
        throw new Error('获取不到数据');
      }
      setWebText(data.replace(/\s+/g, ' '));
    },
    onError(error) {
      console.log(error);
      toast({
        status: 'error',
        title: '获取网站内容失败'
      });
    }
  });

  return (
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent maxW={'min(900px, 90vw)'} m={0} position={'relative'} h={'90vh'}>
        <ModalHeader>网站地址导入</ModalHeader>
        <ModalCloseButton />

        <ModalBody
          display={'flex'}
          flexDirection={'column'}
          p={4}
          h={'100%'}
          alignItems={'center'}
          justifyContent={'center'}
          fontSize={'sm'}
        >
          <Box mt={2} maxW={['100%', '70%']}>
            根据网站地址，获取网站文本内容（请注意获取后的内容，不是每个网站内容都能获取到的）。模型会对文本进行
            QA 拆分，需要较长训练时间，拆分需要消耗 tokens，账号余额不足时，未拆分的数据会被删除。
          </Box>
          <Box mt={2}>
            一共 {encode(webText).length} 个tokens，大约 {formatPrice(encode(webText).length * 3)}元
          </Box>
          <Flex w={'100%'} alignItems={'center'} my={4}>
            <Box flex={'0 0 70px'}>网站地址</Box>
            <Input
              mx={2}
              placeholder="需要获取内容的地址。例如：https://fastgpt.ahapocket.cn"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              size={'sm'}
            />
            <Button isLoading={isFetching} onClick={() => onclickFetchingUrl()}>
              获取
            </Button>
          </Flex>
          <Flex w={'100%'} alignItems={'center'} my={4}>
            <Box flex={'0 0 70px'} mr={2}>
              下面是
            </Box>
            <Input
              placeholder="内容提示词。例如: Laf的介绍/关于gpt4的论文/一段长文本"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              size={'sm'}
            />
          </Flex>
          <Textarea
            flex={'1 0 0'}
            h={0}
            w={'100%'}
            placeholder="网站的内容"
            maxLength={-1}
            resize={'none'}
            fontSize={'xs'}
            whiteSpace={'pre-wrap'}
            value={webText}
            onChange={(e) => setWebText(e.target.value)}
          />
        </ModalBody>

        <Flex px={6} pt={2} pb={4}>
          <Box flex={1}></Box>
          <Button variant={'outline'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={isImporting}
            isDisabled={webText === ''}
            onClick={openConfirm(onclickImport)}
          >
            确认导入
          </Button>
        </Flex>
      </ModalContent>
      <ConfirmChild />
    </Modal>
  );
};

export default SelectUrlModal;
