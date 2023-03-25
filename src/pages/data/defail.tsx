import React from 'react';

const DataDetail = ({ dataId }: { dataId: string }) => {
  return <div>DataDetail</div>;
};

export default DataDetail;

export async function getServerSideProps(context: any) {
  const dataId = context.query?.dataId || '';

  return {
    props: { dataId }
  };
}
