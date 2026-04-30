# 定义默认变量
proxy=null
image=null

# 定义目标
.PHONY: build

# 检查 target 是否定义
ifndef name
$(error name is not defined)
endif

projectDir=$(or $(wildcard ./projects/$(name)),$(wildcard ./pro/$(name)))

ifeq ($(strip $(projectDir)),)
$(error Unknown project name '$(name)'; expected ./projects/$(name) or ./pro/$(name))
endif

filePath=$(projectDir)/Dockerfile

dev:
	pnpm --filter=@fastgpt/$(name) dev

build:
ifeq ($(proxy), taobao)
	docker build -f $(filePath) -t $(image) . --build-arg proxy=taobao
else ifeq ($(proxy), clash)
	docker build -f $(filePath) -t $(image) . --network host --build-arg HTTP_PROXY=http://127.0.0.1:7890 --build-arg HTTPS_PROXY=http://127.0.0.1:7890
else
	docker build --progress=plain -f $(filePath) -t $(image) .
endif
