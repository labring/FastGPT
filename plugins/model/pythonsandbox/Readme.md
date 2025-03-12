
# FastGPT Python Sandbox

#### 1 功能

为FastGPT的代码运行节点提供Python运行环境。

使用方法与Javascript基本类似，需要将所执行的逻辑写入main函数中，main函数需要返回一个字典，**字典中的key和输出变量的名称和顺序要一致。**

#### 2 原理

使用LibSeccomp对代码进行审计，当触发了危险的系统调用时，代码终止运行并返回“Dangerous Behaviour Detected"。

#### 3 使用

在Python Sandbox的目录下执行下面的命令获取Python Sandbox镜像
`docker build -t pyenv:v1.0 .`

运行，端口开在9985

`docker run -d --pids-limit 30 --cpus=1 -p 9985:9985 pyenv_seccomp:v1.0`

在代码运行节点中切换语言为Python即可

![](./Example.png)