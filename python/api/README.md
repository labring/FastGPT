# FastGPT-python-API
作者：stakeswky。有问题请这样联系我：stakeswky@gmail.com
## 1. 项目简介
该API以python为技术栈，为fastgpt提供了一个简单易用的接口，方便fastgpt处理各种任务。该API的主要功能包括：
1. Word & PDF 图文提取
在现有的文件读取中，fastgpt只能读取文件中的文字，而无法读取图片。该API可以将word和pdf中的文字和图片提取出来，方便fastgpt进行处理。

2. 网页递归获取
该API可以递归获取指定页面的内容和挖掘该页面存在的链接指向页面的内容，请注意，该功能现在仅支持获取静态页面的内容，如果出现动态页面，可能会出现无法获取的情况。

3. （研发中。。）

## 2. 安装方法
### 必要的知识
会使用Google  
python的基本用法  
docker的基本用法  
百度OCR-API的文档：https://ai.baidu.com/ai-doc/OCR/Ek3h7xypm

### 2.1 源码安装
该API依赖于python3.8，请确保您的python版本符合要求。
```shell
pip install -r requirements.txt
```
引入环境变量：APP_ID,API_KEY,SECRET_KEY

然后运行：
```shell
python main.py
```
启动！

### 2.2 Docker安装
一把梭拉现成的镜像，直接拉下来用就行了。
```shell
docker pull registry.cn-hangzhou.aliyuncs.com/fastgpt_docker/fastgpt_python_api:1.0
```
然后运行,三个环境变量记得配置成自己的：
```shell
docker run -d -p 6010:6010 -e APP_ID=<your_app_id> -e API_KEY=<your_api_key> -e SECRET_KEY=<your_secret_key> registry.cn-hangzhou.aliyuncs.com/fastgpt_docker/fastgpt_python_api:1.0
```

或者你也可以自己打镜像
```shell
docker build -t fastgpt-python-api .
```
然后运行：
```shell
docker run -d -p 6010:6010 -e APP_ID=<your_app_id> -e API_KEY=<your_api_key> -e SECRET_KEY=<your_secret_key> fastgpt-python-api
```
## 3. 使用方法
目录下附带了两个测试案例，分别是word和pdf的图文提取，和网页递归获取。按照那个来使用就好


