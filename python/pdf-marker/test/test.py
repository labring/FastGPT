import json
import os
from io import BytesIO
import requests
from multiprocessing import Process
def request_(file_path, ocr):
    url = "http://127.0.0.1:7231/v1/parse/file"  # FastAPI 服务 URL
    response = requests.get(file_path)
    if response.status_code == 200:
        file_data = BytesIO(response.content)
        pdf_name = os.path.basename(file_path)
        files = {'file': (pdf_name, file_data, 'application/pdf')}

        # 发送 POST 请求
        response = requests.post(url, files=files)

        # 处理响应
        if response.status_code == 200:
            print("Response JSON:", json.dumps(response.json(), indent=4, ensure_ascii=False))
        else:
            print(f"Request failed with status code: {response.status_code}")
            print(response.text)

if __name__ == "__main__":
    file_paths = ["https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/english_test.pdf", "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/chinese_test.pdf",
                 "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/ocr_test.pdf",
                 "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/english_file/Exploring_the_Applicability_of_Transfer_Learning_and_Feature_Engineering_in_Epilepsy_Prediction_Using_Hybrid_Transformer_Model.pdf",
                 "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/english_file/3649329.3658477.pdf"]
    file_path = "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/ocr_test.pdf"
    file_path2 = "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/english_file/Exploring_the_Applicability_of_Transfer_Learning_and_Feature_Engineering_in_Epilepsy_Prediction_Using_Hybrid_Transformer_Model.pdf"
    for file_path in file_paths:
        p = Process(target=request_, args=(file_path,True))
        p.start()

