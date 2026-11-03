"""
Extension objects are created here WITHOUT an app.
They get attached to the app later inside create_app() using init_app().
Any file can do `from extensions import db` without importing app.py,
which is what prevents circular imports.
"""
from flask_caching import Cache
from flask_mail import Mail
from flask_security import Security
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine

db = SQLAlchemy()
cache = Cache()
mail = Mail()
security = Security()


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    """SQLite ignores foreign keys unless this is switched on for each connection."""
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
