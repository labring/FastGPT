import React, { useState } from 'react';
import { Textarea, Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { AppModuleItemType } from '@/types/app';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';

const ImportSettings = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (modules: AppModuleItemType[]) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [value, setValue] = useState('');

  return (
    <MyModal isOpen w={'600px'} onClose={onClose} title={t('app.Import Config')}>
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
          variant="base"
          onClick={() => {
            if (!value) {
              return onClose();
            }
            try {
              const data = JSON.parse(value);
              onSuccess(data);
              onClose();
            } catch (error) {
              toast({
                title: t('app.Import Config Failed')
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

export default ImportSettings;
