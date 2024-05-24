.PHONY: install\
build_image

IMAGE_NAME = cmsrllm
IMAGE_VERSION = 4.8.0-20240524
IMAGE_TAG = mickeyzhoudocker/${IMAGE_NAME}:${IMAGE_VERSION}

install: 
	pnpm i

build_image:
	docker build -t ${IMAGE_TAG} --platform linux/amd64 --build-arg name=app --build-arg proxy=taobao .

save_image:
	docker save -o ${IMAGE_NAME}-${IMAGE_VERSION}.tar ${IMAGE_TAG}