import json
import requests
from bs4 import BeautifulSoup

def fetch_latest_news():
    url = 'https://www.dnb.com.tw/Thoughts'
    headers = {'User-Agent': 'Mozilla/5.0'}
    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.text, 'html.parser')

    output = {
        "台灣": [],
        "日本": [],
        "韓國": [],
        "美國": [],
        "中國": [],
        "新加坡": []
    }

    articles = soup.select('.news-list .item')[:10]
    for article in articles:
        title = article.select_one('h3').text.strip()
        content = article.select_one('p').text.strip() if article.select_one('p') else ''
        text = f"{title}：{content}"
        if "中國" in text:
            output["中國"].append(text)
        elif "日本" in text:
            output["日本"].append(text)
        elif "韓國" in text:
            output["韓國"].append(text)
        elif "美國" in text or "洛杉磯" in text:
            output["美國"].append(text)
        elif "新加坡" in text:
            output["新加坡"].append(text)
        else:
            output["台灣"].append(text)

    with open("situations.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

fetch_latest_news()
