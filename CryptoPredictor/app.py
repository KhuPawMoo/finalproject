"""CryptoPredictor entry point. Run: python app.py"""
from flask import Flask

from config import FLASK_DEBUG, FLASK_SECRET_KEY
from database.database import initialize_database
from routes.main import main


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = FLASK_SECRET_KEY
    initialize_database()
    app.register_blueprint(main)
    return app


app = create_app()

if __name__ == "__main__":
    # Local-only by default. Do not expose this development server directly to the internet.
    # Disabling Flask's reloader keeps this beginner-friendly local command stable
    # in restricted environments while FLASK_DEBUG can still enable useful errors.
    app.run(host="127.0.0.1", port=5000, debug=FLASK_DEBUG, use_reloader=False)
