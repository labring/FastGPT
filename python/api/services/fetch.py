import requests
import bs4
import nltk
from urllib.parse import urljoin
from time import sleep
import time
import math

# 全局变量来记录开始时间
start_time = time.time()

# 你可以设定一个最大运行时长，比如60秒
max_run_time = 20

# 添加一个简单的IDF计算器
class SimpleIDFCalculator:
    def __init__(self):
        self.doc_freq = {}
        self.num_docs = 0

    def add_document(self, doc):
        self.num_docs += 1
        words = set(nltk.word_tokenize(doc))
        for word in words:
            if word in self.doc_freq:
                self.doc_freq[word] += 1
            else:
                self.doc_freq[word] = 1

    def idf(self, word):
        return math.log(self.num_docs / (1 + self.doc_freq.get(word, 0)))



# 定义一个函数，用于获取网页的内容，并进行总结
def get_summary(url, level):
    result = []
    visited = set()
    idf_calculator = SimpleIDFCalculator()
    helper(url, level, result, visited, idf_calculator)
    return result

# 辅助函数
def helper(url, level, result, visited, idf_calculator):
    # # 检查是否超出运行时间限制
    # if time.time() - start_time > max_run_time:
    #     print("Reached max run time, exiting...")
    #     return
    
    if level == 0 or url in visited or not url.startswith("http"):
        return

    visited.add(url)
    try:
        response = requests.get(url)
        if response.status_code != 200:
            return
        soup = bs4.BeautifulSoup(response.text, "html.parser")
        title = soup.title.string if soup.title else 'No Title'
        text = soup.get_text().strip()
        idf_calculator.add_document(text)
        sentences = nltk.sent_tokenize(text)
        words = nltk.word_tokenize(text)

        scores = {}
        for sentence in sentences:
            for word in nltk.word_tokenize(sentence):
                tf = words.count(word) / len(words)
                idf = idf_calculator.idf(word)
                scores[sentence] = scores.get(sentence, 0) + (tf * idf)

        summary = " ".join(sorted(scores, key=scores.get, reverse=True)[:10])
        result.append((url, title, summary))

        sleep(1)  # Simple delay to prevent aggressive crawling

        links = soup.find_all("a")
        for link in links:
            href = link.get("href")
            if href:
                # Handle relative links
                next_url = urljoin(url, href)
                helper(next_url, level - 1, result, visited, idf_calculator)

    except Exception as e:
        print(f"Error processing {url}: {e}")

# # 主程序部分，仅作为函数调用示例：
# summary = get_summary('https://zhihu.com', 2)
# print(summary)
