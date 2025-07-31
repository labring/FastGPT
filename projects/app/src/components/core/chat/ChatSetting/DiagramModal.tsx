import { Flex, Image } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

type Props = {
  show: boolean;
  onShow: (show: boolean) => void;
};

const DiagramModal = ({ show, onShow }: Props) => {
  const { t } = useTranslation();
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
      title={t('chat:setting.copyright.style_diagram')}
      iconSrc="/imgs/modal/info.svg"
      isOpen={show}
      onClose={() => onShow(false)}
    >
      <Flex p={4} justifyContent={'center'} alignItems={'center'}>
        <Image src={diagramImageSrc} alt="style diagram" objectFit={'cover'} />
      </Flex>
    </MyModal>
  );
};

export default DiagramModal;
