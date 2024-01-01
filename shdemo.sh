# docker sh demo
# You need to switch to your mirror source

# Build image, not proxy
docker build -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.4.7 --build-arg name=app .

# build image with proxy
docker build -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.4.7 --build-arg name=app --build-arg proxy=taobao .
