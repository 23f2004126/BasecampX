import os

from dotenv import load_dotenv

# Absolute path of the project folder (the folder that contains this file)
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")

# Values in a .env file (see .env.example) become environment variables.
# Real environment variables win over the file.
load_dotenv(os.path.join(BASE_DIR, ".env"))


def required_env(name):
    """Secrets have no default in the code: they must come from .env."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set. Copy .env.example to .env and fill it in.")
    return value


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


class Config:
    # ---------- Core ----------
    SECRET_KEY = required_env("SECRET_KEY")

    # ---------- Database (SQLite) ----------
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(INSTANCE_DIR, "tma.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ---------- Flask-Security (token auth) ----------
    SECURITY_PASSWORD_SALT = required_env("SECURITY_PASSWORD_SALT")
    SECURITY_PASSWORD_HASH = "bcrypt"
    # Clients send their token in this header on every request.
    SECURITY_TOKEN_AUTHENTICATION_HEADER = "Authentication-Token"
    SECURITY_TOKEN_MAX_AGE = 60 * 60 * 24  # tokens expire after 24 hours
    # We use our own JSON API (/api/register, /api/login), so Flask-Security's
    # built-in HTML views are turned off. (Its blueprint is also not registered
    # in app.py, so none of its default routes exist.)
    SECURITY_REGISTERABLE = False
    SECURITY_SEND_REGISTER_EMAIL = False
    # The API is called from JavaScript with a token, not from HTML forms,
    # so CSRF protection is switched off for it.
    WTF_CSRF_ENABLED = False
    SECURITY_CSRF_IGNORE_UNAUTH_ENDPOINTS = True

    # ---------- First admin (created by create_initial_data.py) ----------
    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@tma.com")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

    # ---------- Cache (Redis) ----------
    CACHE_TYPE = "RedisCache"
    CACHE_REDIS_URL = os.environ.get("CACHE_REDIS_URL", "redis://localhost:6379/0")
    CACHE_DEFAULT_TIMEOUT = 300
    CACHE_KEY_PREFIX = "tma:"  # keys show up as tma:treks:list:... in redis-cli
    # Fail fast if Redis is down, so a request waits at most ~0.5s before
    # falling back to the database instead of hanging.
    CACHE_OPTIONS = {"socket_connect_timeout": 0.5, "socket_timeout": 0.5}

    # How long each cached response lives (seconds)
    CACHE_TTL_TREKS = 5 * 60
    CACHE_TTL_LOCATIONS = 30 * 60
    CACHE_TTL_ADMIN = 2 * 60

    # ---------- Mail (MailHog locally; real SMTP by setting these in .env) ----------
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "localhost")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 1025))
    MAIL_USE_TLS = env_bool("MAIL_USE_TLS")
    MAIL_USE_SSL = env_bool("MAIL_USE_SSL")
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "TMA <noreply@tma.local>")

    # ---------- Celery (background jobs: tasks/celery_app.py) ----------
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    CELERY_TIMEZONE = "Asia/Kolkata"

    # ---------- Jobs ----------
    # Where CSV exports are written (served only through /api/exports/<file>)
    EXPORT_DIR = os.path.join(BASE_DIR, "static", "exports")
    # Optional: Google Chat incoming-webhook URL for daily reminders
    GCHAT_WEBHOOK_URL = os.environ.get("GCHAT_WEBHOOK_URL", "")
    # Used to build links inside emails
    APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://127.0.0.1:5001")
    REMINDER_DAYS_AHEAD = 3
    # Simulated payment gateway "processing" time (seconds)
    PAYMENT_SIMULATION_SECONDS = float(os.environ.get("PAYMENT_SIMULATION_SECONDS", 1.0))
