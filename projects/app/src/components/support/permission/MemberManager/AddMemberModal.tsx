import { Flex, Box, Grid, ModalBody, InputGroup, InputLeftElement, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';

export type AddModalPropsType = {
  onClose: () => void;
};

export function AddMemberModal({ onClose }: AddModalPropsType) {
  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="support/permission/collaborator"
      title="添加协作者"
      minW="800px"
    >
      <ModalBody>
        <Grid
          border="1px solid"
          borderColor="myGray.200"
          mt="6"
          mb="16"
          mx="8"
          borderRadius="0.5rem"
          templateColumns="60% 40%"
        >
          <Flex
            flexDirection="column"
            borderRight="1px solid"
            borderColor="myGray.200"
            p="4"
            minH="200px"
          >
            <InputGroup alignItems="center" h="32px" my="2" py="1">
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
              </InputLeftElement>
              <Input
                placeholder="搜索用户名"
                fontSize="lg"
                bgColor="myGray.50"
                // TODO: Search
              />
            </InputGroup>
            <Flex flexDirection="column" mt="2">
              aaa
            </Flex>
          </Flex>
          <Box p="4">bbb</Box>
        </Grid>
      </ModalBody>
    </MyModal>
  );
}
