"""
In-app notifications (any logged-in role). Created with utils.notify.notify().

GET /api/notifications               - mine, newest first, paginated (+ unread count)
GET /api/notifications/unread-count  - for the bell badge
PUT /api/notifications/<id>/read
PUT /api/notifications/read-all
"""
from flask import Blueprint, abort, jsonify
from flask_security import current_user

from extensions import db
from models import Notification
from utils.decorators import token_required
from utils.pagination import paginate

notification_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def mine():
    return Notification.query.filter_by(user_id=current_user.id)


def unread_count():
    return mine().filter_by(is_read=False).count()


@notification_bp.route("", methods=["GET"])
@token_required
def list_notifications():
    page = paginate(mine().order_by(Notification.created_at.desc(), Notification.id.desc()))
    page["unread"] = unread_count()
    return jsonify(page)


@notification_bp.route("/unread-count", methods=["GET"])
@token_required
def get_unread_count():
    return jsonify({"unread": unread_count()})


@notification_bp.route("/<int:notification_id>/read", methods=["PUT"])
@token_required
def mark_read(notification_id):
    note = db.session.get(Notification, notification_id)
    if note is None or note.user_id != current_user.id:
        abort(404, description="Notification not found.")
    note.is_read = True
    db.session.commit()
    return jsonify({"notification": note.to_dict(), "unread": unread_count()})


@notification_bp.route("/read-all", methods=["PUT"])
@token_required
def mark_all_read():
    updated = mine().filter_by(is_read=False).update({"is_read": True}, synchronize_session=False)
    db.session.commit()
    return jsonify({"updated": updated, "unread": 0})
