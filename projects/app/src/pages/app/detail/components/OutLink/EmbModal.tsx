import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import React from 'react';
import MyModal from '@/components/MyModal';

const EmbModal = ({ share }: { share: OutLinkSchema }) => {
  return <MyModal isOpen>EmbModal</MyModal>;
};

export default EmbModal;
