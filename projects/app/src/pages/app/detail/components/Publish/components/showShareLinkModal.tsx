import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useI18n } from '@/web/context/I18n';
import { Box, Flex, ModalBody } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';

export type ShowShareLinkModalProps = {
  shareLink: string;
  onClose: () => void;
};

function ShowShareLinkModal({ shareLink, onClose }: ShowShareLinkModalProps) {
  const { publishT, commonT } = useI18n();
  const { copyData } = useCopyData();

  return (
    <MyModal onClose={onClose} title={publishT('show_share_link_modal_title')}>
      <ModalBody>
        <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'}>
          <Flex
            p={3}
            bg={'myWhite.500'}
            border="base"
            borderTopLeftRadius={'md'}
            borderTopRightRadius={'md'}
          >
            <Box flex={1}>将下面链接复制并填入对应位置</Box>
            <MyIcon
              name={'copy'}
              w={'16px'}
              color={'myGray.600'}
              cursor={'pointer'}
              _hover={{ color: 'primary.500' }}
              onClick={() => copyData(shareLink)}
            />
          </Flex>
          <Box whiteSpace={'pre'} p={3} overflowX={'auto'}>
            {shareLink}
          </Box>
        </Box>
      </ModalBody>
    </MyModal>
  );
}

export default ShowShareLinkModal;
