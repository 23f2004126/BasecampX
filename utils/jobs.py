"""
Starting Celery jobs from a request.
"""
from flask import abort, current_app


def enqueue(task, *args, **kwargs):
    """
    Queue a Celery task and return its AsyncResult (result.id is the task id).
    If the broker (Redis) is unreachable, answer 503 instead of crashing.
    """
    try:
        return task.delay(*args, **kwargs)
    except Exception as error:  # kombu OperationalError, connection refused...
        current_app.logger.error("Could not queue %s: %s", task.name, error)
        abort(503, description="Background jobs are unavailable right now. Please try again in a minute.")
