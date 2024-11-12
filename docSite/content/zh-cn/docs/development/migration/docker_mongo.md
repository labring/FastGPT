---
title: "Docker Mongo迁移(dump模式)"
description: "FastGPT Docker Mongo迁移"
icon: database
draft: false
weight: 762
---

## 作者

[https://github.com/samqin123](https://github.com/samqin123)

[相关PR。有问题可打开这里与作者交流](https://github.com/labring/FastGPT/pull/1426)

## 介绍

如何使用Mongodump来完成从A环境到B环境的Fastgpt的mongodb迁移

前提说明：

 A环境：我在阿里云上部署的fastgpt，现在需要迁移到B环境。
 B环境：是新环境比如腾讯云新部署的fastgpt，更特殊一点的是，NAS（群晖或者QNAP）部署了fastgpt，mongo必须改成4.2或者4.4版本（其实云端更方便，支持fastgpt mongo默认版本）
 C环境：妥善考虑，用本地电脑作为C环境过渡，保存相关文件并分离操作
‍

## 1. 环境准备：进入 docker mongo 【A环境】
``` 
docker exec -it mongo sh
mongo -u 'username' -p 'password'
>> show dbs
``` 
看到fastgpt数据库，以及其它几个，确定下导出数据库名称
准备：
检查数据库，容器和宿主机都创建一下 backup 目录 【A环境 + C环境】

##### 准备：

检查数据库，容器和宿主机都创建一下“数据导出导入”临时目录 ，比如data/backup  【A环境建目录 + C环境建目录用于同步到容器中】

#### 先在【A环境】创建文件目录，用于dump导出操作
容器：（先进入fastgpt docker容器）
``` 
docker exec -it fastgpt sh
mkdir -p /data/backup
``` 

建好后，未来导出mongo的数据，会在A环境本地fastgpt的安装目录/Data/下看到自动同步好的目录，数据会在data\backup中，然后可以衔接后续的压缩和下载转移动作。如果没有同步到本地，也可以手动建一下，配合docker cp 把文件拷到本地用（基本不会发生）

#### 然后，【C环境】宿主机目录类似操作，用于把上传的文件自动同步到C环境部署的fastgpt容器里。
到fastgpt目录，进入mongo目录，有data目录，下面建backup
``` 
mkdir -p /fastgpt/data/backup
``` 
准备好后，后续上传
``` 
### 新fastgpt环境【B】中也需要建一个，比如/fastgpt/mongobackup目录，注意不要在fastgpt/data目录下建立目录
``` 
mkdir -p /fastgpt/mongobackup
``` 

###2. 正题开始，从fastgpt老环境【A】中导出数据
进入A环境，使用mongodump 导出mongo数据库。

#### 2.1 导出 
可以使用mongodump在源头容器中导出数据文件, 导出路径为上面指定临时目录，即"data\backup"

[导出的文件在代码中指定为/data/backup，因为fastgpt配置文件已经建立了data的持久化，所以会同步到容器所在环境本地fast/mongo/data应该就能看到这个导出的目录：backup，里面有文件]

一行指令导出代码，在服务器本地环境运行，不需要进入容器。
``` 
docker exec -it mongo bash -c "mongodump --db fastgpt -u 'username' -p 'password' --authenticationDatabase admin --out /data/backup"
``` 

也可以进入环境，熟手可以结合建目录，一次性完成建导出目录，以及使用mongodump导出数据到该目录
``` 
1.docker exec -it fastgpt sh

2.mkdir -p /data/backup

3. mongodump --host 127.0.0.1:27017 --db fastgpt -u "username" -p "password" --authenticationDatabase admin --out /data/backup
‍

##### 补充：万一没自动同步，也可以将mongodump导出的文件，手工导出到宿主机【A环境】，备用指令如下：
``` 
docker cp mongo:/data/backup   <A环境本地fastgpt目录>:/fastgpt/data/backup>
‍``` 

2.2  对新手，建议稳妥起见，压缩这个文件目录，并将压缩文件下载到本地过渡环境【A环境 -> C环境】；原因是因为留存一份，并且检查文件数量是否一致。

        熟手可以直接复制到新部署服务器（腾讯云或者NAS）【A环境-> B环境】


2.2.1 先进入  【A环境】源头系统的本地环境 fastgpt/mongo/data 目录

``` 
cd /usr/fastgpt/mongo/data 
``` 

#执行，压缩文件命令
``` 
tar -czvf ../fastgpt-mongo-backup-$(date +%Y-%m-%d).tar.gz ./  【A环境】
``` 
#接下来，把压缩包下载到本地 【A环境-> C环境】，以便于检查和留存版本。熟手，直接将该压缩包同步到B环境中新fastgpt目录data目录下备用。

``` 
scp  -i /Users/path/<user.pem换成你自己的pem文件链接> root@<fastgpt所在云服务器地址>:/usr/fastgpt/mongo/fastgptbackup-2024-05-03.tar.gz /<本地电脑路径>/Downloads/fastgpt

``` 
熟手直接换成新环境地址
​
``` 
scp  -i /Users/path/<user.pem换成你自己的pem文件链接>  root@<老环境fastgpt服务器地址>:/usr/fastgpt/mongo/fastgptbackup-2024-05-03.tar.gz    root@<新环境fastgpt服务器地址>:/Downloads/fastgpt2 

``` 

2.2 【C环境】检查压缩文件是否完整，如果不完整，重新导出。事实上，我也出现过问题，因为跨环境scp会出现丢数据的情况。

压缩数据包导入到C环境本地后，可以考虑在宿主机目录解压缩，放在一个自定义目录比如. < user/fastgpt/mongobackup/data>

``` 
tar -xvzf fastgptbackup-2024-05-03.tar.gz -C user/fastgpt/mongobackup/data
``` 
解压缩后里面是bson文件，这里可以检查下，压缩文件数量是否一致。如果不一致，后续启动新环境的fastgpt容器，也不会有任何数据。
​
<img width="1561" alt="image" src="https://github.com/labring/FastGPT/assets/103937568/cbb8a93c-5834-4a0d-be6c-c45c701f593e">


如果没问题，准备进入下一步，将压缩包文件上传到B环境，也就是新fastgpt环境里的指定目录，比如/fastgpt/mongobackup, 注意不要放到fastgpt/data目录下，因为下面会先清空一次这个目录，否则导入会报错。
``` 
scp  -rfv <本地电脑路径>/Downloads/fastgpt/fastgptbackup-2024-05-03.tar.gz  root@<新环境fastgpt服务器地址>:/Downloads/fastgpt/backup
``` 

## 3 导入恢复：    实际恢复和导入步骤

### 3.1. 进入新fastgpt本地环境的安装目录后，找到迁移的压缩文件包fastgptbackup-2024-05-03.tar.gz，解压缩到指定目录

``` 
tar -xvzf fastgptbackup-2024-05-03.tar.gz -C user/fastgpt/mongobackup/data
``` 
再次核对文件数量，和上面对比一下。

熟手可以用tar指令检查文件完整性，上面是给新手准备的，便于比对核查。


### 3.2 手动上传新fastgpt docker容器里备用 【C环境】
说明：因为没有放在data里，所以不会自动同步到容器里。而且要确保容器的data目录被清理干净，否则导入时会报错。

``` 
docker cp user/fastgpt/mongobackup/data mongo:/tmp/backup
‍``` 

### 3.3 建议初始化一次docker compose ，运行后建立新的 mongo/data 持久化目录 
如果不是初始化的 mongo/db 目录， mongorestore 导入可能会报错。如果报错，建议尝试初始化mongo。

操作指令
```
cd /fastgpt安装目录/mongo/data
rm -rf *
``` 
‍

4.恢复： mongorestore 恢复 [C环境】
简单一点，退回到本地环境，用 docker 命令一键导入，当然你也可以在容器里操作

``` 
docker exec -it mongo mongorestore -u "username" -p "password" --authenticationDatabase admin /tmp/backup/ --db fastgpt
``` 
<img width="1668" alt="image" src="https://github.com/labring/FastGPT/assets/103937568/32c2cdb8-bf80-4d31-9269-4bf3909cf04e">
注意：导入文件数量量级太少，大概率是没导入成功的表现。如果导入不成功，新环境fastgpt可以登入，但是一片空白。


5.重启容器 【C环境】
``` 
docker compose restart
docker logs -f mongo  **强烈建议先检查mongo运行情况，在去做登录动作，如果mongo报错，访问web也会报错”
``` 

如果mongo启动正常，显示的是类似这样的，而不是 “mongo is restarting”，后者就是错误
<img width="1736" alt="iShot_2024-05-09_19 21 26" src="https://github.com/labring/FastGPT/assets/103937568/94ee00db-43de-48bd-a1fc-22dfe86aaa90">

报错情况
<img width="508" alt="iShot_2024-05-09_19 23 13" src="https://github.com/labring/FastGPT/assets/103937568/2e2afc9f-484c-4b63-93ee-1c14aef03de0">


6. 启动fastgpt容器服务后，登录新fastgpt web，能看到原来的数据库内容完整显示，说明已经导入系统了。
<img width="1728" alt="iShot_2024-05-09_19 23 51" src="https://github.com/labring/FastGPT/assets/103937568/846b6157-6b6a-4468-a1d9-c44d681ebf7c">
