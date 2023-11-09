import requests

# 接口的URL
api_url = "http://127.0.0.1:6010/generate_summary/"

# 请求的数据
data = {
    "url": "https://bing.com",
    "level": 1
}

# 发送POST请求
response = requests.post(api_url, json=data)

# 检查响应状态
if response.status_code == 200:
    # 请求成功，打印结果
    summaries = response.json()
    for summary in summaries:
        print(f"URL: {summary['url']}")
        print(f"Title: {summary['title']}")
        print(f"Summary: {summary['summary']}\n")
else:
    # 请求失败，打印错误信息
    print(f"Failed to generate summary with status code {response.status_code}: {response.text}")
