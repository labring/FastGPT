SERVICE_NAME=fastgpt
# Image URL to use all building/pushing image targets
IMG ?= $(SERVICE_NAME):latest

.PHONY: all
all: build

##@ General

# The help target prints out all targets with their descriptions organized
# beneath their categories. The categories are represented by '##@' and the
# target descriptions by '##'. The awk commands is responsible for reading the
# entire set of makefiles included in this invocation, looking for lines of the
# file as xyz: ## something, and then pretty-format the target and help. Then,
# if there's a line with ##@ something, that gets pretty-printed as a category.
# More info on the usage of ANSI control characters for terminal formatting:
# https://en.wikipedia.org/wiki/ANSI_escape_code#SGR_parameters
# More info on the awk command:
# http://linuxcommand.org/lc3_adv_awk.php

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Build

.PHONY: build
build: ## Build desktop-frontend binary.
	pnpm run build

.PHONY: run
run: ## Run a dev service from host.
	pnpm run start

.PHONY: docker-build
docker-build: ## Build docker image with the desktop-frontend.
	docker build -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:latest . --network host  --build-arg HTTP_PROXY=http://127.0.0.1:7890 --build-arg HTTPS_PROXY=http://127.0.0.1:7890

##@ Deployment

.PHONY: docker-run
docker-run:  ## Push docker image.
	docker run -d -p 8008:3000 --name fastgpt -v /web_project/yjl/fastgpt/logs:/app/.next/logs registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:latest

#TODO: add support of docker push

#TODO: add support of sealos apply
