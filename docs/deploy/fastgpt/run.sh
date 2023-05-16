#!/bin/bash
docker-compose pull
docker-compose up -d

echo "Docker Compose 重新拉取镜像完成！"

# 删除本地旧镜像
images=$(docker images --format "{{.ID}} {{.Repository}}" | grep fastgpt)

# 将镜像 ID 和名称放入数组中
IFS=$'\n' read -rd '' -a image_array <<<"$images"

# 遍历数组并删除所有旧的镜像
for ((i=1; i<${#image_array[@]}; i++))
do
    image=${image_array[$i]}
    image_id=${image%% *}
    docker rmi $image_id
done