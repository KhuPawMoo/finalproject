"""Time-based training for the two starter models: Linear Regression and Random Forest."""
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from config import MODEL_DIR
from prediction.features import FEATURE_COLUMNS, training_data


class TrainingError(RuntimeError):
    pass


@dataclass
class TrainingResult:
    models: dict
    predictions: dict
    metrics: dict
    sample_count: int
    last_features: pd.DataFrame
    latest_close: float


def _metrics(actual: np.ndarray, predicted: np.ndarray, base_price: np.ndarray) -> dict:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(mean_squared_error(actual, predicted) ** 0.5),
        "mape": float(mean_absolute_percentage_error(actual, predicted) * 100),
        "directional_accuracy": float(np.mean((predicted >= base_price) == (actual >= base_price)) * 100),
    }


def train_models(symbol: str, candles: list[dict], horizon_hours: int, articles: list[dict] | None = None) -> TrainingResult:
    """Split oldest data for training and newest data for testing, never randomly shuffle."""
    x, y, base_close, frame = training_data(candles, horizon_hours, articles)
    if len(x) < 120:
        raise TrainingError(
            f"Need at least 120 usable 1-hour feature rows for a {horizon_hours}-hour model; only {len(x)} are available."
        )
    split_at = int(len(x) * 0.8)
    if len(x) - split_at < 20:
        raise TrainingError("Not enough newest rows for a meaningful time-based test set.")
    x_train, x_test = x.iloc[:split_at], x.iloc[split_at:]
    y_train, y_test = y.iloc[:split_at], y.iloc[split_at:]
    base_test = base_close.iloc[split_at:]

    models = {
        "Linear Regression": Pipeline([("scale", StandardScaler()), ("model", LinearRegression())]),
        "Random Forest": RandomForestRegressor(n_estimators=140, min_samples_leaf=2, random_state=42, n_jobs=-1),
    }
    predictions, metrics = {}, {}
    MODEL_DIR.mkdir(exist_ok=True)
    for name, model in models.items():
        model.fit(x_train, y_train)
        test_prediction = model.predict(x_test)
        predictions[name] = float(model.predict(frame[FEATURE_COLUMNS].dropna().iloc[[-1]])[0])
        metrics[name] = _metrics(y_test.to_numpy(), test_prediction, base_test.to_numpy())
        # Saving is useful for learners to inspect, but the app retrains from fresh data by default.
        safe_name = name.lower().replace(" ", "_")
        joblib.dump(model, Path(MODEL_DIR) / f"{symbol}_{horizon_hours}h_{safe_name}.joblib")

    latest_features = frame[FEATURE_COLUMNS].dropna().iloc[[-1]]
    return TrainingResult(
        models=models, predictions=predictions, metrics=metrics, sample_count=len(x),
        last_features=latest_features, latest_close=float(frame.iloc[-1]["close"]),
    )

