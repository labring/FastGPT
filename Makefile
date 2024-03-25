.PHONY: install\
build_image

IMAGE_NAME = fastgpt
IMAGE_VERSION = 4.6.8-20240312
IMAGE_TAG = mickeyzhoudocker/${IMAGE_NAME}:${IMAGE_VERSION}

install: 
	pnpm i

build_image:
	docker build -t ${IMAGE_TAG} --platform linux/amd64 --build-arg name=app --build-arg proxy=taobao .

save_image:
	docker save -o ${IMAGE_NAME}-${IMAGE_VERSION}.tar ${IMAGE_TAG}