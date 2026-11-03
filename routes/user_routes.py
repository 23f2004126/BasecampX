"""
Trekker API (role: user). Everything is under /api/user.

GET /dashboard, GET /bookings, GET /history, GET+PUT /profile
"""
from datetime import date

from flask import Blueprint, jsonify
from flask_security import current_user, hash_password, verify_password

from extensions import db, security
from models import BOOKING_STATUSES, ROLE_USER, Booking, Trek
from utils.decorators import role_required
from utils.pagination import paginate
from utils.validators import arg_choice, json_body, validate_profile_update, validation_error

user_bp = Blueprint("user", __name__, url_prefix="/api/user")

OPEN_TREKS_ON_DASHBOARD = 4


def booking_with_trek(booking):
    """Booking + full trek details (dates, location...) for the UI cards."""
    data = booking.to_dict()
    data["trek"] = booking.trek.to_dict()
    return data


def my_bookings():
    return Booking.query.filter(Booking.user_id == current_user.id)


@user_bp.route("/dashboard", methods=["GET"])
@role_required(ROLE_USER)
def dashboard():
    upcoming = (
        my_bookings().join(Trek)
        .filter(Booking.status == "Booked", Trek.start_date >= date.today())
        .order_by(Trek.start_date).all()
    )
    open_treks = (
        Trek.query.filter(Trek.status == "Open", Trek.available_slots > 0)
        .order_by(Trek.start_date).limit(OPEN_TREKS_ON_DASHBOARD).all()
    )
    return jsonify({
        "upcoming_bookings": [booking_with_trek(b) for b in upcoming],
        "open_treks": [t.to_dict() for t in open_treks],
    })


@user_bp.route("/bookings", methods=["GET"])
@role_required(ROLE_USER)
def bookings():
    query = my_bookings()
    status = arg_choice("status", BOOKING_STATUSES)
    if status:
        query = query.filter(Booking.status == status)
    return jsonify(paginate(query.order_by(Booking.booking_date.desc()), booking_with_trek))


@user_bp.route("/history", methods=["GET"])
@role_required(ROLE_USER)
def history():
    query = my_bookings().filter(Booking.status.in_(("Completed", "Cancelled")))
    return jsonify(paginate(query.order_by(Booking.booking_date.desc()), booking_with_trek))


@user_bp.route("/profile", methods=["GET"])
@role_required(ROLE_USER)
def get_profile():
    return jsonify(current_user.to_dict())


@user_bp.route("/profile", methods=["PUT"])
@role_required(ROLE_USER)
def update_profile():
    data, errors = validate_profile_update(json_body())
    if not errors and "new_password" in data:
        if not verify_password(data["current_password"], current_user.password):
            errors["current_password"] = "Current password is incorrect."
    if errors:
        return validation_error(errors)

    for field in ("full_name", "contact_number"):
        if field in data:
            setattr(current_user, field, data[field])

    response = {"message": "Profile updated."}
    if "new_password" in data:
        current_user.password = hash_password(data["new_password"])
        # Log out every other device that still holds an old token...
        security.datastore.set_uniquifier(current_user)
        # ...and give this device a fresh one so it stays logged in.
        response["token"] = current_user.get_auth_token()

    db.session.commit()
    response["user"] = current_user.to_dict()
    return jsonify(response)
