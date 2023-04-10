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
  ModalBody,
  Table,
  Thead,
  Tbody,
  Tfoot,
  Tr,
  Th,
  Td,
  TableContainer,
  TableCaption
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useConfirm } from '@/hooks/useConfirm';
import { readCsvContent } from '@/utils/tools';
import { useMutation } from '@tanstack/react-query';
import { postModelDataObjectData } from '@/api/model';
import Markdown from '@/components/Markdown';
import { useDownloadFile } from '@/hooks/useDownloadFile';

const SelectCsvModal = ({
  onClose,
  onSuccess,
  modelId
}: {
  onClose: () => void;
  onSuccess: () => void;
  modelId: string;
}) => {
  const [selecting, setSelecting] = useState<boolean>(false);
  const { toast } = useToast();
  const { File, onOpen } = useSelectFile({ fileType: '.csv', multiple: true });
  const DownloadButton = useDownloadFile({
    fileSuffix: 'csv',
    fetchDataList: () => {
      return JSON.stringify(`prompt,completion
sealos是什么?,sealos是xxxxxx
laf是什么?,laf是xxxxxx`);
    },
    Component: Button
  });
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
        const csvData = (
          await Promise.all(e.map((item) => readCsvContent(item).then((text) => JSON.parse(text))))
        ).flat();
        console.log(csvData, 'csvData');

        // check 文件类型
        for (let i = 0; i < csvData.length; i++) {
          if (!csvData[i]?.prompt || !csvData[i]?.completion) {
            throw new Error('缺少 prompt 或 completion，可能是csv文件的末尾多了一个换行符哦');
          }
        }

        setFileData(csvData);
      } catch (error: any) {
        console.log(error);
        toast({
          title: error?.message || 'csv文件格式有误',
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
      const res = await postModelDataObjectData(modelId, fileData);
      console.log(res);
      toast({
        title: '导入数据成功,需要一段时间训练',
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
        <ModalHeader>csv数据集</ModalHeader>
        <ModalCloseButton />
        <ModalBody h={'100%'} display={['block', 'flex']} fontSize={'sm'} overflowY={'auto'}>
          <Box flex={'2 0 0'} w={['100%', 0]} mr={[0, 4]} mb={[4, 0]}>
            <Markdown
              source={`接受一个csv文件，csv表格头必须包含 prompt 和 completion 格式。prompt 代表问题，completion 代表回答的内容，可以多个问题对应一个回答。下面是一个模板例子，可以点击按钮下载模板csv文件`}
            />
            <TableContainer
              style={{ borderRadius: '0.375rem', border: '1px solid #ddd', margin: '16px 0' }}
            >
              <Table size="lg">
                <TableCaption>
                  <DownloadButton
                    variant={'outline'}
                    mr={2}
                    size={'sm'}
                    title={'v2.3之前版本的数据无法导出'}
                  >
                    下载模板
                  </DownloadButton>
                </TableCaption>
                <Thead style={{ backgroundColor: 'rgba(0, 0, 0, 0.06)' }}>
                  <Tr>
                    <Th style={{ textTransform: 'lowercase' }}>prompt</Th>
                    <Th style={{ textTransform: 'lowercase' }}>completion</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td>sealos是什么?\\n介绍下sealos\\nsealos有什么用</Td>
                    <Td>laf是什么?sealos是xxxxxx</Td>
                  </Tr>
                  <Tr>
                    <Td>sealos是xxxxxx</Td>
                    <Td>laf是xxxxxx</Td>
                  </Tr>
                </Tbody>
              </Table>
            </TableContainer>
            <Flex alignItems={'center'}>
              <Button isLoading={selecting} onClick={onOpen}>
                选择 CSV 数据集
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

export default SelectCsvModal;
