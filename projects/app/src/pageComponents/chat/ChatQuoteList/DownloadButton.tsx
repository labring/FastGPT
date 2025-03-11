import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useTranslation } from 'react-i18next';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const DownloadButton = ({
  canAccessRawData,
  onDownload,
  onRead
}: {
  canAccessRawData: boolean;
  onDownload: () => void;
  onRead: () => void;
}) => {
  const { t } = useTranslation();

  if (canAccessRawData) {
    return (
      <MyMenu
        size={'xs'}
        Button={<MyIconButton icon="common/download" size={'1rem'} />}
        menuList={[
          {
            children: [
              {
                label: t('chat:download_chunks'),
                type: 'grayBg',
                onClick: onDownload
              },
              {
                label: t('chat:read_raw_source'),
                type: 'grayBg',
                onClick: onRead
              }
            ]
          }
        ]}
      />
    );
  }

  return <MyIconButton icon="common/download" size={'1rem'} onClick={onDownload} />;
};

export default DownloadButton;
