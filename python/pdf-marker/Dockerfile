FROM pytorch/pytorch:2.4.1-cuda12.4-cudnn9-devel

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
# 安装构建依赖 cv2 dependencies
RUN apt-get update && apt-get install ffmpeg libsm6 libxext6 -y

# 设置 pip 配置
RUN mkdir -p /root/.pip
COPY pip.conf /root/.pip/

# 创建模型文件夹
RUN mkdir -p /root/huggingface

# 复制依赖文件
COPY requirements.txt /root/
COPY api_mp.py /root/


# 导入huggingface的代理和huggingface模型位置
ENV HF_ENDPOINT=https://hf-mirror.com \
    HF_DATASETS_CACHE=/root/huggingface \
    HUGGINGFACE_HUB_CACHE=/root/huggingface \
    HF_HOME=/root/huggingface

# 设置工作目录
WORKDIR /root

# 安装 Python 依赖
RUN pip3 install --no-cache-dir -r requirements.txt

# 删除不必要的工具和文件以减小镜像体积
RUN apt-get purge -y vim && apt-get autoremove -y && rm -rf /root/.pip /root/.cache/pip



# 设置容器启动命令
CMD ["python3", "api_mp.py"]