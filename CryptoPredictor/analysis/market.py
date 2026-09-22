"""Combine indicators, news context, and prediction output into cautious market analysis."""
from collections import Counter


def trend_from_indicators(values: dict) -> str:
    close, ema_20, ema_50 = values.get("close"), values.get("ema_20"), values.get("ema_50")
    if all(value is not None for value in (close, ema_20, ema_50)):
        if close > ema_20 > ema_50:
            return "Bullish"
        if close < ema_20 < ema_50:
            return "Bearish"
    return "Mixed / neutral"


def volatility_from_indicators(values: dict) -> str:
    close, atr = values.get("close"), values.get("atr")
    if not close or atr is None:
        return "Unknown"
    ratio = atr / close * 100
    if ratio >= 3:
        return "High"
    if ratio >= 1:
        return "Medium"
    return "Low"


def news_summary(articles: list[dict]) -> dict:
    if not articles:
        return {"label": "No recent stored news", "score": 0, "impact": "Unknown", "reason": "Refresh news to add context."}
    score = sum(article.get("sentiment_score", 0) for article in articles) / len(articles)
    label = "Positive" if score > 0.15 else "Negative" if score < -0.15 else "Neutral"
    impacts = Counter(article.get("impact", "Low") for article in articles)
    impact = "High" if impacts["High"] else "Medium" if impacts["Medium"] else "Low"
    return {
        "label": label,
        "score": round(score, 3),
        "impact": impact,
        "reason": f"Based on {len(articles)} locally stored relevant articles. News is context, not proof of a price move.",
    }


def build_market_analysis(symbol: str, values: dict, articles: list[dict], predictions: list[dict]) -> dict:
    trend = trend_from_indicators(values)
    news = news_summary(articles)
    volatility = volatility_from_indicators(values)
    factors = []
    if trend == "Bullish":
        factors.append("price is above the short-term EMA trend lines")
    elif trend == "Bearish":
        factors.append("price is below the short-term EMA trend lines")
    else:
        factors.append("the EMA trend lines are mixed")
    if values.get("rsi") is not None:
        factors.append(f"RSI is {values['rsi']:.1f}")
    if values.get("volume_change_pct") is not None:
        factors.append(f"latest volume changed {values['volume_change_pct']:+.1f}%")
    factors.append(f"stored news sentiment is {news['label'].lower()}")
    factors.append(f"volatility is {volatility.lower()}")
    prediction_note = "No model prediction has been generated yet."
    if predictions:
        prediction_note = f"The newest {predictions[0]['horizon_label']} model estimate is a range, not a certain future price."
    return {
        "symbol": symbol,
        "trend": trend,
        "volatility": volatility,
        "news": news,
        "why": "The available data suggests this view because " + ", ".join(factors) + ".",
        "prediction_note": prediction_note,
    }

