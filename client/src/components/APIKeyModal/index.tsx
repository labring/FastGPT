import React, { useState } from 'react';
import {
  Box,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  Flex,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  IconButton
} from '@chakra-ui/react';
import { getOpenApiKeys, createAOpenApiKey, delOpenApiById } from '@/api/openapi';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLoading } from '@/hooks/useLoading';
import dayjs from 'dayjs';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { getErrText, useCopyData } from '@/utils/tools';
import { useToast } from '@/hooks/useToast';
import MyIcon from '../Icon';

const APIKeyModal = ({ onClose }: { onClose: () => void }) => {
  const { Loading } = useLoading();
  const { toast } = useToast();
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
    },
    onError(err) {
      toast({
        status: 'warning',
        title: getErrText(err)
      });
    }
  });

  const { mutate: onclickRemove, isLoading: isDeleting } = useMutation({
    mutationFn: async (id: string) => delOpenApiById(id),
    onSuccess() {
      refetch();
    }
  });

  return (
    <Modal isOpen onClose={onClose}>
      <ModalOverlay />
      <ModalContent w={'600px'} maxW={'90vw'} position={'relative'}>
        <Box py={3} px={5}>
          <Box fontWeight={'bold'} fontSize={'2xl'}>
            API 秘钥管理
          </Box>
          <Box fontSize={'sm'} color={'myGray.600'}>
            如果你不想 API 秘钥被滥用，请勿将秘钥直接放置在前端使用~
          </Box>
        </Box>
        <ModalCloseButton />
        <ModalBody minH={'300px'} maxH={['70vh', '500px']} overflow={'overlay'}>
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
                        variant={'base'}
                        colorScheme={'gray'}
                        onClick={() => onclickRemove(id)}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="base"
            leftIcon={<AddIcon color={'myGray.600'} fontSize={'sm'} />}
            onClick={() => onclickCreateApiKey()}
          >
            新建秘钥
          </Button>
        </ModalFooter>

        <Loading loading={isGetting || isCreating || isDeleting} fixed={false} />
      </ModalContent>
      <Modal isOpen={!!apiKey} onClose={() => setApiKey('')}>
        <ModalOverlay />
        <ModalContent w={'400px'} maxW={'90vw'}>
          <Box py={3} px={5}>
            <Box fontWeight={'bold'} fontSize={'2xl'}>
              新的 API 秘钥
            </Box>
            <Box fontSize={'sm'} color={'myGray.600'}>
              请保管好你的秘钥，秘钥不会再次展示~
            </Box>
          </Box>
          <ModalCloseButton />
          <ModalBody>
            <Flex
              bg={'myGray.100'}
              px={3}
              py={2}
              cursor={'pointer'}
              onClick={() => copyData(apiKey)}
            >
              <Box flex={1}>{apiKey}</Box>
              <MyIcon name={'copy'} w={'16px'}></MyIcon>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button variant="base" onClick={() => setApiKey('')}>
              好的
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Modal>
  );
};

export default APIKeyModal;
