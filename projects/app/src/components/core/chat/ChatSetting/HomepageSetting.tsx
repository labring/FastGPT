import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyInput from '@/components/MyInput';
import { useState } from 'react';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';
import type { ChatSettingTabOptionEnum } from '@/global/core/chat/constants';

type Props = {
  settingTabOption: `${ChatSettingTabOptionEnum}`;
  onDiagramShow: (show: boolean) => void;
  onTabChange: (tab: `${ChatSettingTabOptionEnum}`) => void;
  onSettingsRefresh: () => Promise<void>;
};

const HomepageSetting = ({ settingTabOption, onDiagramShow, onTabChange, onSettingsRefresh }: Props) => {
  const { t } = useTranslation();

  const [slogan, setSlogan] = useState('');
  const [dialogueTips, setDialogueTips] = useState('');

  return (
    <Flex flexDir="column" px={6} py={5} gap={'52px'} h="full">
      <Box flexShrink={0}>
        <SettingTabs settingTabOption={settingTabOption} onTabChange={onTabChange} />
      </Box>

      <Flex
        flexGrow={1}
        overflowY={'auto'}
        justifyContent={'flex-start'}
        alignItems={'center'}
        flexDir="column"
        w="630px"
        alignSelf="center"
      >
        <Flex flexDir="column" gap={6} w="100%">
          <Box fontWeight={'500'}>
            <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
              <Box>{t('chat:setting.home.slogan')}</Box>

              <Button
                variant={'link'}
                size={'sm'}
                color={'primary.600'}
                _hover={{ textDecoration: 'none', color: 'primary.400' }}
                _active={{ color: 'primary.600' }}
                onClick={() => onDiagramShow(true)}
              >
                {t('chat:setting.home.diagram')}
              </Button>
            </Flex>

            <Box>
              <MyInput
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
                placeholder={t('chat:setting.home.slogan_placeholder')}
              />
            </Box>
          </Box>

          <Box fontWeight={'500'}>
            <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
              <Box>{t('chat:setting.home.dialogue_tips')}</Box>

              <Button
                variant={'link'}
                size={'sm'}
                color={'primary.600'}
                _hover={{ textDecoration: 'none', color: 'primary.400' }}
                _active={{ color: 'primary.600' }}
                onClick={() => onDiagramShow(true)}
              >
                {t('chat:setting.home.diagram')}
              </Button>
            </Flex>

            <Box>
              <MyInput
                value={dialogueTips}
                onChange={(e) => setDialogueTips(e.target.value)}
                placeholder={t('chat:setting.home.dialogue_tips_placeholder')}
              />
            </Box>
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default HomepageSetting;
