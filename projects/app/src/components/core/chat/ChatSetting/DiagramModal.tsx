import { Flex, Image } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';

type Props = {
  show: boolean;
  onShow: (show: boolean) => void;
};

const DiagramModal = ({ show, onShow }: Props) => {
  const { t } = useTranslation();

  return (
    <MyModal
      maxW={['90vw', '800px']}
      title={t('chat:setting.copyright.style_diagram')}
      iconSrc="/imgs/modal/info.svg"
      isOpen={show}
      onClose={() => onShow(false)}
    >
      <Flex p={4} justifyContent={'center'} alignItems={'center'}>
        <Image
          src={t('chat:setting.fastgpt_chat_diagram')}
          alt="style diagram"
          objectFit={'cover'}
        />
      </Flex>
    </MyModal>
  );
};

export default DiagramModal;
