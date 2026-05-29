import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useTranslation } from 'next-i18next';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const DownloadButton = ({
  canAccessRawData,
  onDownload,
  onRead,
  onRouteToDataset
}: {
  canAccessRawData: boolean;
  onDownload: () => void;
  onRead: () => void;
  onRouteToDataset?: () => void;
}) => {
  const { t } = useTranslation();
  const datasetMenuItem = onRouteToDataset
    ? {
        icon: 'core/dataset/datasetLightSmall',
        label: t('chat:go_to_dataset'),
        type: 'grayBg' as const,
        onClick: onRouteToDataset
      }
    : undefined;

  if (canAccessRawData) {
    return (
      <MyMenu
        size={'xs'}
        Button={
          <MyIconButton
            icon="more"
            size={'1rem'}
            color={'myGray.600'}
            hoverBg={'myGray.100'}
          />
        }
        menuList={[
          {
            children: [
              {
                icon: 'common/link',
                label: t('chat:read_raw_source'),
                type: 'grayBg',
                onClick: onRead
              },
              {
                icon: 'core/chat/fileDownload',
                label: t('chat:download_chunks'),
                type: 'grayBg',
                onClick: onDownload
              },
              ...(datasetMenuItem ? [datasetMenuItem] : [])
            ]
          }
        ]}
      />
    );
  }

  return (
    <MyIconButton
      icon="more"
      size={'1rem'}
      color={'myGray.600'}
      hoverBg={'myGray.100'}
      onClick={onRouteToDataset || onDownload}
    />
  );
};

export default DownloadButton;
