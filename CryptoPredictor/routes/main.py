"""Flask pages and JSON endpoints for the local CryptoPredictor dashboard."""
from datetime import datetime, timezone
import math

from flask import Blueprint, jsonify, redirect, render_template, request, url_for

from analysis.market import build_market_analysis
from analysis.technical import calculate_indicators, latest_indicator_values, technical_explanations
from config import INTERVALS, SUPPORTED_SYMBOLS
from data.market_data import MarketDataError, refresh_market_data, validate_symbol
from data.news_data import fetch_and_store_news
from database.database import (
    latest_market_snapshot,
    latest_model_performance,
    load_candles,
    recent_news,
    recent_predictions,
    save_indicators,
    update_news_outcomes,
)
from prediction.evaluate import evaluate_pending_predictions
from prediction.predict import generate_predictions

main = Blueprint("main", __name__)


def _finite(value):
    """Make NaN / numpy values safe for browser JSON and SQLite storage."""
    if value is None:
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return value


def _json_safe(value):
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return _finite(value)


def _dashboard_data(symbol: str, interval: str = "1h") -> dict:
    symbol = validate_symbol(symbol)
    interval = interval if interval in INTERVALS else "1h"
    candles = load_candles(symbol, interval, limit=500)
    indicator_frame = calculate_indicators(candles)
    values = latest_indicator_values(indicator_frame)
    if values:
        save_indicators(symbol, interval, values)
    articles = recent_news(symbol)
    predictions = recent_predictions(symbol)
    return {
        "symbol": symbol,
        "interval": interval,
        "ticker": latest_market_snapshot(symbol),
        # The chart needs candle values and indicator lines from the same timestamped rows.
        "candles": indicator_frame.to_dict(orient="records") if not indicator_frame.empty else [],
        "indicators": values,
        "explanations": technical_explanations(values),
        "news": articles,
        "predictions": predictions,
        "performance": latest_model_performance(symbol),
        "analysis": build_market_analysis(symbol, values, articles, predictions),
        "updated_from_cache": datetime.now(timezone.utc).isoformat(),
    }


@main.get("/")
def index():
    selected_symbol = request.args.get("symbol", "BTCUSDT").upper()
    if selected_symbol not in SUPPORTED_SYMBOLS:
        selected_symbol = "BTCUSDT"
    return render_template("index.html", symbols=SUPPORTED_SYMBOLS, intervals=INTERVALS, selected_symbol=selected_symbol)


@main.get("/coin/<symbol>")
def coin_page(symbol: str):
    try:
        return redirect(url_for("main.index", symbol=validate_symbol(symbol)))
    except MarketDataError:
        return redirect(url_for("main.index"))


@main.get("/news")
def news_page():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    return render_template("news.html", articles=recent_news(symbol, limit=50), symbols=SUPPORTED_SYMBOLS, selected_symbol=symbol)


@main.get("/predictions")
def predictions_page():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    return render_template(
        "predictions.html", predictions=recent_predictions(symbol, limit=50), performance=latest_model_performance(symbol),
        symbols=SUPPORTED_SYMBOLS, selected_symbol=symbol,
    )


@main.get("/api/dashboard/<symbol>")
def api_dashboard(symbol: str):
    try:
        return jsonify(_json_safe(_dashboard_data(symbol, request.args.get("interval", "1h"))))
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400


@main.post("/api/refresh/<symbol>")
def api_refresh(symbol: str):
    """Fetch fresh public data. Existing cached data remains safe if a call fails."""
    try:
        clean_symbol = validate_symbol(symbol)
        payload = request.get_json(silent=True) or {}
        requested_intervals = payload.get("intervals") or list(INTERVALS)
        intervals = [item for item in requested_intervals if item in INTERVALS]
        market_result = refresh_market_data(clean_symbol, intervals=intervals or list(INTERVALS))
        news_result = fetch_and_store_news(clean_symbol) if payload.get("include_news", True) else {"saved": 0, "error": None}
        news_outcomes = update_news_outcomes(clean_symbol)
        evaluation = evaluate_pending_predictions(clean_symbol)
        dashboard = _dashboard_data(clean_symbol, payload.get("display_interval", "1h"))
        return jsonify(_json_safe({
            "market": market_result, "news_refresh": news_result, "news_outcomes_updated": news_outcomes,
            "evaluation": evaluation, "dashboard": dashboard,
        }))
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400


@main.post("/api/analyze/<symbol>")
def api_analyze(symbol: str):
    """Train the starter models from locally stored 1-hour candles and save their ranges."""
    try:
        clean_symbol = validate_symbol(symbol)
        candles = load_candles(clean_symbol, "1h", limit=1000)
        articles = recent_news(clean_symbol, limit=100)
        result = generate_predictions(clean_symbol, candles, articles)
        dashboard = _dashboard_data(clean_symbol, "1h")
        return jsonify(_json_safe({"result": result, "dashboard": dashboard}))
    except MarketDataError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # Keep the local dashboard responsive and provide the cause.
        return jsonify({"error": f"Analysis could not finish: {exc}"}), 500
