import React, { useState } from 'react';
import { ModalBody, useTheme, ModalFooter, Button, Box, Card, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@/hooks/useToast';
import Avatar from '../Avatar';
import MyIcon from '@/components/Icon';
import { KbTypeEnum } from '@/constants/dataset';
import DatasetSelectModal, { useDatasetSelect } from '@/components/core/dataset/SelectModal';

const SelectDataset = ({
  isOpen,
  onSuccess,
  onClose
}: {
  isOpen: boolean;
  onSuccess: (kbId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>();
  const { paths, parentId, setParentId, datasets } = useDatasetSelect();

  return (
    <DatasetSelectModal
      isOpen={isOpen}
      paths={paths}
      onClose={onClose}
      parentId={parentId}
      setParentId={setParentId}
      tips={t('chat.Select Mark Kb Desc')}
    >
      <ModalBody flex={'1 0 0'} overflowY={'auto'}>
        <Grid
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
          gridGap={3}
          userSelect={'none'}
        >
          {datasets.map((item) =>
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
                    if (item.type === KbTypeEnum.folder) {
                      setParentId(item._id);
                    } else {
                      setSelectedId(item._id);
                    }
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
        </Grid>
        {datasets.length === 0 && (
          <Flex mt={5} flexDirection={'column'} alignItems={'center'}>
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              这个目录已经没东西可选了~
            </Box>
          </Flex>
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
    </DatasetSelectModal>
  );
};

export default SelectDataset;
