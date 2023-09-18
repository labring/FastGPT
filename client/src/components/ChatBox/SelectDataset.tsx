import React, { useRef, useState } from 'react';
import {
  ModalBody,
  useTheme,
  ModalFooter,
  Button,
  ModalHeader,
  Box,
  Card,
  Flex
} from '@chakra-ui/react';
import MyModal from '../MyModal';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDatasetStore } from '@/store/dataset';
import { useToast } from '@/hooks/useToast';
import Avatar from '../Avatar';
import MyIcon from '@/components/Icon';
import { useGlobalStore } from '@/store/global';

const SelectDataset = ({
  onSuccess,
  onClose
}: {
  onSuccess: (kbId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { isPc } = useGlobalStore();
  const { toast } = useToast();
  const { myKbList, loadKbList } = useDatasetStore();
  const [selectedId, setSelectedId] = useState<string>();

  useQuery(['loadKbList'], () => loadKbList());

  return (
    <MyModal isOpen={true} onClose={onClose} w={'100%'} maxW={['90vw', '900px']} isCentered={!isPc}>
      <Flex flexDirection={'column'} h={['90vh', 'auto']}>
        <ModalHeader>
          <Box>{t('chat.Select Mark Kb')}</Box>
          <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'normal'}>
            {t('chat.Select Mark Kb Desc')}
          </Box>
        </ModalHeader>
        <ModalBody
          flex={['1 0 0', '0 0 auto']}
          maxH={'80vh'}
          overflowY={'auto'}
          display={'grid'}
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
          gridGap={3}
          userSelect={'none'}
        >
          {myKbList.map((item) =>
            (() => {
              const selected = selectedId === item._id;
              return (
                <Card
                  key={item._id}
                  p={3}
                  border={theme.borders.base}
                  boxShadow={'sm'}
                  h={'80px'}
                  cursor={'pointer'}
                  _hover={{
                    boxShadow: 'md'
                  }}
                  {...(selected
                    ? {
                        bg: 'myBlue.300'
                      }
                    : {})}
                  onClick={() => {
                    setSelectedId(item._id);
                  }}
                >
                  <Flex alignItems={'center'} h={'38px'}>
                    <Avatar src={item.avatar} w={['24px', '28px', '32px']}></Avatar>
                    <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
                      {item.name}
                    </Box>
                  </Flex>
                  <Flex justifyContent={'flex-end'} alignItems={'center'} fontSize={'sm'}>
                    <MyIcon mr={1} name="kbTest" w={'12px'} />
                    <Box color={'myGray.500'}>{item.vectorModel.name}</Box>
                  </Flex>
                </Card>
              );
            })()
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant={'base'} mr={2} onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => {
              if (!selectedId) {
                return toast({
                  status: 'warning',
                  title: t('Select value is empty')
                });
              }

              onSuccess(selectedId);
            }}
          >
            {t('Confirm')}
          </Button>
        </ModalFooter>
      </Flex>
    </MyModal>
  );
};

export default SelectDataset;
