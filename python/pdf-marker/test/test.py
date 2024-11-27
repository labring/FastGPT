import json
import os
from io import BytesIO
import requests
from multiprocessing import Process
def request_(file_path):
    url = "http://127.0.0.1:7231/v1/parse/file"
    response = requests.get(file_path)
    if response.status_code == 200:
        file_data = BytesIO(response.content)
        pdf_name = os.path.basename(file_path)
        files = {'file': (pdf_name, file_data, 'application/pdf')}
        response = requests.post(url, files=files)
        if response.status_code == 200:
            print("Response JSON:", json.dumps(response.json(), indent=4, ensure_ascii=False))
        else:
            print(f"Request failed with status code: {response.status_code}")
            print(response.text)

if __name__ == "__main__":
    file_paths = ["https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/english_test.pdf", "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/chinese_test.pdf",
                 "https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/ocr_test.pdf","https://objectstorageapi.bja.sealos.run/czrn86r1-yyh/english_file/3649329.3658477.pdf"]
    for file_path in file_paths:
        p = Process(target=request_, args=(file_path))
        p.start()

