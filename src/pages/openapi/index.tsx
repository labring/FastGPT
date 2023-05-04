import React, { useState } from 'react';
import {
  Card,
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody
} from '@chakra-ui/react';
import { getOpenApiKeys, createAOpenApiKey, delOpenApiById } from '@/api/openapi';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLoading } from '@/hooks/useLoading';
import dayjs from 'dayjs';
import { DeleteIcon } from '@chakra-ui/icons';
import { useCopyData } from '@/utils/tools';

const OpenApi = () => {
  const { Loading } = useLoading();
  const {
    data: apiKeys = [],
    isLoading: isGetting,
    refetch
  } = useQuery(['getOpenApiKeys'], getOpenApiKeys);
  const [apiKey, setApiKey] = useState('');
  const { copyData } = useCopyData();

  const { mutate: onclickCreateApiKey, isLoading: isCreating } = useMutation({
    mutationFn: () => createAOpenApiKey(),
    onSuccess(res) {
      setApiKey(res);
      refetch();
    }
  });

  const { mutate: onclickRemove, isLoading: isDeleting } = useMutation({
    mutationFn: async (id: string) => delOpenApiById(id),
    onSuccess() {
      refetch();
    }
  });

  return (
    <Box py={[5, 10]} px={'5vw'}>
      <Card px={6} py={4} position={'relative'}>
        <Box fontSize={'xl'} fontWeight={'bold'}>
          FastGpt Api
        </Box>
        <Box fontSize={'sm'} mt={2}>
          FastGpt Api 允许你将 Fast Gpt 的部分功能通过 api
          的形式接入到自己的应用中，例如：飞书、企业微信、客服助手。请注意保管你的 Api
          Key，不要泄露！
        </Box>
        <Box
          my={1}
          as="a"
          href="https://kjqvjse66l.feishu.cn/docx/DmLedTWtUoNGX8xui9ocdUEjnNh"
          color={'myBlue.800'}
          textDecoration={'underline'}
          target={'_blank'}
        >
          点击查看文档
        </Box>
        <TableContainer mt={2} position={'relative'}>
          <Table>
            <Thead>
              <Tr>
                <Th>Api Key</Th>
                <Th>创建时间</Th>
                <Th>最后一次使用时间</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {apiKeys.map(({ id, apiKey, createTime, lastUsedTime }) => (
                <Tr key={id}>
                  <Td>{apiKey}</Td>
                  <Td>{dayjs(createTime).format('YYYY/MM/DD HH:mm:ss')}</Td>
                  <Td>
                    {lastUsedTime
                      ? dayjs(lastUsedTime).format('YYYY/MM/DD HH:mm:ss')
                      : '没有使用过'}
                  </Td>
                  <Td>
                    <IconButton
                      icon={<DeleteIcon />}
                      size={'xs'}
                      aria-label={'delete'}
                      variant={'outline'}
                      colorScheme={'gray'}
                      onClick={() => onclickRemove(id)}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        <Button
          maxW={'200px'}
          mt={5}
          isLoading={isCreating}
          isDisabled={apiKeys.length >= 5}
          title={apiKeys.length >= 5 ? '最多五组 Api Key' : ''}
          onClick={() => onclickCreateApiKey()}
        >
          添加新的 Api Key
        </Button>
        <Loading loading={isGetting || isDeleting} fixed={false} />
      </Card>
      <Modal isOpen={!!apiKey} onClose={() => setApiKey('')}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Api Key</ModalHeader>
          <ModalCloseButton />
          <ModalBody mb={5}>
            请保管好你的Api Key
            <Box userSelect={'all'} onClick={() => copyData(apiKey)}>
              {apiKey}
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default OpenApi;
