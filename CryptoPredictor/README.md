# CryptoPredictor

CryptoPredictor is a local Flask application for exploring cryptocurrency market data. It combines stored Binance OHLCV candles, explainable technical indicators, filtered news context, basic sentiment labels, two starter machine-learning models, range scenarios, and prediction evaluation.

It is an analysis tool only. It does not connect to an exchange account, place orders, or claim to know future prices.

## What it includes

- BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, and XRPUSDT on first run, plus a field for another valid Binance pair.
- Public Binance OHLCV downloads for 1m, 5m, 15m, 1h, 4h, and 1d. SQLite avoids duplicates with `symbol + interval + timestamp`.
- Candlestick/volume chart with EMA 20, EMA 50, EMA 200, support, and resistance.
- SMA, EMA, RSI, MACD, Bollinger Bands, ATR, volume analysis, and plain-English explanations.
- Relevant news collection from GDELT by default, or NewsAPI when `NEWS_API_KEY` is added to `.env`. A temporary news failure never blocks market analysis.
- Inspectable rule-based news sentiment and impact labels.
- Time-ordered (not random) train/test splits for Linear Regression and Random Forest. News features are attached only to candles after an article was published.
- 1 hour, 4 hour, 12 hour, 1 day, 3 day, and 7 day **ranges** with a measured confidence explanation.
- Every generated estimate is stored; eligible predictions are later checked against an actual stored 1-hour candle.

## Install and run on macOS

Open Terminal and run these commands from the project folder:

```bash
cd "/Users/khupawmoo/Desktop/blah blah blah/CryptoPredictor"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Then open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

On the first visit, select a pair and click **Refresh market data & news**. This populates the SQLite database. Once 1-hour candles are present, click **Train models & create ranges**. The first training may take a short while because it evaluates both models for each available horizon.

To stop the application, return to Terminal and press `Control + C`.

## Optional news key

The project includes a local `.env` file that is ignored by Git. It already works without a key using GDELT. If you have a NewsAPI key, add it here:

```env
NEWS_API_KEY=your_key_here
```

Never commit `.env`; use `.env.example` as the safe template.

## Project guide

| Folder / file | Purpose |
| --- | --- |
| `app.py` | Starts Flask and creates tables on first run. |
| `config.py` | Safe, central settings and supported pairs. |
| `database/` | SQLite schema and small database helper functions. |
| `data/` | Binance market-data downloader and news collector. |
| `analysis/` | Technical calculations, sentiment rules, combined explanation. |
| `prediction/` | Feature building, model training, ranges, and evaluation. |
| `templates/`, `static/` | The browser dashboard. |
| `models/` | Locally generated `.joblib` model snapshots (ignored by Git). |
| `tests/` | Focused checks for calculations and database uniqueness. |

## Database tables

The SQLite file is created at `database/crypto_predictor.db`. Required tables are `coins`, `candles`, `technical_indicators`, `news`, `predictions`, `prediction_results`, and `model_performance`. `market_snapshots` is an additional small cache for the current Binance ticker.

News records eventually receive `price_at_publication`, `price_after_1h`, `price_after_4h`, and `price_after_12h` where matching stored candles exist. This enables future experiments with the relationship between events and market movement.

## Run the automated checks

With the virtual environment activated:

```bash
pytest -q
```

## Important limitations

- APIs can be down, rate-limited, blocked by a network, or have missing data. The app preserves existing local data and reports warnings.
- Market models learn patterns from past prices; they do not know unexpected news or future market conditions.
- A positive headline does not guarantee a price increase, and a high confidence label is not investment advice.
- Model performance is shown so a poor model is visible rather than hidden.
