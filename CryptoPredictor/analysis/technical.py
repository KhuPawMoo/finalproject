"""Technical indicator calculations and plain-language descriptions."""
import math

import numpy as np
import pandas as pd


def calculate_indicators(candles: list[dict]) -> pd.DataFrame:
    """Return candles plus indicators. NaN is expected until enough history exists."""
    frame = pd.DataFrame(candles).copy()
    if frame.empty:
        return frame
    frame = frame.sort_values("timestamp").reset_index(drop=True)
    for column in ("open", "high", "low", "close", "volume"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    frame["sma_20"] = frame["close"].rolling(20).mean()
    # min_periods prevents a short history from pretending an EMA 200 is mature.
    frame["ema_20"] = frame["close"].ewm(span=20, adjust=False, min_periods=20).mean()
    frame["ema_50"] = frame["close"].ewm(span=50, adjust=False, min_periods=50).mean()
    frame["ema_200"] = frame["close"].ewm(span=200, adjust=False, min_periods=200).mean()

    price_change = frame["close"].diff()
    gains = price_change.clip(lower=0).rolling(14).mean()
    losses = (-price_change.clip(upper=0)).rolling(14).mean()
    relative_strength = gains / losses.replace(0, np.nan)
    frame["rsi"] = 100 - (100 / (1 + relative_strength))
    # A continuous run upward has no average loss. Its RSI should be read as 100, not missing.
    frame.loc[(losses == 0) & (gains > 0), "rsi"] = 100
    frame.loc[(gains == 0) & (losses > 0), "rsi"] = 0

    ema_12 = frame["close"].ewm(span=12, adjust=False, min_periods=12).mean()
    ema_26 = frame["close"].ewm(span=26, adjust=False, min_periods=26).mean()
    frame["macd"] = ema_12 - ema_26
    frame["macd_signal"] = frame["macd"].ewm(span=9, adjust=False).mean()
    frame["macd_histogram"] = frame["macd"] - frame["macd_signal"]

    frame["bb_middle"] = frame["close"].rolling(20).mean()
    rolling_std = frame["close"].rolling(20).std(ddof=0)
    frame["bb_upper"] = frame["bb_middle"] + (2 * rolling_std)
    frame["bb_lower"] = frame["bb_middle"] - (2 * rolling_std)

    previous_close = frame["close"].shift(1)
    true_range = pd.concat(
        [frame["high"] - frame["low"], (frame["high"] - previous_close).abs(), (frame["low"] - previous_close).abs()],
        axis=1,
    ).max(axis=1)
    frame["atr"] = true_range.rolling(14).mean()
    frame["volume_ma"] = frame["volume"].rolling(20).mean()
    frame["volume_change_pct"] = frame["volume"].pct_change() * 100

    # These are recent price zones, not guaranteed turning points.
    frame["support"] = frame["low"].rolling(20).min()
    frame["resistance"] = frame["high"].rolling(20).max()
    frame["recent_high"] = frame["high"].rolling(50).max()
    frame["recent_low"] = frame["low"].rolling(50).min()
    frame["return_1"] = frame["close"].pct_change()
    return frame


def _number(value) -> float | None:
    if value is None or pd.isna(value) or math.isinf(float(value)):
        return None
    return round(float(value), 8)


def latest_indicator_values(frame: pd.DataFrame) -> dict:
    """Make the final computed row safe to save in SQLite or return as JSON."""
    if frame.empty:
        return {}
    row = frame.iloc[-1]
    fields = [
        "timestamp", "sma_20", "ema_20", "ema_50", "ema_200", "rsi", "macd", "macd_signal",
        "bb_upper", "bb_middle", "bb_lower", "atr", "volume_ma", "volume_change_pct", "support", "resistance",
        "recent_high", "recent_low", "close", "volume",
    ]
    values = {field: _number(row.get(field)) for field in fields}
    values["timestamp"] = int(row["timestamp"])
    return values


def technical_explanations(values: dict) -> list[str]:
    """Explain indicators in plain language and avoid treating them as trading commands."""
    if not values:
        return ["No stored candles yet. Refresh market data before calculating indicators."]
    notes = []
    rsi = values.get("rsi")
    if rsi is not None:
        if rsi >= 70:
            notes.append(f"RSI is {rsi:.1f}: price has moved strongly upward recently and may be overextended.")
        elif rsi <= 30:
            notes.append(f"RSI is {rsi:.1f}: price has fallen strongly recently and may be oversold.")
        else:
            notes.append(f"RSI is {rsi:.1f}: recent momentum is neither strongly overbought nor oversold.")

    close, ema_20, ema_50, ema_200 = (values.get(key) for key in ("close", "ema_20", "ema_50", "ema_200"))
    if all(value is not None for value in (close, ema_20, ema_50)):
        if close > ema_20 > ema_50:
            notes.append("Price is above the 20 and 50-period EMA, which is a short-term bullish trend clue.")
        elif close < ema_20 < ema_50:
            notes.append("Price is below the 20 and 50-period EMA, which is a short-term bearish trend clue.")
        else:
            notes.append("The EMA lines are mixed, so the trend signal is not clear.")
    if ema_200 is None:
        notes.append("EMA 200 needs at least 200 candles; refresh more history to use that long-term trend reference.")

    macd, signal = values.get("macd"), values.get("macd_signal")
    if macd is not None and signal is not None:
        notes.append("MACD is above its signal line, supporting positive momentum." if macd > signal else
                     "MACD is below its signal line, suggesting weaker recent momentum.")

    volume_change = values.get("volume_change_pct")
    if volume_change is not None:
        notes.append(f"Latest candle volume changed {volume_change:+.1f}% from the prior candle; one candle alone is not confirmation.")
    return notes
