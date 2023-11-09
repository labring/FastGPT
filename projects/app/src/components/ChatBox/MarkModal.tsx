import React, { useState } from 'react';

const MarkModal = () => {
  const [adminMarkData, setAdminMarkData] = useState<{
    chatItemId: string;
    dataId?: string;
    datasetId?: string;
    collectionId?: string;
    q: string;
    a: string;
  }>();

  return <div>MarkModal</div>;
};

export default MarkModal;
