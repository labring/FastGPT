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
import { readCsvContent } from '@/utils/file';
import { useMutation } from '@tanstack/react-query';
import { postKbDataFromList } from '@/api/plugins/kb';
import Markdown from '@/components/Markdown';
import { useMarkdown } from '@/hooks/useMarkdown';
import { fileDownload } from '@/utils/file';

const csvTemplate = `question,answer\n"什么是 laf","laf 是一个云函数开发平台……"\n"什么是 sealos","Sealos 是以 kubernetes 为内核的云操作系统发行版,可以……"`;

const SelectJsonModal = ({
  onClose,
  onSuccess,
  kbId
}: {
  onClose: () => void;
  onSuccess: () => void;
  kbId: string;
}) => {
  const [selecting, setSelecting] = useState(false);
  const { toast } = useToast();
  const { File, onOpen } = useSelectFile({ fileType: '.csv', multiple: false });
  const [fileData, setFileData] = useState<{ q: string; a: string }[]>([]);
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认导入该数据集?'
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      setSelecting(true);
      try {
        const { header, data } = await readCsvContent(file);
        if (header[0] !== 'question' || header[1] !== 'answer') {
          throw new Error('csv 文件格式有误');
        }
        setFileData(
          data.map((item) => ({
            q: item[0] || '',
            a: item[1] || ''
          }))
        );
      } catch (error: any) {
        console.log(error);
        toast({
          title: error?.message || 'csv 文件格式有误',
          status: 'error'
        });
      }
      setSelecting(false);
    },
    [setSelecting, toast]
  );

  const { mutate, isLoading } = useMutation({
    mutationFn: async () => {
      if (!fileData || fileData.length === 0) return;

      const res = await postKbDataFromList({
        kbId,
        data: fileData
      });

      toast({
        title: `导入数据成功，最终导入: ${res || 0} 条数据。需要一段时间训练`,
        status: 'success',
        duration: 4000
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

  const { data: intro } = useMarkdown({ url: '/csvSelect.md' });

  return (
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent maxW={'90vw'} position={'relative'} m={0} h={'90vh'}>
        <ModalHeader>csv 问答对导入</ModalHeader>
        <ModalCloseButton />

        <ModalBody h={'100%'} display={['block', 'flex']} fontSize={'sm'} overflowY={'auto'}>
          <Box flex={'2 0 0'} w={['100%', 0]} mr={[0, 4]} mb={[4, 0]}>
            <Markdown source={intro} />
            <Box
              my={3}
              cursor={'pointer'}
              textDecoration={'underline'}
              color={'myBlue.600'}
              onClick={() =>
                fileDownload({
                  text: csvTemplate,
                  type: 'text/csv',
                  filename: 'template.csv'
                })
              }
            >
              点击下载csv模板
            </Box>
            <Flex alignItems={'center'}>
              <Button isLoading={selecting} onClick={onOpen}>
                选择 csv 问答对
              </Button>

              <Box ml={4}>一共 {fileData.length} 组数据</Box>
            </Flex>
          </Box>
          <Box flex={'3 0 0'} h={'100%'} overflow={'auto'} p={2} backgroundColor={'blackAlpha.50'}>
            {fileData.map((item, index) => (
              <Box key={index}>
                <Box>
                  Q{index + 1}. {item.q}
                </Box>
                <Box>
                  A{index + 1}. {item.a}
                </Box>
              </Box>
            ))}
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
