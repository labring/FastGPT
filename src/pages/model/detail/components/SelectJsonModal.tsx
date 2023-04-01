import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useConfirm } from '@/hooks/useConfirm';
import { readTxtContent } from '@/utils/tools';
import { useMutation } from '@tanstack/react-query';
import { postModelDataJsonData } from '@/api/model';
import Markdown from '@/components/Markdown';

const SelectJsonModal = ({
  onClose,
  onSuccess,
  modelId
}: {
  onClose: () => void;
  onSuccess: () => void;
  modelId: string;
}) => {
  const [selecting, setSelecting] = useState(false);
  const { toast } = useToast();
  const { File, onOpen } = useSelectFile({ fileType: '.json', multiple: true });
  const [fileData, setFileData] = useState<
    { prompt: string; completion: string; vector?: number[] }[]
  >([]);
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认导入该数据集?'
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      setSelecting(true);
      try {
        const jsonData = (
          await Promise.all(e.map((item) => readTxtContent(item).then((text) => JSON.parse(text))))
        ).flat();
        // check 文件类型
        for (let i = 0; i < jsonData.length; i++) {
          if (!jsonData[i]?.prompt || !jsonData[i]?.completion) {
            throw new Error('缺少 prompt 或 completion');
          }
        }

        setFileData(jsonData);
      } catch (error: any) {
        console.log(error);
        toast({
          title: error?.message || 'JSON文件格式有误',
          status: 'error'
        });
      }
      setSelecting(false);
    },
    [setSelecting, toast]
  );

  const { mutate, isLoading } = useMutation({
    mutationFn: async () => {
      if (!fileData) return;
      const res = await postModelDataJsonData(modelId, fileData);
      console.log(res);
      toast({
        title: '导入数据成功,需要一段拆解和训练',
        status: 'success'
      });
      onClose();
      onSuccess();
    },
    onError() {
      toast({
        title: '导入文件失败',
        status: 'error'
      });
    }
  });

  return (
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent maxW={'90vw'} position={'relative'} m={0} h={'90vh'}>
        <ModalHeader>JSON数据集</ModalHeader>
        <ModalCloseButton />

        <ModalBody h={'100%'} display={['block', 'flex']} fontSize={'sm'} overflowY={'auto'}>
          <Box flex={'2 0 0'} w={['100%', 0]} mr={[0, 4]} mb={[4, 0]}>
            <Markdown
              source={`接受一个对象数组，每个对象必须包含 prompt 和 completion 格式，可以包含vector。prompt 代表问题，completion 代表回答的内容，可以多个问题对应一个回答，vector 为 prompt 的向量，如果没有讲有系统生成。例如：
~~~json
[
  {
    "prompt":"sealos是什么?\\n介绍下sealos\\nsealos有什么用",
    "completion":"sealos是xxxxxx"
  },
  {
    "prompt":"laf是什么?",
    "completion":"laf是xxxxxx",
    "vector":[-0.42,-0.4314314,0.43143]
  }
]
~~~`}
            />
            <Flex alignItems={'center'}>
              <Button isLoading={selecting} onClick={onOpen}>
                选择 JSON 数据集
              </Button>

              <Box ml={4}>一共 {fileData.length} 组数据</Box>
            </Flex>
          </Box>
          <Box flex={'2 0 0'} h={'100%'} overflow={'auto'} p={2} backgroundColor={'blackAlpha.50'}>
            {JSON.stringify(fileData)}
          </Box>
        </ModalBody>

        <Flex px={6} pt={2} pb={4}>
          <Box flex={1}></Box>
          <Button variant={'outline'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={isLoading}
            isDisabled={fileData.length === 0}
            onClick={openConfirm(mutate)}
          >
            确认导入
          </Button>
        </Flex>
      </ModalContent>
      <ConfirmChild />
      <File onSelect={onSelectFile} />
    </Modal>
  );
};

export default SelectJsonModal;
