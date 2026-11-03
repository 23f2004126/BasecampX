"""
Trekker API (role: user). Everything is under /api/user.

GET /dashboard, GET /bookings, GET /history, GET+PUT /profile, POST /export,
GET /bookings/<id>/certificate (PDF)
"""
from datetime import date
from io import BytesIO

from flask import Blueprint, abort, jsonify, send_file
from flask_security import current_user, hash_password, verify_password

from extensions import db, security
from models import BOOKING_STATUSES, ROLE_USER, Booking, Trek
from tasks.mailer import render
from tasks.tasks import export_bookings_csv
from utils.cache import clear_admin_cache
from utils.decorators import role_required
from utils.jobs import enqueue
from utils.pagination import paginate
from utils.pdf import PdfError, html_to_pdf
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


@user_bp.route("/export", methods=["POST"])
@role_required(ROLE_USER)
def export_bookings():
    """Start the CSV export in the background; poll GET /api/tasks/<task_id>."""
    job = enqueue(export_bookings_csv, current_user.id)
    return jsonify({"task_id": job.id, "message": "Export started."}), 202


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
    if "full_name" in data:
        clear_admin_cache()  # recent bookings on the admin dashboard show this name
    response["user"] = current_user.to_dict()
    return jsonify(response)


# ---------------------------------------------------------------------------
# Completion certificate
# ---------------------------------------------------------------------------
def _fmt(d):
    return d.strftime("%d %B %Y") if d else "—"


@user_bp.route("/bookings/<int:booking_id>/certificate", methods=["GET"])
@role_required(ROLE_USER)
def certificate(booking_id):
    booking = db.session.get(Booking, booking_id)
    if booking is None or booking.user_id != current_user.id:
        abort(404, description="Booking not found.")
    if booking.status != "Completed":
        abort(400, description="Certificates are available once the trek is completed.")

    trek = booking.trek
    if not booking.certificate_no:
        # Issued once and then kept: the booking id makes it unique (TMA-2026-000005).
        year = (trek.end_date or date.today()).year
        booking.certificate_no = f"TMA-{year}-{booking.id:06d}"
        db.session.commit()

    html = render(
        "certificate.html",
        certificate_no=booking.certificate_no,
        trekker_name=current_user.full_name,
        trek_name=trek.name,
        location=trek.location,
        start_date=_fmt(trek.start_date),
        end_date=_fmt(trek.end_date),
        difficulty=trek.difficulty,
        duration=trek.duration_days,
        leader=trek.staff.full_name if trek.staff else "TMA Team",
        issue_date=_fmt(date.today()),
    )
    try:
        pdf = html_to_pdf(html)
    except PdfError as error:
        abort(500, description=str(error))
    return send_file(BytesIO(pdf), mimetype="application/pdf", as_attachment=True,
                     download_name=f"certificate-{booking.certificate_no}.pdf")

