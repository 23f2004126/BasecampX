import os

# Absolute path of the project folder (the folder that contains this file)
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")


class Config:
    # ---------- Core ----------
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")

    # ---------- Database (SQLite) ----------
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(INSTANCE_DIR, "tma.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ---------- Flask-Security (token auth) ----------
    SECURITY_PASSWORD_SALT = os.environ.get(
        "SECURITY_PASSWORD_SALT", "dev-password-salt-change-me"
    )
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
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

    # ---------- Cache (Redis) ----------
    CACHE_TYPE = "RedisCache"
    CACHE_REDIS_URL = "redis://localhost:6379/0"
    CACHE_DEFAULT_TIMEOUT = 300

    # ---------- Mail (MailHog) ----------
    MAIL_SERVER = "localhost"
    MAIL_PORT = 1025
    MAIL_USE_TLS = False
    MAIL_USE_SSL = False
    MAIL_DEFAULT_SENDER = "noreply@tma.local"

    # ---------- Celery (values only, Celery is set up elsewhere) ----------
    CELERY_BROKER_URL = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND = "redis://localhost:6379/2"
