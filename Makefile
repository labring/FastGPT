# 定义默认变量
proxy=null
image=null

# 定义目标
.PHONY: build

# 检查 target 是否定义
ifndef name
$(error name is not defined)
endif

filePath=./projects/$(name)/Dockerfile

dev:
	pnpm --prefix ./projects/$(name) dev

build:
ifeq ($(proxy), taobao)
	docker build -f $(filePath) -t $(image) . --build-arg proxy=taobao 
else ifeq ($(proxy), clash)
	docker build -f $(filePath) -t $(image) . --network host --build-arg HTTP_PROXY=http://127.0.0.1:7890 --build-arg HTTPS_PROXY=http://127.0.0.1:7890
else
	docker build -f $(filePath) -t $(image) .
endif