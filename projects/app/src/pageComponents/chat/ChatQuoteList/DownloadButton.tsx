import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useTranslation } from 'next-i18next';
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
        Button={
          <MyIconButton
            icon="common/download"
            size={'1rem'}
            border={'1px solid'}
            borderColor={'myGray.250'}
            boxShadow={
              '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
            }
          />
        }
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
