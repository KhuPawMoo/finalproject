from database.database import initialize_database, load_candles, save_candles


def test_candle_unique_key_prevents_duplicates(tmp_path):
    database_path = tmp_path / "test.db"
    initialize_database(database_path)
    candle = {"symbol": "BTCUSDT", "interval": "1h", "timestamp": 123, "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 10}
    save_candles([candle, {**candle, "close": 1.7}], database_path)
    stored = load_candles("BTCUSDT", "1h", db_path=database_path)
    assert len(stored) == 1
    assert stored[0]["close"] == 1.7
