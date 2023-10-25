import React from 'react';
import { AppSchema } from '@/types/mongoSchema';

import Header from './Header';
import Flow from '@/pages/app/components/Flow';

type Props = { app: AppSchema; onCloseSettings: () => void };

const AdEdit = ({ app, onCloseSettings }: Props) => {
  return (
    <Flow
      modules={app.modules}
      filterAppIds={[app._id]}
      Header={<Header app={app} onCloseSettings={onCloseSettings} />}
    />
  );
};

export default AdEdit;
