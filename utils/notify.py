"""
In-app notifications.

notify() only ADDS the notification to the current database session; the
caller commits it together with the change it describes (booking, payment...),
so a notification never exists for an action that was rolled back.
"""
from extensions import db
from models import Notification


def notify(user_id, title, message, type="system", link=None):
    note = Notification(user_id=user_id, title=title, message=message, type=type, link=link)
    db.session.add(note)
    return note


def notify_many(user_ids, title, message, type="system", link=None):
    for user_id in set(user_ids):
        notify(user_id, title, message, type, link)
