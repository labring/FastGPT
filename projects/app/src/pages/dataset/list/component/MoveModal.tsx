import React, { useMemo, useState } from 'react';
import {
  Card,
  Flex,
  Box,
  Button,
  ModalBody,
  ModalHeader,
  ModalFooter,
  useTheme,
  Grid
} from '@chakra-ui/react';
import Avatar from '@/components/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import { getDatasets, putDatasetById, getDatasetPaths } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const MoveModal = ({
  onClose,
  onSuccess,
  moveDataId
}: {
  onClose: () => void;
  onSuccess: () => void;
  moveDataId: string;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [parentId, setParentId] = useState<string>('');

  const { data } = useQuery(['getDatasets', parentId], () => {
    return Promise.all([
      getDatasets({ parentId, type: DatasetTypeEnum.folder }),
      getDatasetPaths(parentId)
    ]);
  });
  const paths = useMemo(
    () => [
      {
        parentId: '',
        parentName: t('core.dataset.My Dataset')
      },
      ...(data?.[1] || [])
    ],
    [data, t]
  );
  const folderList = useMemo(
    () => (data?.[0] || []).filter((item) => item._id !== moveDataId),
    [moveDataId, data]
  );

  const { mutate, isLoading } = useRequest({
    mutationFn: () => putDatasetById({ id: moveDataId, parentId }),
    onSuccess,
    errorToast: t('dataset.Move Failed')
  });

  return (
    <MyModal
      isOpen={true}
      maxW={['90vw', '800px']}
      w={'800px'}
      iconSrc="/imgs/modal/move.svg"
      title={
        <>
          {!!parentId ? (
            <Flex flex={1} userSelect={'none'} fontSize={['sm', 'md']} fontWeight={'normal'}>
              {paths.map((item, i) => (
                <Flex key={item.parentId} mr={2} alignItems={'center'}>
                  <Box
                    borderRadius={'md'}
                    {...(i === paths.length - 1
                      ? {
                          cursor: 'default'
                        }
                      : {
                          cursor: 'pointer',
                          _hover: {
                            color: 'primary.500'
                          },
                          onClick: () => {
                            setParentId(item.parentId);
                          }
                        })}
                  >
                    {item.parentName}
                  </Box>
                  {i !== paths.length - 1 && (
                    <MyIcon name={'common/rightArrowLight'} color={'myGray.500'} w={'14px'} />
                  )}
                </Flex>
              ))}
            </Flex>
          ) : (
            <Box>{t('core.dataset.My Dataset')}</Box>
          )}
        </>
      }
      onClose={onClose}
    >
      <Flex flexDirection={'column'} h={['90vh', 'auto']}>
        <ModalBody
          flex={['1 0 0', '0 0 auto']}
          maxH={'80vh'}
          overflowY={'auto'}
          display={'grid'}
          userSelect={'none'}
        >
          <Grid
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
            gridGap={3}
          >
            {folderList.map((item) =>
              (() => {
                return (
                  <MyTooltip
                    key={item._id}
                    label={
                      item.type === DatasetTypeEnum.dataset
                        ? t('dataset.Select Dataset')
                        : t('dataset.Select Folder')
                    }
                  >
                    <Card
                      p={3}
                      border={theme.borders.base}
                      boxShadow={'sm'}
                      h={'80px'}
                      cursor={'pointer'}
                      _hover={{
                        boxShadow: 'md'
                      }}
                      onClick={() => {
                        setParentId(item._id);
                      }}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar src={item.avatar} w={['24px', '28px']}></Avatar>
                        <Box
                          className="textEllipsis"
                          ml={3}
                          fontWeight={'bold'}
                          fontSize={['md', 'md']}
                        >
                          {item.name}
                        </Box>
                      </Flex>
                      <Flex justifyContent={'flex-end'} alignItems={'center'} fontSize={'sm'}>
                        {item.type === DatasetTypeEnum.folder ? (
                          <Box color={'myGray.500'}>{t('Folder')}</Box>
                        ) : (
                          <>
                            <MyIcon mr={1} name="kbTest" w={'12px'} />
                            <Box color={'myGray.500'}>{item.vectorModel.name}</Box>
                          </>
                        )}
                      </Flex>
                    </Card>
                  </MyTooltip>
                );
              })()
            )}
          </Grid>
          {folderList.length === 0 && <EmptyTip text={t('common.folder.No Folder')}></EmptyTip>}
        </ModalBody>

        <ModalFooter>
          <Button isLoading={isLoading} onClick={mutate}>
            {t('dataset.Confirm move the folder')}
          </Button>
        </ModalFooter>
      </Flex>
    </MyModal>
  );
};

export default MoveModal;
