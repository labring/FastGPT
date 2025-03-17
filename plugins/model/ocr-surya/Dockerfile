FROM pytorch/pytorch:2.4.0-cuda11.8-cudnn9-runtime

# please download the model from https://huggingface.co/vikp/surya_det3 
# and https://huggingface.co/vikp/surya_rec2, and put it in the directory vikp/
COPY ./vikp ./vikp

COPY requirements.txt .

RUN python3 -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

RUN python3 -m pip uninstall opencv-python -y

RUN python3 -m pip install opencv-python-headless -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY app.py Dockerfile ./

ENTRYPOINT python3 app.py