import { Button } from '@chakra-ui/react';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';

const DownloadButton = ({
  canAccessRawData,
  onDownload,
  onRead,
  isLoading
}: {
  canAccessRawData: boolean;
  onDownload: () => void;
  onRead: () => void;
  isLoading: boolean;
}) => {
  const { t } = useTranslation();

  if (canAccessRawData) {
    return (
      <MyMenu
        size={'xs'}
        Button={
          <Button
            variant={'whitePrimary'}
            size={'xs'}
            fontSize={'mini'}
            leftIcon={<MyIcon name={'common/download'} w={'4'} />}
            isLoading={isLoading}
          >
            {t('common:Download')}
          </Button>
        }
        menuList={[
          {
            children: [
              {
                label: t('common:core.dataset.Download the parsed content'),
                type: 'grayBg',
                onClick: onDownload
              },
              {
                label: t('common:core.dataset.Get the raw data'),
                type: 'grayBg',
                onClick: onRead
              }
            ]
          }
        ]}
      />
    );
  }

  return (
    <Button
      variant={'whitePrimary'}
      size={'xs'}
      fontSize={'mini'}
      leftIcon={<MyIcon name={'common/download'} w={'4'} />}
      onClick={onDownload}
      isLoading={isLoading}
    >
      {t('common:Download')}
    </Button>
  );
};

export default DownloadButton;
