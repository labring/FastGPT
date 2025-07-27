import { Flex, Image } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useChatSettingContext } from '@/web/core/chat/context/chatSettingContext';

const DiagramModal = () => {
  const { t } = useTranslation();
  const { showDiagram, setShowDiagram } = useChatSettingContext();
  const { i18n } = useTranslation();

  const diagramImageSrc = useMemo(() => {
    switch (i18n.language) {
      case 'en':
        return '/imgs/fastgpt_chat_diagram_en.png';
      case 'zh-Hant':
        return '/imgs/fastgpt_chat_diagram_zhHans.png';
      default:
        return '/imgs/fastgpt_chat_diagram.png';
    }
  }, [i18n.language]);

  return (
    <MyModal
      maxW={['90vw', '800px']}
      title={t('common:core.chat.setting.Copyright Style Diagram')}
      iconSrc="/imgs/modal/info.svg"
      isOpen={showDiagram}
      onClose={() => setShowDiagram(false)}
    >
      <Flex p={4} justifyContent={'center'} alignItems={'center'}>
        <Image src={diagramImageSrc} alt="style diagram" objectFit={'cover'} />
      </Flex>
    </MyModal>
  );
};

export default DiagramModal;
