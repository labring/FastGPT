#!/bin/bash

# Pull the latest images using Docker Compose
docker-compose pull

# Start the containers defined in the Docker Compose file in detached mode
docker-compose up -d

echo "Docker Compose image pull completed!"

# Delete old local images with the "fastgpt" repository name
images=$(docker images --format "{{.ID}} {{.Repository}}" | grep fastgpt)

# Put image IDs and names into an array
IFS=$'\n' read -rd '' -a image_array <<<"$images"

# Iterate through the array and remove old images
for ((i=1; i<${#image_array[@]}; i++))
do
    image=${image_array[$i]}
    image_id=${image%% *}
    docker rmi $image_id
done
