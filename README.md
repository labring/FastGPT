# Doc GPT 

## 初始化
复制 .env.template 成 .env.local ，填写核心参数  

```
AXIOS_PROXY_HOST=axios代理地址，目前 openai 接口都需要走代理，本机的话就填 127.0.0.1
AXIOS_PROXY_PORT=代理端口
MONGODB_URI=mongo数据库地址
MY_MAIL=发送验证码邮箱
MAILE_CODE=邮箱秘钥
TOKEN_KEY=随便填一个，用于生成和校验token
```

```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 部署

```bash
# 本地 docker 打包
docker build -t imageName:tag .
docker push imageName:tag
```

服务器请准备好 docker， mongo，nginx和代理。 镜像走本机的代理，所以用 host，port改成代理的端口，clash一般都是7890。

```bash
# 服务器拉取部署, imageName 替换成镜像名
docker pull imageName:tag
# 获取本地旧镜像ID
OLD_IMAGE_ID=$(docker images imageName -f "dangling=true" -q)
docker stop doc-gpt || true
docker rm doc-gpt || true
docker run -d --network=host --name doc-gpt \
    -e MAX_USER=50 \
    -e AXIOS_PROXY_HOST=127.0.0.1 \
    -e AXIOS_PROXY_PORT=7890 \
    -e MY_MAIL=your email\
    -e MAILE_CODE=your email code \
    -e TOKEN_KEY=任意一个内容 \
    -e MONGODB_URI="mongodb://aha:ROOT_root123@127.0.0.0:27017/?authSource=admin&readPreference=primary&appname=MongoDB%20Compass&ssl=false" \
    imageName:tag
docker logs doc-gpt


# 删除本地旧镜像
if [ ! -z "$OLD_IMAGE_ID" ]; then
  docker rmi $OLD_IMAGE_ID
fi
```

### docker 安装
```bash
# 安装docker
curl -sSL https://get.daocloud.io/docker | sh
sudo systemctl start docker
```

### mongo 安装
```bash
docker pull mongo:6.0.4
docker stop mongo
docker rm mongo
docker run -d --name mongo \
    -e MONGO_INITDB_ROOT_USERNAME= \
    -e MONGO_INITDB_ROOT_PASSWORD= \
    -v /root/service/mongo:/data/db \
    mongo:6.0.4
```


# 介绍页

## 欢迎使用 Doc GPT

时间比较赶，介绍没来得及完善，先直接上怎么使用：  

1. 使用邮箱注册账号。  
2. 进入账号页面，添加关联账号，目前只有 openai 的账号可以添加，直接去 openai 官网，把 API Key 粘贴过来。  
3. 进入模型页，创建一个模型，建议直接用 ChatGPT。    
4. 在模型列表点击【对话】，即可使用 API 进行聊天。  

### 模型配置

1. **提示语**：会在每个对话框的第一句自动加入，用于限定该模型的对话内容。  


2. **单句最大长度**：每个聊天，单次输入内容的最大长度。  


3. **上下文最大长度**：每个聊天，最多的轮数除以2，建议设置为偶数。可以持续聊天，但是旧的聊天内容会被截断，AI 就不会知道被截取的内容。 
例如：上下文最大长度为6。在第 4 轮对话时，第一轮对话的内容不会被计入。

4. **过期时间**：生成对话框后，这个对话框多久过期。  

5. **聊天最大加载次数**：单个对话框最多被加载几次，设置为-1代表不限制，正数代表只能加载 n 次，防止被盗刷。  

### 对话框介绍

1. 每个对话框以 windowId 作为标识。  
2. 每次点击【对话】，都会生成新的对话框，无法回到旧的对话框。对话框内刷新，会恢复对话内容。  
3. 直接分享对话框（网页）的链接给朋友，会共享同一个对话内容。但是！！！千万不要两个人同时用一个链接，会串味，还没解决这个问题。  
4. 如果想分享一个纯的对话框，可以把链接里 windowId 参数去掉。例如：  

* 当前网页链接：http://docgpt.ahapocket.cn/chat?chatId=6402c9f64cb5d6283f764&windowId=6402c94cb5d6283f76fb49  
* 分享链接应为：http://docgpt.ahapocket.cn/chat?chatId=6402c9f64cb5d6283f764  

### 其他问题
还有其他问题，可以加我 wx，拉个交流群大家一起聊聊。
![](/icon/erweima.jpg)