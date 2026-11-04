"""
Serves the service worker from the site root.

A service worker only controls pages under its own URL, so it must live at
/service-worker.js rather than /static/... to cover the whole app. no-cache
makes browsers check for a new version every time.
"""
from flask import Blueprint, current_app, send_from_directory

pwa_bp = Blueprint("pwa", __name__)


@pwa_bp.route("/service-worker.js")
def service_worker():
    response = send_from_directory(current_app.static_folder, "service-worker.js", mimetype="application/javascript")
    response.headers["Cache-Control"] = "no-cache"
    return response
