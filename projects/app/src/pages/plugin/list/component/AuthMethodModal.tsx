import MyRadio from '@/components/common/MyRadio';
import { Box, Button, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import { MethodType } from '@fastgpt/global/core/plugin/controller';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

export default function AuthMethodModal({
  onClose,
  setAuthMethod,
  authMethod
}: {
  onClose: () => void;
  setAuthMethod: (e: MethodType) => void;
  authMethod: MethodType;
}) {
  const { t } = useTranslation();
  const [currentMethod, setCurrentMethod] = useState<MethodType>(authMethod);

  return (
    <MyModal isOpen title={t('plugin.Auth Method')} onClose={onClose} w={'450px'}>
      <ModalBody>
        <>
          <Box color={'myGray.800'} fontWeight={'bold'} mb={2} mt={4}>
            {t('plugin.Auth Type')}
          </Box>
          <MyRadio
            gridGap={2}
            gridTemplateColumns={'repeat(2,1fr)'}
            list={[
              {
                title: t('plugin.None'),
                value: t('plugin.None')
              },
              {
                title: 'API Key',
                value: 'API Key'
              }
            ]}
            value={currentMethod.name}
            onChange={(e) => {
              setCurrentMethod({
                ...currentMethod,
                name: e
              });
            }}
          />
          {currentMethod.name === 'API Key' && (
            <>
              <Box color={'myGray.800'} fontWeight={'bold'} mb={2} mt={4}>
                {t('plugin.Auth Header Prefix')}
              </Box>
              <MyRadio
                gridGap={2}
                gridTemplateColumns={'repeat(3,1fr)'}
                list={[
                  {
                    title: 'Basic',
                    value: 'Basic'
                  },
                  {
                    title: 'Bearer',
                    value: 'Bearer'
                  },
                  {
                    title: 'Custom',
                    value: 'Custom'
                  }
                ]}
                value={currentMethod.prefix}
                onChange={(e) => {
                  setCurrentMethod({
                    ...currentMethod,
                    prefix: e
                  });
                }}
              />
              <Box color={'myGray.800'} fontWeight={'bold'} mb={2} mt={4}>
                {t('plugin.Key')}
              </Box>
              <Input
                bg={'myWhite.600'}
                defaultValue={currentMethod.key}
                onChange={(e) => {
                  setCurrentMethod({
                    ...currentMethod,
                    key: e.target.value
                  });
                }}
              />
              <Box color={'myGray.800'} fontWeight={'bold'} mb={2} mt={4}>
                {t('plugin.Value')}
              </Box>
              <Input
                bg={'myWhite.600'}
                defaultValue={currentMethod.value}
                onChange={(e) => {
                  setCurrentMethod({
                    ...currentMethod,
                    value: e.target.value
                  });
                }}
              />
            </>
          )}
        </>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          onClick={() => {
            setAuthMethod(currentMethod);
            onClose();
          }}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}
