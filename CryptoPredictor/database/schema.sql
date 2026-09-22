PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS coins (
    id INTEGER PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candles (
    id INTEGER PRIMARY KEY,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, interval, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_candles_lookup
ON candles(symbol, interval, timestamp);

CREATE TABLE IF NOT EXISTS market_snapshots (
    symbol TEXT PRIMARY KEY,
    price REAL NOT NULL,
    change_percent REAL,
    high_24h REAL,
    low_24h REAL,
    volume_24h REAL,
    updated_at TEXT NOT NULL,
    source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS technical_indicators (
    id INTEGER PRIMARY KEY,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    sma_20 REAL,
    ema_20 REAL,
    ema_50 REAL,
    ema_200 REAL,
    rsi REAL,
    macd REAL,
    macd_signal REAL,
    bb_upper REAL,
    bb_middle REAL,
    bb_lower REAL,
    atr REAL,
    volume_ma REAL,
    volume_change_pct REAL,
    support REAL,
    resistance REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, interval, timestamp)
);

CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY,
    coin_id INTEGER,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    published_at TEXT NOT NULL,
    cryptocurrency TEXT,
    summary TEXT,
    sentiment TEXT NOT NULL DEFAULT 'Neutral',
    sentiment_score REAL NOT NULL DEFAULT 0,
    impact TEXT NOT NULL DEFAULT 'Low',
    impact_reason TEXT,
    price_at_publication REAL,
    price_after_1h REAL,
    price_after_4h REAL,
    price_after_12h REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coin_id) REFERENCES coins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_news_coin_date ON news(coin_id, published_at DESC);

CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY,
    coin_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    created_at TEXT NOT NULL,
    target_time TEXT NOT NULL,
    horizon_label TEXT NOT NULL,
    horizon_hours INTEGER NOT NULL,
    current_price REAL NOT NULL,
    predicted_price REAL NOT NULL,
    lower_range REAL NOT NULL,
    upper_range REAL NOT NULL,
    bearish_low REAL NOT NULL,
    bearish_high REAL NOT NULL,
    neutral_low REAL NOT NULL,
    neutral_high REAL NOT NULL,
    bullish_low REAL NOT NULL,
    bullish_high REAL NOT NULL,
    confidence TEXT NOT NULL,
    confidence_reason TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_agreement REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (coin_id) REFERENCES coins(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_predictions_pending ON predictions(symbol, target_time, status);

CREATE TABLE IF NOT EXISTS prediction_results (
    id INTEGER PRIMARY KEY,
    prediction_id INTEGER NOT NULL UNIQUE,
    evaluated_at TEXT NOT NULL,
    actual_price REAL NOT NULL,
    absolute_error REAL NOT NULL,
    squared_error REAL NOT NULL,
    absolute_percentage_error REAL,
    direction_correct INTEGER NOT NULL,
    range_correct INTEGER NOT NULL,
    FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_performance (
    id INTEGER PRIMARY KEY,
    coin_id INTEGER NOT NULL,
    model_name TEXT NOT NULL,
    horizon_label TEXT NOT NULL,
    measured_at TEXT NOT NULL,
    sample_count INTEGER NOT NULL,
    mae REAL,
    rmse REAL,
    mape REAL,
    directional_accuracy REAL,
    range_accuracy REAL,
    notes TEXT,
    FOREIGN KEY (coin_id) REFERENCES coins(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_performance_lookup
ON model_performance(coin_id, model_name, horizon_label, measured_at DESC);
