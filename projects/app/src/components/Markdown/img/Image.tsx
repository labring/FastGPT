import React, { WheelEventHandler, useState, MouseEventHandler, TouchEventHandler, useRef } from 'react';
import {
  Box,
  Image,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Skeleton,
  useDisclosure
} from '@chakra-ui/react';

const MdImage = ({ src }: { src?: string }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [succeed, setSucceed] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [scale, setScale] = useState(1);

  const [positionLeft, setPositionLeft] = useState(0)
  const [positionTop, setPositionTop] = useState(0)
  const [store] = useState({
    scale: 1,
    moveable: false,
    pageX: 0,
    pageY: 0,
    pageX2: 0,
    pageY2: 0,
    originScale: 1
  })

  // 自定义Modal关闭事件
  const customOnClose = (): void => {
    setPositionLeft(0)
    setPositionTop(0)
    setScale(1)
    onClose()
  }

  const handleWheel: WheelEventHandler<HTMLImageElement> = (e) => {
    setScale((prevScale) => {
      const newScale = prevScale + e.deltaY * 0.5 * -0.01;
      if (newScale < 0.5) return 0.5;
      if (newScale > 10) return 10;
      return newScale;
    });
  };

  const handleTouchStart: TouchEventHandler<HTMLImageElement> = (event) => {
    let touches = event.touches;
    let events = touches[0];//单指
    let events2 = touches[1];//双指
    if (touches.length == 1) {// 单指操作
      store.pageX = events.pageX
      store.pageY = events.pageY
      store.moveable = true;
    } else {
      // 第一个触摸点的坐标
      store.pageX = events.pageX;
      store.pageY = events.pageY;
      store.moveable = true;
      if (events2) {
        store.pageX2 = events2.pageX;
        store.pageY2 = events2.pageY;
      }
      store.originScale = store.scale || 1;
    }
  }

  const handleTouchMove: TouchEventHandler<HTMLImageElement> = (event) => {
    if (!store.moveable) {
      return;
    }
    let touches = event.touches;
    let events = touches[0];
    let events2 = touches[1];
    //最大移动距离
    let moveMaxWith = (Number(imgRef.current?.width) * scale - window.innerWidth) / 2;
    let moveMaxHeight = (Number(imgRef.current?.height) * scale - window.innerHeight) / 2;

    if (touches.length == 1) {
      //未放大，不移动图片
      if (scale <= 1)
        return;

      let pageX = store.pageX;
      let pageY = store.pageY
      let pageX2 = events.pageX;
      let pageY2 = events.pageY;

      let newLeft = positionLeft + pageX2 / 20 - pageX / 20;
      let newTop = positionTop + pageY2 / 20 - pageY / 20;
      if (Math.abs(newLeft) > moveMaxWith) {
        if (newLeft > 0) {
          newLeft = moveMaxWith;
        }
        else {
          newLeft = 0 - moveMaxWith;
        }
      }
      // 放大倍数没超过屏高
      if (moveMaxHeight < 0) {
        newTop = 0;
      }
      else if (Math.abs(newTop) > moveMaxHeight) {
        if (newTop > 0) {
          newTop = moveMaxHeight;
        }
        else {
          newTop = 0 - moveMaxHeight;
        }
      }

      //控制图片移动
      setPositionLeft(newLeft)
      setPositionTop(newTop)
    } else {
      // 双指移动
      if (events2) {
        // 第2个指头坐标在touchmove时候获取
        store.pageX2 = events2.pageX;
        store.pageY2 = events2.pageY;

        // 获取坐标之间的距离
        let getDistance = function (start: any, stop: any) {
          //用到三角函数
          return Math.hypot(stop.x - start.x,
            stop.y - start.y);
        };
        // 双指缩放比例计算
        let zoom = getDistance({
          x: events.pageX,
          y: events.pageY
        }, {
          x: events2.pageX,
          y: events2.pageY
        }) / getDistance({
          x: store.pageX,
          y: store.pageY
        }, {
          x: store.pageX2,
          y: store.pageY2
        });
        // 应用在元素上的缩放比例
        let newScale = store.originScale * zoom;

        // 缩放比例限制
        if (newScale > 10) {
          newScale = 10;
        }
        if (newScale <= 1) {
          newScale = 1;
        }

        store.scale = newScale;
        // 图像应用缩放效果
        setScale(newScale);
        // 如果是缩小图片，则限制移动的距离
        if (Math.abs(positionLeft) > moveMaxWith) {
          if (positionLeft > 0) {
            setPositionLeft(moveMaxWith);
          }
          else {
            setPositionLeft(0 - moveMaxWith);
          }
        }

        if (moveMaxHeight < 0) {
          setPositionTop(0);
        }
        else if (Math.abs(positionTop) > moveMaxHeight) {
          if (positionTop > 0) {
            setPositionTop(moveMaxHeight);
          }
          else {
            setPositionTop(0 - moveMaxHeight);
          }
        }
      }
    }

  }

  const handleTouchEnd: TouchEventHandler<HTMLImageElement> = (e) => {
    store.moveable = false;
    store.pageX2 = 0;
    store.pageY2 = 0;
  }

  const handleTouchCancel: TouchEventHandler<HTMLImageElement> = (e) => {
    store.moveable = false;
    store.pageX2 = 0;
    store.pageY2 = 0;
  }

  return (
    <>
      <Image
        borderRadius={'md'}
        src={src}
        alt={''}
        fallbackSrc={'/imgs/errImg.png'}
        fallbackStrategy={'onError'}
        cursor={succeed ? 'pointer' : 'default'}
        loading="lazy"
        objectFit={'contain'}
        referrerPolicy="no-referrer"
        minW={'120px'}
        minH={'120px'}
        my={1}
        onLoad={() => {
          setIsLoading(false);
          setSucceed(true);
        }}
        onError={() => setIsLoading(false)}
        onClick={() => {
          if (!succeed) return;
          onOpen();
        }}
      />
      <Modal isOpen={isOpen} onClose={customOnClose} isCentered>
        <ModalOverlay />
        <ModalContent boxShadow={'none'} maxW={'auto'} w="auto" bg={'transparent'}>
          <Image
            ref={imgRef}
            transform={`scale(${scale})`}
            borderRadius={'md'}
            src={src}
            alt={''}
            w={'100%'}
            maxH={'80vh'}
            referrerPolicy="no-referrer"
            fallbackSrc={'/imgs/errImg.png'}
            fallbackStrategy={'onError'}
            objectFit={'contain'}
            position={'relative'}
            top={positionTop + 'px'}
            left={positionLeft + "px"}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          />
        </ModalContent>
        <ModalCloseButton bg={'myWhite.500'} zIndex={999999} />
      </Modal>
    </>
  );
};

export default React.memo(MdImage);
