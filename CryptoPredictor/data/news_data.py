"""Retrieve relevant cryptocurrency news with a no-key public fallback.

News failures are non-fatal: the analysis stays available from market data alone.
"""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import requests

from analysis.sentiment import analyze_sentiment
from config import NEWS_API_KEY, REQUEST_TIMEOUT_SECONDS, SUPPORTED_SYMBOLS
from database.database import load_candles, save_news


class NewsDataError(RuntimeError):
    pass


def _normalise_date(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except ValueError:
        try:
            return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            return datetime.now(timezone.utc).isoformat()


def _article_query(symbol: str) -> str:
    coin_name = SUPPORTED_SYMBOLS.get(symbol, symbol.replace("USDT", ""))
    # These terms intentionally prioritize market-moving events over general crypto chatter.
    return f'({coin_name} OR {symbol.replace("USDT", "")}) (ETF OR regulation OR exchange OR security OR investment OR market)'


def _request_json(url: str, params: dict) -> dict:
    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS, headers={"User-Agent": "CryptoPredictor/1.0"})
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise NewsDataError(f"News service is temporarily unavailable: {exc}") from exc


def _from_newsapi(symbol: str) -> list[dict]:
    data = _request_json(
        "https://newsapi.org/v2/everything",
        {"q": _article_query(symbol), "language": "en", "sortBy": "publishedAt", "pageSize": 12, "apiKey": NEWS_API_KEY},
    )
    if data.get("status") != "ok":
        raise NewsDataError(data.get("message", "NewsAPI request was not successful."))
    return [
        {"title": item.get("title", "Untitled article"), "source": item.get("source", {}).get("name", "Unknown source"),
         "url": item.get("url", ""), "published_at": item.get("publishedAt"),
         "summary": item.get("description") or ""}
        for item in data.get("articles", []) if item.get("url")
    ]


def _from_gdelt(symbol: str) -> list[dict]:
    data = _request_json(
        "https://api.gdeltproject.org/api/v2/doc/doc",
        {"query": _article_query(symbol), "mode": "artlist", "format": "json", "maxrecords": 12, "sort": "hybridrel"},
    )
    articles = data.get("articles", [])
    return [
        {"title": item.get("title", "Untitled article"), "source": item.get("domain", "Unknown source"),
         "url": item.get("url", ""), "published_at": item.get("seendate"),
         "summary": item.get("socialimage", "") and "Article found through GDELT's market-news search." or ""}
        for item in articles if item.get("url")
    ]


def fetch_and_store_news(symbol: str) -> dict:
    """Fetch recent relevant articles, score them, and cache them locally."""
    symbol = symbol.upper().strip()
    try:
        raw_articles = _from_newsapi(symbol) if NEWS_API_KEY else _from_gdelt(symbol)
    except NewsDataError as exc:
        return {"saved": 0, "error": str(exc)}

    hourly_candles = load_candles(symbol, "1h", limit=1000)
    saved = 0
    for raw in raw_articles:
        if not raw["title"] or not raw["url"]:
            continue
        scored = analyze_sentiment(raw["title"], raw["summary"])
        published_at = _normalise_date(raw["published_at"])
        published_timestamp = int(datetime.fromisoformat(published_at).timestamp() * 1000)
        price_candle = next((candle for candle in reversed(hourly_candles) if candle["timestamp"] <= published_timestamp), None)
        article = {
            **raw,
            **scored,
            "published_at": published_at,
            "cryptocurrency": symbol,
            "price_at_publication": price_candle["close"] if price_candle else None,
        }
        save_news(article)
        saved += 1
    return {"saved": saved, "error": None}
