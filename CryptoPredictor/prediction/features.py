"""Build ML feature rows without using information from the future."""
from datetime import datetime

import pandas as pd

from analysis.technical import calculate_indicators

FEATURE_COLUMNS = [
    "open", "high", "low", "close", "volume", "rsi", "macd", "macd_signal", "ema_20", "ema_50",
    "ema_200", "bb_upper", "bb_lower", "atr", "return_1", "volume_change_pct", "news_sentiment", "news_impact",
]


def _published_timestamp(value: str) -> int | None:
    try:
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
    except (AttributeError, ValueError):
        return None


def add_news_features(frame: pd.DataFrame, articles: list[dict] | None) -> pd.DataFrame:
    """Attach only news already published at the moment of each candle.

    merge_asof(..., direction='backward') is intentional: it prevents a future article
    from leaking into an older training row.
    """
    result = frame.copy().sort_values("timestamp")
    result["news_sentiment"] = 0.0
    result["news_impact"] = 0.0
    if not articles:
        return result
    news_rows = []
    impact_score = {"Low": 0.25, "Medium": 0.6, "High": 1.0}
    for article in articles:
        timestamp = _published_timestamp(article.get("published_at", ""))
        if timestamp is not None:
            news_rows.append({
                "news_timestamp": timestamp,
                "news_sentiment": float(article.get("sentiment_score", 0) or 0),
                "news_impact": impact_score.get(article.get("impact"), 0.25),
            })
    if not news_rows:
        return result
    news_frame = pd.DataFrame(news_rows).sort_values("news_timestamp")
    merged = pd.merge_asof(
        result.sort_values("timestamp"), news_frame, left_on="timestamp", right_on="news_timestamp", direction="backward"
    )
    merged["news_sentiment"] = merged["news_sentiment_y"].fillna(0.0)
    merged["news_impact"] = merged["news_impact_y"].fillna(0.0)
    return merged.drop(columns=["news_timestamp", "news_sentiment_x", "news_sentiment_y", "news_impact_x", "news_impact_y"])


def feature_frame(candles: list[dict], articles: list[dict] | None = None) -> pd.DataFrame:
    """Calculate technical and news features available at each candle close."""
    indicators = calculate_indicators(candles)
    if indicators.empty:
        return indicators
    return add_news_features(indicators, articles)


def training_data(candles: list[dict], horizon_hours: int, articles: list[dict] | None = None) -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.DataFrame]:
    """Create X/y where y is the close *horizon_hours* after the feature timestamp."""
    frame = feature_frame(candles, articles)
    if frame.empty:
        return pd.DataFrame(), pd.Series(dtype=float), pd.Series(dtype=float), frame
    frame["target_price"] = frame["close"].shift(-horizon_hours)
    clean = frame.dropna(subset=[*FEATURE_COLUMNS, "target_price"]).copy()
    return clean[FEATURE_COLUMNS], clean["target_price"], clean["close"], frame

