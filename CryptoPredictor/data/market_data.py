"""Download Binance public OHLCV and ticker data, then cache it in SQLite."""
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import re

import requests

from config import BINANCE_BASE_URL, DEFAULT_CANDLE_LIMIT, INTERVALS, REQUEST_TIMEOUT_SECONDS
from database.database import latest_candle, save_candles, save_market_snapshot


class MarketDataError(RuntimeError):
    """An expected market-data problem that can be displayed safely to the user."""


def validate_symbol(symbol: str) -> str:
    """Allow standard Binance symbols, e.g. BTCUSDT; reject unsafe/invalid input."""
    clean_symbol = (symbol or "").upper().strip()
    if not re.fullmatch(r"[A-Z0-9]{5,20}", clean_symbol):
        raise MarketDataError("Use a Binance pair such as BTCUSDT (letters/numbers only).")
    return clean_symbol


def _request_json(path: str, params: dict) -> object:
    try:
        response = requests.get(
            f"{BINANCE_BASE_URL}{path}", params=params,
            timeout=REQUEST_TIMEOUT_SECONDS, headers={"User-Agent": "CryptoPredictor/1.0"},
        )
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise MarketDataError(f"Binance market data is temporarily unavailable: {exc}") from exc
    if isinstance(data, dict) and data.get("code"):
        raise MarketDataError(data.get("msg", "Binance rejected this request."))
    return data


def fetch_candles(symbol: str, interval: str, limit: int = DEFAULT_CANDLE_LIMIT) -> list[dict]:
    """Fetch candles from Binance. Values are converted to Python numbers immediately."""
    symbol = validate_symbol(symbol)
    if interval not in INTERVALS:
        raise MarketDataError(f"Unsupported interval: {interval}")
    rows = _request_json("/api/v3/klines", {"symbol": symbol, "interval": interval, "limit": min(max(limit, 1), 1000)})
    if not isinstance(rows, list) or not rows:
        raise MarketDataError("Binance returned no candle data for this pair.")
    return [
        {
            "symbol": symbol,
            "interval": interval,
            "timestamp": int(row[0]),
            "open": float(row[1]),
            "high": float(row[2]),
            "low": float(row[3]),
            "close": float(row[4]),
            "volume": float(row[5]),
        }
        for row in rows
    ]


def fetch_ticker(symbol: str) -> dict:
    """Fetch Binance's 24-hour ticker summary for the headline dashboard cards."""
    symbol = validate_symbol(symbol)
    data = _request_json("/api/v3/ticker/24hr", {"symbol": symbol})
    try:
        return {
            "symbol": symbol,
            "price": float(data["lastPrice"]),
            "change_percent": float(data["priceChangePercent"]),
            "high_24h": float(data["highPrice"]),
            "low_24h": float(data["lowPrice"]),
            "volume_24h": float(data["volume"]),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "source": "Binance public API",
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise MarketDataError("Binance returned an unexpected ticker response.") from exc


def cached_ticker(symbol: str) -> dict | None:
    """Provide a useful dashboard price while offline, using the latest stored 1h candle."""
    candle = latest_candle(symbol, "1h")
    if not candle:
        return None
    return {
        "symbol": symbol.upper(),
        "price": candle["close"],
        "change_percent": None,
        "high_24h": None,
        "low_24h": None,
        "volume_24h": candle["volume"],
        "updated_at": datetime.fromtimestamp(candle["timestamp"] / 1000, tz=timezone.utc).isoformat(),
        "source": "local SQLite cache",
    }


def refresh_market_data(symbol: str, intervals: list[str] | None = None, limit: int = DEFAULT_CANDLE_LIMIT) -> dict:
    """Refresh selected intervals independently and in parallel.

    Public endpoints can occasionally be slow. Parallel requests keep one delayed
    timeframe from making the beginner dashboard appear stuck for a long time.
    """
    symbol = validate_symbol(symbol)
    intervals = intervals or list(INTERVALS)
    result = {"symbol": symbol, "updated": {}, "errors": []}
    with ThreadPoolExecutor(max_workers=len(intervals) + 1) as executor:
        pending = {executor.submit(fetch_candles, symbol, item, limit): item for item in intervals}
        ticker_future = executor.submit(fetch_ticker, symbol)
        for future in as_completed(pending):
            interval = pending[future]
            try:
                result["updated"][interval] = save_candles(future.result())
            except MarketDataError as exc:
                result["errors"].append(f"{interval}: {exc}")
        try:
            result["ticker"] = ticker_future.result()
            save_market_snapshot(result["ticker"])
        except MarketDataError as exc:
            result["ticker"] = cached_ticker(symbol)
            result["errors"].append(f"Ticker: {exc}")
    return result
