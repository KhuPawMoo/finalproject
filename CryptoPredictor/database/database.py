"""Small SQLite helper functions used by the rest of the application."""
from contextlib import contextmanager
from datetime import datetime, timezone
import math
import sqlite3
from pathlib import Path

from config import DATABASE_PATH, SUPPORTED_SYMBOLS


def utc_now() -> str:
    """Return a consistent UTC timestamp string for database records."""
    return datetime.now(timezone.utc).isoformat()


def get_connection(db_path: Path | str = DATABASE_PATH) -> sqlite3.Connection:
    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def connection_scope(db_path: Path | str = DATABASE_PATH):
    connection = get_connection(db_path)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database(db_path: Path | str = DATABASE_PATH) -> None:
    """Create all tables, then add the starter coin list if it is missing."""
    schema_path = Path(__file__).with_name("schema.sql")
    with connection_scope(db_path) as connection:
        connection.executescript(schema_path.read_text())
        connection.executemany(
            "INSERT OR IGNORE INTO coins (symbol, name) VALUES (?, ?)",
            list(SUPPORTED_SYMBOLS.items()),
        )


def get_or_create_coin(connection: sqlite3.Connection, symbol: str) -> sqlite3.Row:
    symbol = symbol.upper().strip()
    row = connection.execute("SELECT * FROM coins WHERE symbol = ?", (symbol,)).fetchone()
    if row is None:
        name = SUPPORTED_SYMBOLS.get(symbol, symbol)
        connection.execute("INSERT INTO coins (symbol, name) VALUES (?, ?)", (symbol, name))
        row = connection.execute("SELECT * FROM coins WHERE symbol = ?", (symbol,)).fetchone()
    return row


def save_candles(candles: list[dict], db_path: Path | str = DATABASE_PATH) -> int:
    """Insert or update candles. The unique key prevents duplicate records."""
    if not candles:
        return 0
    values = [
        (c["symbol"], c["interval"], c["timestamp"], c["open"], c["high"], c["low"], c["close"], c["volume"])
        for c in candles
    ]
    sql = """
        INSERT INTO candles (symbol, interval, timestamp, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, interval, timestamp) DO UPDATE SET
            open=excluded.open, high=excluded.high, low=excluded.low,
            close=excluded.close, volume=excluded.volume
    """
    with connection_scope(db_path) as connection:
        connection.executemany(sql, values)
    return len(values)


def load_candles(symbol: str, interval: str, limit: int = 500, db_path: Path | str = DATABASE_PATH) -> list[dict]:
    with connection_scope(db_path) as connection:
        rows = connection.execute(
            """SELECT symbol, interval, timestamp, open, high, low, close, volume
               FROM candles WHERE symbol = ? AND interval = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (symbol.upper(), interval, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def latest_candle(symbol: str, interval: str = "1h", db_path: Path | str = DATABASE_PATH) -> dict | None:
    candles = load_candles(symbol, interval, limit=1, db_path=db_path)
    return candles[-1] if candles else None


def save_market_snapshot(ticker: dict, db_path: Path | str = DATABASE_PATH) -> None:
    if not ticker:
        return
    with connection_scope(db_path) as connection:
        connection.execute(
            """INSERT INTO market_snapshots
            (symbol, price, change_percent, high_24h, low_24h, volume_24h, updated_at, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
            price=excluded.price, change_percent=excluded.change_percent, high_24h=excluded.high_24h,
            low_24h=excluded.low_24h, volume_24h=excluded.volume_24h,
            updated_at=excluded.updated_at, source=excluded.source""",
            (ticker["symbol"], ticker["price"], ticker.get("change_percent"), ticker.get("high_24h"),
             ticker.get("low_24h"), ticker.get("volume_24h"), ticker["updated_at"], ticker["source"]),
        )


def latest_market_snapshot(symbol: str, db_path: Path | str = DATABASE_PATH) -> dict | None:
    with connection_scope(db_path) as connection:
        row = connection.execute("SELECT * FROM market_snapshots WHERE symbol = ?", (symbol.upper(),)).fetchone()
    return dict(row) if row else None


def update_news_outcomes(symbol: str, db_path: Path | str = DATABASE_PATH) -> int:
    """Fill actual 1h/4h/12h price changes for old cached news when candles are present."""
    from datetime import datetime, timedelta
    with connection_scope(db_path) as connection:
        rows = connection.execute(
            """SELECT id, published_at FROM news WHERE cryptocurrency = ?
            AND (price_at_publication IS NULL OR price_after_1h IS NULL OR price_after_4h IS NULL OR price_after_12h IS NULL)""",
            (symbol.upper(),),
        ).fetchall()
        candles = connection.execute(
            "SELECT timestamp, close FROM candles WHERE symbol = ? AND interval = '1h' ORDER BY timestamp", (symbol.upper(),)
        ).fetchall()
        updated = 0
        for row in rows:
            try:
                published = datetime.fromisoformat(row["published_at"].replace("Z", "+00:00"))
            except ValueError:
                continue
            def close_at_or_after(hours: int):
                wanted = int((published + timedelta(hours=hours)).timestamp() * 1000)
                match = next((candle for candle in candles if candle["timestamp"] >= wanted), None)
                return match["close"] if match else None
            start = close_at_or_after(0)
            one, four, twelve = close_at_or_after(1), close_at_or_after(4), close_at_or_after(12)
            if any(value is not None for value in (start, one, four, twelve)):
                connection.execute(
                    """UPDATE news SET price_at_publication = COALESCE(price_at_publication, ?),
                    price_after_1h = COALESCE(price_after_1h, ?), price_after_4h = COALESCE(price_after_4h, ?),
                    price_after_12h = COALESCE(price_after_12h, ?) WHERE id = ?""",
                    (start, one, four, twelve, row["id"]),
                )
                updated += 1
    return updated


def save_indicators(symbol: str, interval: str, values: dict, db_path: Path | str = DATABASE_PATH) -> None:
    fields = [
        "timestamp", "sma_20", "ema_20", "ema_50", "ema_200", "rsi", "macd", "macd_signal",
        "bb_upper", "bb_middle", "bb_lower", "atr", "volume_ma", "volume_change_pct", "support", "resistance",
    ]
    column_list = ", ".join(["symbol", "interval", *fields])
    placeholders = ", ".join("?" for _ in range(len(fields) + 2))
    update_list = ", ".join(f"{field}=excluded.{field}" for field in fields[1:])
    row_values = [symbol.upper(), interval, *[values.get(field) for field in fields]]
    with connection_scope(db_path) as connection:
        connection.execute(
            f"""INSERT INTO technical_indicators ({column_list}) VALUES ({placeholders})
            ON CONFLICT(symbol, interval, timestamp) DO UPDATE SET {update_list}""",
            row_values,
        )


def save_news(article: dict, db_path: Path | str = DATABASE_PATH) -> None:
    with connection_scope(db_path) as connection:
        coin = get_or_create_coin(connection, article["cryptocurrency"])
        connection.execute(
            """INSERT INTO news
            (coin_id, title, source, url, published_at, cryptocurrency, summary, sentiment,
             sentiment_score, impact, impact_reason, price_at_publication)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
              title=excluded.title, source=excluded.source, published_at=excluded.published_at,
              summary=excluded.summary, sentiment=excluded.sentiment,
              sentiment_score=excluded.sentiment_score, impact=excluded.impact,
              impact_reason=excluded.impact_reason
            """,
            (coin["id"], article["title"], article["source"], article["url"], article["published_at"],
             article["cryptocurrency"], article.get("summary", ""), article["sentiment"],
             article["sentiment_score"], article["impact"], article["impact_reason"],
             article.get("price_at_publication")),
        )


def recent_news(symbol: str | None = None, limit: int = 12, db_path: Path | str = DATABASE_PATH) -> list[dict]:
    with connection_scope(db_path) as connection:
        if symbol:
            rows = connection.execute(
                "SELECT * FROM news WHERE cryptocurrency = ? ORDER BY published_at DESC LIMIT ?",
                (symbol.upper(), limit),
            ).fetchall()
        else:
            rows = connection.execute("SELECT * FROM news ORDER BY published_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


def save_prediction(prediction: dict, db_path: Path | str = DATABASE_PATH) -> int:
    with connection_scope(db_path) as connection:
        coin = get_or_create_coin(connection, prediction["symbol"])
        fields = [
            "symbol", "created_at", "target_time", "horizon_label", "horizon_hours", "current_price",
            "predicted_price", "lower_range", "upper_range", "bearish_low", "bearish_high", "neutral_low",
            "neutral_high", "bullish_low", "bullish_high", "confidence", "confidence_reason", "model_name",
            "model_agreement",
        ]
        values = [prediction[field] for field in fields]
        cursor = connection.execute(
            f"INSERT INTO predictions (coin_id, {', '.join(fields)}) VALUES ({', '.join('?' for _ in range(len(fields) + 1))})",
            [coin["id"], *values],
        )
        return cursor.lastrowid


def recent_predictions(symbol: str, limit: int = 18, db_path: Path | str = DATABASE_PATH) -> list[dict]:
    with connection_scope(db_path) as connection:
        rows = connection.execute(
            """SELECT p.*, r.actual_price, r.range_correct, r.direction_correct
            FROM predictions p LEFT JOIN prediction_results r ON r.prediction_id = p.id
            WHERE p.symbol = ? ORDER BY p.created_at DESC LIMIT ?""",
            (symbol.upper(), limit),
        ).fetchall()
    return [dict(row) for row in rows]


def save_model_performance(record: dict, db_path: Path | str = DATABASE_PATH) -> None:
    with connection_scope(db_path) as connection:
        coin = get_or_create_coin(connection, record["symbol"])
        connection.execute(
            """INSERT INTO model_performance
            (coin_id, model_name, horizon_label, measured_at, sample_count, mae, rmse, mape,
             directional_accuracy, range_accuracy, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (coin["id"], record["model_name"], record["horizon_label"], utc_now(), record["sample_count"],
             record.get("mae"), record.get("rmse"), record.get("mape"), record.get("directional_accuracy"),
             record.get("range_accuracy"), record.get("notes", "time-based holdout")),
        )


def latest_model_performance(symbol: str, db_path: Path | str = DATABASE_PATH) -> list[dict]:
    """Return one latest measurement for each model and prediction horizon."""
    with connection_scope(db_path) as connection:
        rows = connection.execute(
            """SELECT mp.* FROM model_performance mp
            JOIN coins c ON c.id = mp.coin_id
            WHERE c.symbol = ? AND mp.id IN (
                SELECT MAX(inner_mp.id) FROM model_performance inner_mp
                GROUP BY inner_mp.coin_id, inner_mp.model_name, inner_mp.horizon_label
            ) ORDER BY mp.horizon_label, mp.model_name""",
            (symbol.upper(),),
        ).fetchall()
    return [dict(row) for row in rows]


def pending_predictions(db_path: Path | str = DATABASE_PATH) -> list[dict]:
    now = utc_now()
    with connection_scope(db_path) as connection:
        rows = connection.execute(
            "SELECT * FROM predictions WHERE status = 'pending' AND target_time <= ?", (now,)
        ).fetchall()
    return [dict(row) for row in rows]


def record_prediction_result(prediction: dict, actual_price: float, db_path: Path | str = DATABASE_PATH) -> dict:
    error = abs(actual_price - prediction["predicted_price"])
    percentage_error = (error / actual_price * 100) if actual_price else None
    expected_direction = prediction["predicted_price"] >= prediction["current_price"]
    actual_direction = actual_price >= prediction["current_price"]
    in_range = prediction["lower_range"] <= actual_price <= prediction["upper_range"]
    result = {
        "absolute_error": error,
        "squared_error": error ** 2,
        "absolute_percentage_error": percentage_error,
        "direction_correct": int(expected_direction == actual_direction),
        "range_correct": int(in_range),
    }
    with connection_scope(db_path) as connection:
        connection.execute(
            """INSERT OR REPLACE INTO prediction_results
            (prediction_id, evaluated_at, actual_price, absolute_error, squared_error,
             absolute_percentage_error, direction_correct, range_correct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (prediction["id"], utc_now(), actual_price, *result.values()),
        )
        connection.execute("UPDATE predictions SET status = 'evaluated' WHERE id = ?", (prediction["id"],))
    return result


def evaluation_summary(symbol: str, db_path: Path | str = DATABASE_PATH) -> dict | None:
    with connection_scope(db_path) as connection:
        row = connection.execute(
            """SELECT COUNT(*) AS sample_count, AVG(r.absolute_error) AS mae,
            AVG(r.squared_error) AS mse, AVG(r.absolute_percentage_error) AS mape,
            AVG(r.direction_correct) * 100 AS directional_accuracy,
            AVG(r.range_correct) * 100 AS range_accuracy
            FROM prediction_results r JOIN predictions p ON p.id = r.prediction_id
            WHERE p.symbol = ?""",
            (symbol.upper(),),
        ).fetchone()
    if not row or not row["sample_count"]:
        return None
    summary = dict(row)
    summary["rmse"] = math.sqrt(summary.pop("mse"))
    return summary
