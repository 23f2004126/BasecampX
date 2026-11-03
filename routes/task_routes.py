"""
Background job status + file downloads.

GET /api/tasks/<task_id>     - PENDING / SUCCESS / FAILURE (+ download_url for exports)
GET /api/exports/<filename>  - download your own CSV export

Files in static/exports/ are NOT reachable through /static (app.py blocks
that path); this endpoint checks the token AND that the file belongs to you.
"""
import re

from celery.result import AsyncResult
from flask import Blueprint, abort, current_app, jsonify, send_from_directory
from flask_security import current_user

from models import ROLE_ADMIN, ROLE_USER
from tasks.celery_app import celery
from utils.decorators import role_required, token_required

task_bp = Blueprint("tasks", __name__, url_prefix="/api")

TASK_ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
EXPORT_RE = re.compile(r"^bookings_u(\d+)_\d{8}_\d{6}_[0-9a-f]{8}\.csv$")


@task_bp.route("/tasks/<task_id>", methods=["GET"])
@token_required
def task_status(task_id):
    if not TASK_ID_RE.match(task_id):
        abort(404, description="Task not found.")

    result = AsyncResult(task_id, app=celery)
    state = result.state  # PENDING, STARTED, RETRY, SUCCESS, FAILURE

    if state == "SUCCESS":
        data = result.result if isinstance(result.result, dict) else {}
        # Every task returns the id of the user who owns it (None = admin jobs).
        if not current_user.has_role(ROLE_ADMIN) and data.get("user_id") != current_user.id:
            abort(404, description="Task not found.")
        response = {"status": "SUCCESS"}
        if data.get("filename"):
            response["download_url"] = f"/api/exports/{data['filename']}"
            response["rows"] = data.get("rows")
        if current_user.has_role(ROLE_ADMIN):
            response["result"] = data
        return jsonify(response)

    if state == "FAILURE":
        return jsonify({"status": "FAILURE", "message": "The job failed. Please try again."})

    # Queued, running or retrying: from the user's point of view, still pending.
    return jsonify({"status": "PENDING"})


@task_bp.route("/exports/<filename>", methods=["GET"])
@role_required(ROLE_USER)
def download_export(filename):
    match = EXPORT_RE.match(filename)
    # Same 404 for "not yours" and "doesn't exist": don't reveal other users' files.
    if not match or int(match.group(1)) != current_user.id:
        abort(404, description="File not found.")
    return send_from_directory(
        current_app.config["EXPORT_DIR"], filename,
        as_attachment=True, download_name="tma-bookings.csv", mimetype="text/csv",
    )
