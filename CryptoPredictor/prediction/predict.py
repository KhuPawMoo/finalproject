"""Create cautious price-range scenarios from the starter ML models."""
from datetime import datetime, timedelta, timezone
import statistics

from analysis.technical import latest_indicator_values
from config import PREDICTION_HORIZONS
from database.database import save_model_performance, save_prediction, utc_now
from prediction.features import feature_frame
from prediction.train import TrainingError, train_models


def _confidence(metrics: dict, model_predictions: dict, sample_count: int, volatility_pct: float) -> tuple[str, str, float]:
    mape_values = [metric["mape"] for metric in metrics.values()]
    mean_mape = statistics.mean(mape_values)
    values = list(model_predictions.values())
    agreement = 1 - (max(values) - min(values)) / max(abs(statistics.mean(values)), 0.000001)
    if sample_count >= 300 and mean_mape < 2.0 and agreement > 0.985 and volatility_pct < 3:
        level = "High"
    elif sample_count >= 180 and mean_mape < 5.0 and agreement > 0.96 and volatility_pct < 6:
        level = "Medium"
    else:
        level = "Low"
    reason = (
        f"{sample_count} time-ordered training rows; holdout MAPE averages {mean_mape:.2f}%; "
        f"model agreement is {agreement * 100:.1f}%; recent ATR volatility is {volatility_pct:.2f}%."
    )
    return level, reason, agreement


def _scenario_ranges(point: float, width: float) -> dict:
    """Make three plausible scenarios around a model estimate, never a single certain price."""
    return {
        "bearish_low": point * (1 - 2 * width), "bearish_high": point * (1 - 0.45 * width),
        "neutral_low": point * (1 - 0.85 * width), "neutral_high": point * (1 + 0.85 * width),
        "bullish_low": point * (1 + 0.45 * width), "bullish_high": point * (1 + 2 * width),
    }


def generate_predictions(symbol: str, candles: list[dict], articles: list[dict] | None = None) -> dict:
    """Train each requested horizon, save ranges, and return successes and understandable errors."""
    frame = feature_frame(candles, articles)
    if frame.empty:
        return {"predictions": [], "errors": ["No 1-hour candles are available yet."], "model_performance": []}
    indicators = latest_indicator_values(frame)
    current_price = float(frame.iloc[-1]["close"])
    atr = indicators.get("atr") or 0
    volatility_pct = (atr / current_price * 100) if current_price else 0
    output, errors, performances = [], [], []
    for label, horizon_hours in PREDICTION_HORIZONS.items():
        try:
            trained = train_models(symbol, candles, horizon_hours, articles)
        except TrainingError as exc:
            errors.append(f"{label}: {exc}")
            continue

        for model_name, metrics in trained.metrics.items():
            record = {"symbol": symbol, "model_name": model_name, "horizon_label": label,
                      "sample_count": trained.sample_count, **metrics, "range_accuracy": None}
            save_model_performance(record)
            performances.append(record)
        predicted_price = statistics.mean(trained.predictions.values())
        confidence, reason, agreement = _confidence(trained.metrics, trained.predictions, trained.sample_count, volatility_pct)
        # ATR scales with time. Agreement acts as an additional uncertainty allowance.
        width = max(0.005, volatility_pct / 100 * (horizon_hours ** 0.5) * 1.35, (1 - agreement) * 1.5)
        width = min(width, 0.45)  # avoid unreadably huge display ranges during extreme data errors
        scenarios = _scenario_ranges(predicted_price, width)
        created = datetime.now(timezone.utc)
        prediction = {
            "symbol": symbol, "created_at": created.isoformat(),
            "target_time": (created + timedelta(hours=horizon_hours)).isoformat(),
            "horizon_label": label, "horizon_hours": horizon_hours, "current_price": current_price,
            "predicted_price": predicted_price, "lower_range": scenarios["neutral_low"], "upper_range": scenarios["neutral_high"],
            **scenarios, "confidence": confidence, "confidence_reason": reason,
            "model_name": "Linear Regression + Random Forest ensemble", "model_agreement": agreement,
        }
        prediction["id"] = save_prediction(prediction)
        output.append(prediction)
    return {"predictions": output, "errors": errors, "model_performance": performances}

