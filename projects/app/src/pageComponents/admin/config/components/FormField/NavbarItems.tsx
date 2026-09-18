import { Box, Button, Flex, Input, Switch } from '@chakra-ui/react';
import React, { useCallback, useEffect, useState } from 'react';
import FormLabel from '../FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useForm } from 'react-hook-form';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { NavbarItemType } from '@fastgpt/global/common/system/types';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';

const defaultNavbarItem: NavbarItemType = {
  id: '',
  name: '',
  avatar: '',
  url: '',
  isActive: true
};

const NavbarItems = ({
  value: navbarList = [],
  onChange,
  title,
  description
}: {
  value?: NavbarItemType[];
  onChange: (value: NavbarItemType[]) => void;
  title: string;
  description: string;
}) => {
  const [currentNavbarItem, setCurrentNavbarItem] = useState<NavbarItemType>();

  const onSubmit = (data: NavbarItemType) => {
    if (currentNavbarItem?.id) {
      const newNavbarItems = navbarList.map((item) =>
        item.id === currentNavbarItem.id ? data : item
      );
      onChange(newNavbarItems);
    } else {
      onChange([...navbarList, { ...data, id: getNanoid() }]);
    }

    setCurrentNavbarItem(undefined);
  };

  useEffect(() => {
    if (!Array.isArray(navbarList)) {
      onChange([]);
    }
  }, [navbarList, onChange]);

  return (
    <>
      <Flex alignItems={'center'} justifyContent={'space-between'}>
        <FormLabel title={title} description={description} />
        <Button
          size={'sm'}
          leftIcon={<MyIcon name={'common/addLight'} width={4} />}
          onClick={() => setCurrentNavbarItem(defaultNavbarItem)}
        >
          新增
        </Button>
      </Flex>

      <Flex
        bg={'myGray.100'}
        h={8}
        mt={4}
        pl={8}
        rounded={'md'}
        alignItems={'center'}
        fontSize={'mini'}
        fontWeight={'medium'}
      >
        <Box w={3 / 10}>名称</Box>
        <Box w={1 / 10} pl={4}>
          启用
        </Box>
        <Box w={4 / 10}>跳转链接</Box>
        <Box w={2 / 10}>操作</Box>
      </Flex>
      <Box mt={2}>
        <DndDrag<NavbarItemType>
          onDragEndCb={async (list: NavbarItemType[]) => {
            onChange(list);
          }}
          dataList={navbarList}
        >
          {({ provided }) => (
            <Flex
              gap={1}
              flexDirection={'column'}
              {...provided.droppableProps}
              ref={provided.innerRef}
            >
              {navbarList.map((item, index) => (
                <Draggable key={item.name} draggableId={item.name} index={index}>
                  {(provided, snapshot) => (
                    <MyBox
                      display={'flex'}
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={{
                        ...provided.draggableProps.style,
                        opacity: snapshot.isDragging ? 0.8 : 1
                      }}
                      alignItems={'center'}
                      h={12}
                      _hover={{
                        bg: 'primary.50'
                      }}
                    >
                      <Box display={'flex'} alignItems={'center'} w={3 / 10} pr={6}>
                        <Flex
                          h={'full'}
                          rounded={'xs'}
                          ml={2}
                          mr={2.5}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          _hover={{ bg: 'myGray.05' }}
                          {...provided.dragHandleProps}
                        >
                          <MyIcon name="drag" w={'14px'} color={'myGray.500'} cursor={'grab'} />
                        </Flex>
                        <Avatar src={item.avatar} borderRadius={'xs'} w={'20px'} />
                        <Box
                          pl={1.5}
                          fontWeight={'medium'}
                          whiteSpace={'nowrap'}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                        >
                          {item.name}
                        </Box>
                      </Box>
                      <Box w={1 / 10} pl={9}>
                        <Box as={'span'}>
                          <Switch
                            isChecked={item.isActive}
                            size={'sm'}
                            onChange={(e) => {
                              const newNavbarItems = navbarList.map((currentItem) => ({
                                ...currentItem,
                                isActive:
                                  currentItem.id === item.id
                                    ? e.target.checked
                                    : currentItem.isActive
                              }));
                              onChange(newNavbarItems);
                            }}
                          />
                        </Box>
                      </Box>
                      <Box
                        w={4 / 10}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                        pl={5}
                        color={'myGray.600'}
                        fontSize={'sm'}
                      >
                        {item?.url}
                      </Box>
                      <Box w={2 / 10} pl={2} display={'flex'} gap={4}>
                        <Flex
                          color={'myGray.500'}
                          _hover={{ bg: 'myGray.05', color: 'primary.600' }}
                          rounded={'xs'}
                          p={1}
                          cursor={'pointer'}
                          onClick={() => {
                            setCurrentNavbarItem(item);
                          }}
                        >
                          <MyIcon name={'edit'} w={'16px'} />
                        </Flex>
                        <Flex
                          color={'myGray.500'}
                          _hover={{ bg: 'myGray.05', color: 'red.500' }}
                          rounded={'xs'}
                          p={1}
                          cursor={'pointer'}
                          onClick={() => {
                            const newNavbarItems = navbarList.filter(
                              (currentItem) => currentItem.id !== item.id
                            );
                            onChange(newNavbarItems);
                          }}
                        >
                          <MyIcon name={'delete'} w={'16px'} />
                        </Flex>
                      </Box>
                    </MyBox>
                  )}
                </Draggable>
              ))}
            </Flex>
          )}
        </DndDrag>
      </Box>
      {currentNavbarItem && (
        <NavbarItemModal
          currentNavbarItem={currentNavbarItem}
          onClose={() => setCurrentNavbarItem(undefined)}
          onSubmit={onSubmit}
        />
      )}
    </>
  );
};

export default React.memo(NavbarItems);

const NavbarItemModal = ({
  currentNavbarItem,
  onClose,
  onSubmit
}: {
  currentNavbarItem: NavbarItemType;
  onClose: () => void;
  onSubmit: (data: NavbarItemType) => void;
}) => {
  const { register, setValue, watch, handleSubmit } = useForm({
    defaultValues: currentNavbarItem
  });

  const avatar = watch('avatar');

  const afterUploadAvatar = useCallback(
    (avatar: string) => {
      setValue('avatar', avatar);
    },
    [setValue]
  );
  const { Component: AvatarUploader, handleFileSelectorOpen } = useUploadAvatar(
    getUploadAvatarPresignedUrl,
    {
      onSuccess: afterUploadAvatar
    }
  );

  return (
    <MyModal
      title={'新增侧边项'}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>确定</Button>
        </>
      }
    >
      <Box color={'myGray.800'} fontWeight={'bold'} mb={2}>
        头像 & 名称
      </Box>
      <Flex>
        <MyTooltip label={'点击上传头像'}>
          {avatar ? (
            <Avatar
              flexShrink={0}
              src={avatar}
              w={['28px', '36px']}
              h={['28px', '36px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={handleFileSelectorOpen}
            />
          ) : (
            <Box
              w={['28px', '36px']}
              h={['28px', '36px']}
              cursor={'pointer'}
              borderRadius={'md'}
              border={'1px dashed'}
              borderColor={'myGray.300'}
              color={'myGray.500'}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              _hover={{ color: 'primary.600', borderColor: 'primary.300' }}
              onClick={handleFileSelectorOpen}
            >
              <MyIcon name="export" w={'16px'} h={'16px'} />
            </Box>
          )}
        </MyTooltip>
        <Input
          flex={1}
          ml={3}
          autoFocus
          placeholder={'侧边项名'}
          bg={'myWhite.600'}
          {...register('name', {
            required: '侧边项名不能为空'
          })}
        />
      </Flex>
      <Box color={'myGray.800'} fontWeight={'bold'} mt={6} mb={2}>
        跳转链接
      </Box>
      <Input
        flex={1}
        bg={'myWhite.600'}
        placeholder={'跳转链接'}
        {...register('url', {
          required: '跳转链接不能为空'
        })}
      />

      <AvatarUploader />
    </MyModal>
  );
};
