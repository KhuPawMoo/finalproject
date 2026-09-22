"""A transparent, small rule-based news sentiment classifier.

It is deliberately simple so beginners can inspect and improve every decision.
"""
import re

POSITIVE_WORDS = {
    "approve", "approval", "adoption", "bullish", "buy", "growth", "gain", "gains", "inflow",
    "investment", "launch", "partnership", "record", "rally", "recover", "surge", "upgrade", "win",
}
NEGATIVE_WORDS = {
    "attack", "ban", "bearish", "crackdown", "exploit", "fail", "fine", "hack", "lawsuit", "loss",
    "outflow", "risk", "scam", "sell", "shutdown", "theft", "volatile", "warning",
}
HIGH_IMPACT_WORDS = {
    "etf", "federal reserve", "interest rate", "regulation", "sec", "ban", "hack", "exploit",
    "approval", "lawsuit", "bitcoin", "exchange", "liquidation",
}


def _matched_words(text: str, words: set[str]) -> list[str]:
    lowered = text.lower()
    return sorted(word for word in words if re.search(rf"\b{re.escape(word)}\b", lowered))


def analyze_sentiment(title: str, summary: str = "") -> dict:
    """Return sentiment and potential impact, with an explanation instead of a black box."""
    text = f"{title} {summary}".lower()
    positive = _matched_words(text, POSITIVE_WORDS)
    negative = _matched_words(text, NEGATIVE_WORDS)
    impactful = _matched_words(text, HIGH_IMPACT_WORDS)
    score = (len(positive) - len(negative)) / max(len(positive) + len(negative), 1)

    if score > 0.2:
        sentiment = "Positive"
    elif score < -0.2:
        sentiment = "Negative"
    else:
        sentiment = "Neutral"

    if len(impactful) >= 2 or any(word in impactful for word in {"hack", "ban", "etf", "interest rate"}):
        impact = "High"
    elif impactful or len(positive) + len(negative) >= 2:
        impact = "Medium"
    else:
        impact = "Low"

    if impactful:
        reason = f"Potentially market-relevant terms: {', '.join(impactful[:4])}."
    elif positive or negative:
        reason = "The wording suggests a possible market reaction, but the actual impact is uncertain."
    else:
        reason = "The article has no strong market-moving language in this transparent rule-based check."
    return {"sentiment": sentiment, "sentiment_score": round(score, 3), "impact": impact, "impact_reason": reason}

