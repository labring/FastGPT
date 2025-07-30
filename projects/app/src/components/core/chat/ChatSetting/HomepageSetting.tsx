import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyInput from '@/components/MyInput';
import { useState } from 'react';
import { useChatSettingContext } from '@/web/core/chat/context/chatSettingContext';

const HomepageSetting = () => {
  const { t } = useTranslation();
  const { setShowDiagram } = useChatSettingContext();

  const [slogan, setSlogan] = useState('');
  const [dialogueTips, setDialogueTips] = useState('');

  return (
    <Flex flexDir="column" gap={6} w="100%">
      <Box fontWeight={'500'}>
        <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
          <Box>Slogan</Box>

          <Button
            variant={'link'}
            size={'sm'}
            color={'primary.600'}
            _hover={{ textDecoration: 'none', color: 'primary.400' }}
            _active={{ color: 'primary.600' }}
            onClick={() => setShowDiagram(true)}
          >
            {t('common:core.chat.setting.Copyright Diagram')}
          </Button>
        </Flex>

        <Box>
          <MyInput
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="Slogan"
          />
        </Box>
      </Box>

      <Box fontWeight={'500'}>
        <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
          <Box>对话框提示文字</Box>

          <Button
            variant={'link'}
            size={'sm'}
            color={'primary.600'}
            _hover={{ textDecoration: 'none', color: 'primary.400' }}
            _active={{ color: 'primary.600' }}
            onClick={() => setShowDiagram(true)}
          >
            {t('common:core.chat.setting.Copyright Diagram')}
          </Button>
        </Flex>

        <Box>
          <MyInput
            value={dialogueTips}
            onChange={(e) => setDialogueTips(e.target.value)}
            placeholder="你可以问我任何问题"
          />
        </Box>
      </Box>
    </Flex>
  );
};

export default HomepageSetting;
