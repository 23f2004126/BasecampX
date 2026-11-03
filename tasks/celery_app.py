"""
Celery application: background jobs and the scheduler (beat).

    worker:  celery -A tasks.celery_app worker --loglevel=info
    beat:    celery -A tasks.celery_app beat --loglevel=info

- Broker (Redis db 1): the queue where Flask drops "please run this job" messages.
- Result backend (Redis db 2): where a finished job's status/result is stored,
  so the API can answer "is my export ready yet?".
- Every task runs inside the Flask app context, so tasks can use db, mail,
  config and models exactly like a route does.
"""
import os
import sys
import threading

from celery import Celery, Task
from celery.schedules import crontab
from flask import has_app_context

# `celery -A tasks.celery_app` puts the project folder at the front of sys.path
# while it loads this module, then removes that entry again. Tasks later import
# app/routes/models lazily, so keep our own copy of the folder on the path.
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(PROJECT_DIR)

# Only defines create_app; the app (and its routes) is built later, on first
# task, so there is no circular import.
from app import create_app  # noqa: E402
from config import Config  # noqa: E402

_flask_app = None
_flask_app_lock = threading.Lock()


def get_flask_app():
    """Create the Flask app once per worker, on first use (the lock stops two
    worker threads from creating it at the same time)."""
    global _flask_app
    with _flask_app_lock:
        if _flask_app is None:
            _flask_app = create_app()
    return _flask_app


class FlaskTask(Task):
    """Base class for every task: run the task body inside the Flask app context."""

    def __call__(self, *args, **kwargs):
        if has_app_context():  # e.g. called directly from a Flask route or test
            return self.run(*args, **kwargs)
        with get_flask_app().app_context():
            return self.run(*args, **kwargs)


celery = Celery(
    "tma",
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
    task_cls=FlaskTask,
    include=["tasks.tasks"],
)

celery.conf.update(
    timezone=Config.CELERY_TIMEZONE,  # crontab times below are India time
    enable_utc=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=60 * 60 * 24,       # forget results after a day
    # Run jobs in threads inside one worker process. The default "prefork"
    # pool spawns child processes, which breaks on macOS (spawn start method);
    # our jobs mostly wait on the DB and SMTP, so threads suit them well.
    worker_pool="threads",
    worker_concurrency=4,
    broker_connection_retry_on_startup=True,
    # If Redis is down, .delay() in a request should fail fast, not hang
    broker_transport_options={"socket_connect_timeout": 2},
    task_publish_retry_policy={"max_retries": 2, "interval_start": 0, "interval_step": 0.5},
    beat_schedule={
        "daily-reminder": {
            "task": "tasks.daily_reminder",
            "schedule": crontab(hour=18, minute=0),              # every day, 6:00 PM
        },
        "auto-cancel-unpaid": {
            "task": "tasks.auto_cancel_unpaid",
            "schedule": crontab(minute="*/10"),                  # every 10 minutes
        },
        "monthly-report": {
            "task": "tasks.monthly_report",
            "schedule": crontab(day_of_month=1, hour=9, minute=0),  # 1st of month, 9:00 AM
        },
    },
)
