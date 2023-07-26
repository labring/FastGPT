import React from 'react';
import { Button, ModalFooter, ModalBody, Image } from '@chakra-ui/react';
import MyModal from '../MyModal';

const WxConcat = ({ onClose }: { onClose: () => void }) => {
  return (
    <MyModal isOpen={true} onClose={onClose} title={'联系方式-wx'}>
      <ModalBody textAlign={'center'}>
        <Image
          style={{ margin: 'auto' }}
          src={'https://otnvvf-imgs.oss.laf.run/wx300.jpg'}
          width={'200px'}
          height={'200px'}
          alt=""
        />
      </ModalBody>

      <ModalFooter>
        <Button variant={'base'} onClick={onClose}>
          关闭
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default WxConcat;
