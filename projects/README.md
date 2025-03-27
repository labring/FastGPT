# 目录说明

该目录为 FastGPT 主项目。

- app fastgpt 核心应用。
- sandbox 沙盒项目，用于运行工作流里的代码执行 （需求python环境为python:3.11，额外安装的包请于requirements.txt填写，同时注意个别包可能额外安装库（如pandas需要安装libffi））。
  - 新加入python包遇见超时或者权限拦截的问题(确定不是自己的语法问题)，请进入docker容器内部执行以下指令：

  ```shell
    docker exec -it 《替换成容器名》 /bin/bash
    chmod -x testSystemCall.sh
    bash ./testSystemCall.sh
  ```
  
    然后将新的数组替换src下sandbox的constants.py中的SYSTEM_CALLS数组即可

