"""Central settings for CryptoPredictor.

Values that may contain secrets are read from .env, never hard-coded here.
"""
from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATABASE_PATH = BASE_DIR / "database" / "crypto_predictor.db"
MODEL_DIR = BASE_DIR / "models"

BINANCE_BASE_URL = os.getenv("BINANCE_BASE_URL", "https://api.binance.com")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "development-only-change-me")
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"

SUPPORTED_SYMBOLS = {
    "BTCUSDT": "Bitcoin",
    "ETHUSDT": "Ethereum",
    "SOLUSDT": "Solana",
    "BNBUSDT": "BNB",
    "XRPUSDT": "XRP",
}

INTERVALS = {
    "1m": "1 minute",
    "5m": "5 minutes",
    "15m": "15 minutes",
    "1h": "1 hour",
    "4h": "4 hours",
    "1d": "1 day",
}

# Predictions use 1-hour candles so every requested horizon has a consistent meaning.
PREDICTION_HORIZONS = {
    "1 hour": 1,
    "4 hours": 4,
    "12 hours": 12,
    "1 day": 24,
    "3 days": 72,
    "7 days": 168,
}

DEFAULT_CANDLE_LIMIT = 500
REQUEST_TIMEOUT_SECONDS = 12

