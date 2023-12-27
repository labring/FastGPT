import React, { useState } from 'react';
import { Textarea, Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { useToast } from '@/web/common/hooks/useToast';
import { useFlowProviderStore } from './FlowProvider';

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setNodes, setEdges, initData } = useFlowProviderStore();
  const [value, setValue] = useState('');

  return (
    <MyModal
      isOpen
      w={'600px'}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('app.Import Configs')}
    >
      <ModalBody>
        <Textarea
          placeholder={t('app.Paste Config') || 'app.Paste Config'}
          defaultValue={value}
          rows={16}
          onChange={(e) => setValue(e.target.value)}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          variant="whiteBase"
          onClick={() => {
            if (!value) {
              return onClose();
            }
            try {
              const data = JSON.parse(value);
              setEdges([]);
              setNodes([]);
              setTimeout(() => {
                initData(data);
              }, 10);
              onClose();
            } catch (error) {
              toast({
                title: t('app.Import Configs Failed')
              });
            }
          }}
        >
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ImportSettings);
