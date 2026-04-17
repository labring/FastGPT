import React, { useCallback, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Image,
  ModalBody,
  ModalFooter,
  Wrap,
  WrapItem,
  Input
} from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { EntryPointItemType } from '@fastgpt/global/core/app/type';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import ChatFunctionTip from './Tip';

type Props = {
  entryPoints: EntryPointItemType[];
  onChange: (list: EntryPointItemType[]) => void;
  zoom?: number;
};

const EntryPointEdit = ({ entryPoints = [], onChange }: Props) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [localEntryPoints, setLocalEntryPoints] = useState<EntryPointItemType[]>([]);

  const handleOpenModal = useCallback(() => {
    setLocalEntryPoints(entryPoints.map((item) => ({ ...item })));
    setIsOpen(true);
  }, [entryPoints]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (localEntryPoints.some((item) => !item.name.trim())) return;
    onChange(localEntryPoints);
    setIsOpen(false);
  }, [localEntryPoints, onChange]);

  const handleAdd = useCallback(() => {
    setLocalEntryPoints((prev) => [...prev, { id: getNanoid(8), name: '' }]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setLocalEntryPoints((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleNameChange = useCallback((id: string, name: string) => {
    setLocalEntryPoints((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
  }, []);

  const handleIconChange = useCallback((id: string, icon: string) => {
    setLocalEntryPoints((prev) => prev.map((item) => (item.id === id ? { ...item, icon } : item)));
  }, []);

  return (
    <Box className="nodrag">
      {/* 系统配置区块：功能入口配置 */}
      {/* Header */}
      <Flex alignItems={'center'}>
        <MyIcon name={'appEntry'} w={'20px'} color="primary.600" />
        <FormLabel ml={2} color={'myGray.600'}>
          {t('workflow:entry_point')}
        </FormLabel>
        <ChatFunctionTip type={'entryPoint'} />
        <Box flex={1} />
        <Button
          variant={'transparentBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          size={'sm'}
          color={'myGray.600'}
          mr={'-5px'}
          onClick={handleOpenModal}
        >
          {t('common:add_new')}
        </Button>
      </Flex>

      {/* Tags display */}
      {entryPoints.length > 0 && (
        <Wrap mt={2} spacing={2}>
          {entryPoints.map((item) => (
            <WrapItem key={item.id}>
              <MyTag
                colorSchema={'white'}
                type={'borderFill'}
                p={[1, 2]}
                borderRadius={'4px'}
                fontSize={'xs'}
                cursor={'pointer'}
                onClick={handleOpenModal}
              >
                {item.icon && (
                  <Image
                    src={item.icon}
                    w={'12px'}
                    h={'12px'}
                    mr={1}
                    alt=""
                    borderRadius={'sm'}
                    objectFit={'cover'}
                  />
                )}
                {item.name || t('workflow:entry_point_name_placeholder')}
              </MyTag>
            </WrapItem>
          ))}
        </Wrap>
      )}

      {/* Edit Modal */}
      <MyModal isOpen={isOpen} onClose={handleClose} title={t('workflow:entry_point')} w={'600px'}>
        <ModalBody>
          <Box px={'16px'}>
            {localEntryPoints.map((item) => (
              <ModalEntryPointItem
                key={item.id}
                item={item}
                onNameChange={handleNameChange}
                onIconChange={handleIconChange}
                onDelete={handleDelete}
              />
            ))}

            <Button
              variant={'link'}
              leftIcon={<MyIcon name="common/addLight" w={'14px'} color={'primary.600'} />}
              iconSpacing={1}
              size={'sm'}
              mt={1}
              color={'primary.9'}
              onClick={handleAdd}
            >
              {t('workflow:add_entry_point')}
            </Button>
          </Box>
        </ModalBody>

        <ModalFooter>
          <Button variant={'whiteBase'} mr={3} onClick={handleClose}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={handleConfirm}>{t('common:Confirm')}</Button>
        </ModalFooter>
      </MyModal>
    </Box>
  );
};

type ModalItemProps = {
  item: EntryPointItemType;
  onNameChange: (id: string, name: string) => void;
  onIconChange: (id: string, icon: string) => void;
  onDelete: (id: string) => void;
};

const ModalEntryPointItem = ({ item, onNameChange, onIconChange, onDelete }: ModalItemProps) => {
  const { t } = useTranslation();

  const { Component: AvatarInputComponent, handleFileSelectorOpen } = useUploadAvatar(
    (params) => getUploadAvatarPresignedUrl({ ...params, autoExpired: false }),
    {
      onSuccess: (url) => onIconChange(item.id, url),
      maxW: 64,
      maxH: 64,
      maxSize: 1024 * 200
    }
  );

  return (
    <Flex mb={2} alignItems={'center'} gap={2}>
      {/* 系统配置功能入口项：包含图标上传和名称输入 */}
      {/* Icon upload area */}
      <Box
        flexShrink={0}
        w={'32px'}
        h={'32px'}
        borderRadius={'6px'}
        border={'1px dashed'}
        borderColor={'myGray.200'}
        bg={'white'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        cursor={'pointer'}
        overflow={'hidden'}
        position={'relative'}
        onClick={handleFileSelectorOpen}
        _hover={{
          borderColor: 'primary.500',
          '& .icon-upload-overlay': { opacity: 1 }
        }}
      >
        {item.icon ? (
          <>
            <Image src={item.icon} w={'full'} h={'full'} objectFit={'cover'} alt="" />
            <Box
              className="icon-upload-overlay"
              position={'absolute'}
              inset={0}
              bg={'blackAlpha.500'}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              opacity={0}
              transition={'opacity 0.15s'}
            >
              <MyIcon name={'image'} w={'14px'} color={'white'} />
            </Box>
          </>
        ) : (
          <MyIcon name={'image'} w={'16px'} color={'myGray.400'} />
        )}
        <AvatarInputComponent />
      </Box>

      <Input
        flex={1}
        size={'sm'}
        value={item.name}
        placeholder={t('workflow:entry_point_name_placeholder')}
        onChange={(e) => onNameChange(item.id, e.target.value)}
        borderRadius={'md'}
        isInvalid={!item.name.trim()}
      />
      <MyIcon
        name={'delete'}
        w={'16px'}
        cursor={'pointer'}
        color={'myGray.400'}
        _hover={{ color: 'red.500' }}
        onClick={() => onDelete(item.id)}
      />
    </Flex>
  );
};

export default EntryPointEdit;
