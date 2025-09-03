import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import React from 'react';
import dynamic from 'next/dynamic';

const ConnectDatabaseForm = dynamic(() => import('../components/ConnectDatabaseForm'));
const DataBaseConfig = dynamic(() => import('../components/DataBaseConfig'));

const ConnectDatabaseConfig = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) =>
    v.isEditMode ? v.tab : v.activeStep
  );

  return (
    <>
      {activeStep === 0 && <ConnectDatabaseForm />}
      {activeStep === 1 && <DataBaseConfig />}
    </>
  );
};

export default React.memo(ConnectDatabaseConfig);
