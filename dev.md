## Premise

Since FastGPT is managed in the same way as monorepo, it is recommended to install 'make' first during development.

monorepo Project Name:

- app: main project
-......

## Dev

```sh
# Give automatic script code execution permission (on non-Linux systems, you can manually execute the postinstall.sh file content)
chmod -R +x ./scripts/
# Executing under the code root directory installs all dependencies within the root package, projects, and packages
pnpm i

# Not make cmd
cd projects/app
pnpm dev

# Make cmd
make dev name=app
```


## Build

```sh
# Docker cmd: Build image, not proxy
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app
# Make cmd: Build image, not proxy
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1

# Docker cmd: Build image with proxy
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app --build-arg proxy=taobao
# Make cmd: Build image with proxy
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 proxy=taobao
```

