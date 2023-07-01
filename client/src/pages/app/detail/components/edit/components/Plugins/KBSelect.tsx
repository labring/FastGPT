import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Flex,
  Box,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalHeader,
  ModalFooter,
  ModalCloseButton,
  useTheme,
  useDisclosure,
  Grid
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import Avatar from '@/components/Avatar';

const KBSelect = ({
  relatedKbs = [],
  onChange
}: {
  relatedKbs: string[];
  onChange: (e: string[]) => void;
}) => {
  const theme = useTheme();
  const { myKbList, loadKbList } = useUserStore();
  const [selectedIdList, setSelectedIdList] = useState<string[]>(relatedKbs);
  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const showKbList = useMemo(
    () => myKbList.filter((item) => relatedKbs.includes(item._id)),
    [myKbList, relatedKbs]
  );

  useEffect(() => {
    loadKbList();
  }, []);

  return (
    <>
      <Grid gridTemplateColumns={'1fr 1fr'} gridGap={4}>
        <Button h={'36px'} onClick={onOpenKbSelect}>
          选择知识库
        </Button>
        {showKbList.map((item) => (
          <Flex
            key={item._id}
            alignItems={'center'}
            h={'36px'}
            border={theme.borders.base}
            px={2}
            borderRadius={'md'}
          >
            <Avatar src={item.avatar} w={'24px'}></Avatar>
            <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
              {item.name}
            </Box>
          </Flex>
        ))}
      </Grid>
      <Modal isOpen={isOpenKbSelect} onClose={onCloseKbSelect}>
        <ModalOverlay />
        <ModalContent
          display={'flex'}
          flexDirection={'column'}
          w={'800px'}
          maxW={'90vw'}
          h={['90vh', 'auto']}
        >
          <ModalHeader>关联的知识库({selectedIdList.length})</ModalHeader>
          <ModalCloseButton />
          <ModalBody
            flex={['1 0 0', '0 0 auto']}
            maxH={'80vh'}
            overflowY={'auto'}
            display={'grid'}
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
            gridGap={3}
          >
            {myKbList.map((item) => (
              <Card
                key={item._id}
                p={3}
                border={theme.borders.base}
                boxShadow={'sm'}
                h={'80px'}
                cursor={'pointer'}
                order={relatedKbs.includes(item._id) ? 0 : 1}
                _hover={{
                  boxShadow: 'md'
                }}
                {...(selectedIdList.includes(item._id)
                  ? {
                      bg: 'myBlue.300'
                    }
                  : {})}
                onClick={() => {
                  let ids = [...selectedIdList];
                  if (!selectedIdList.includes(item._id)) {
                    ids = ids.concat(item._id);
                  } else {
                    const i = ids.findIndex((id) => id === item._id);
                    ids.splice(i, 1);
                  }

                  ids = ids.filter((id) => myKbList.find((item) => item._id === id));
                  setSelectedIdList(ids);
                }}
              >
                <Flex alignItems={'center'} h={'38px'}>
                  <Avatar src={item.avatar} w={['24px', '28px', '32px']}></Avatar>
                  <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
                    {item.name}
                  </Box>
                </Flex>
              </Card>
            ))}
          </ModalBody>

          <ModalFooter>
            <Button
              onClick={() => {
                onCloseKbSelect();
                onChange(selectedIdList);
              }}
            >
              完成
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default KBSelect;
