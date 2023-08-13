import React, { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalFooter,
  ModalBody,
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
import MyModal from '../MyModal';

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
    <MyModal isOpen onClose={onClose} w={'600px'}>
      <Box py={3} px={5}>
        <Box fontWeight={'bold'} fontSize={'2xl'}>
          API Key Management
        </Box>
        <Box fontSize={'sm'} color={'myGray.600'}>
          If you do not want the API key to be abused, do not place the key directly in the frontend~
        </Box>
      </Box>
      <ModalBody minH={'300px'} maxH={['70vh', '500px']} overflow={'overlay'}>
        <TableContainer mt={2} position={'relative'}>
          <Table>
            <Thead>
              <Tr>
                <Th>Api Key</Th>
                <Th>Creation Time</Th>
                <Th>Last Used Time</Th>
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
                      : 'Never Used'}
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
          Create Key
        </Button>
      </ModalFooter>

      <Loading loading={isGetting || isCreating || isDeleting} fixed={false} />
      <MyModal isOpen={!!apiKey} w={'400px'} onClose={() => setApiKey('')}>
        <Box py={3} px={5}>
          <Box fontWeight={'bold'} fontSize={'2xl'}>
            New API Key
          </Box>
          <Box fontSize={'sm'} color={'myGray.600'}>
            Please keep your key safe, the key will not be displayed again~
          </Box>
        </Box>
        <ModalBody>
          <Flex bg={'myGray.100'} px={3} py={2} cursor={'pointer'} onClick={() => copyData(apiKey)}>
            <Box flex={1}>{apiKey}</Box>
            <MyIcon name={'copy'} w={'16px'}></MyIcon>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="base" onClick={() => setApiKey('')}>
            Got It
          </Button>
        </ModalFooter>
      </MyModal>
    </MyModal>
  );
};

export default APIKeyModal;
