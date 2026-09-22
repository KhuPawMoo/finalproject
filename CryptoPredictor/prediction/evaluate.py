"""Evaluate mature saved predictions once the needed future candle exists."""
from datetime import datetime

from database.database import (
    evaluation_summary,
    load_candles,
    pending_predictions,
    record_prediction_result,
)


def _target_timestamp(iso_time: str) -> int:
    return int(datetime.fromisoformat(iso_time.replace("Z", "+00:00")).timestamp() * 1000)


def evaluate_pending_predictions(symbol: str | None = None) -> dict:
    """Use the first stored 1-hour close at or after the target moment as the actual value."""
    evaluated = 0
    skipped = 0
    for prediction in pending_predictions():
        if symbol and prediction["symbol"] != symbol.upper():
            continue
        target = _target_timestamp(prediction["target_time"])
        candles = load_candles(prediction["symbol"], "1h", limit=1000)
        actual_candle = next((candle for candle in candles if candle["timestamp"] >= target), None)
        if actual_candle is None:
            skipped += 1
            continue
        record_prediction_result(prediction, actual_candle["close"])
        evaluated += 1
    return {"evaluated": evaluated, "waiting_for_candle": skipped, "summary": evaluation_summary(symbol) if symbol else None}

