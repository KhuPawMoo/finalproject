from analysis.sentiment import analyze_sentiment
from analysis.technical import calculate_indicators, latest_indicator_values


def make_candles(count=220):
    return [
        {"symbol": "BTCUSDT", "interval": "1h", "timestamp": index * 3_600_000,
         "open": 100 + index, "high": 101 + index, "low": 99 + index,
         "close": 100.5 + index, "volume": 1000 + index * 5}
        for index in range(count)
    ]


def test_indicators_include_expected_values():
    values = latest_indicator_values(calculate_indicators(make_candles()))
    assert values["ema_20"] is not None
    assert values["ema_200"] is not None
    assert values["support"] < values["resistance"]


def test_sentiment_is_explainable():
    result = analyze_sentiment("Bitcoin ETF approval drives investment surge")
    assert result["sentiment"] == "Positive"
    assert result["impact"] in {"Medium", "High"}
    assert result["impact_reason"]
