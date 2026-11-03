"""
Booking API (role: user / trekker). Everything is under /api/bookings.

POST /api/bookings              - book a seat on a trek
PUT  /api/bookings/<id>/cancel  - cancel your own booking before the trek starts

Bookings are never deleted: cancelling only changes the status, so the
admin keeps a full history of payments, refunds and demand.
"""
from datetime import date, datetime, timezone

from flask import Blueprint, abort, jsonify
from flask_security import current_user
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from extensions import db
from models import ROLE_USER, Booking, Trek
from utils.decorators import role_required
from utils.validators import json_body, to_int, validation_error

booking_bp = Blueprint("booking", __name__, url_prefix="/api/bookings")


def take_one_slot(trek_id):
    """
    Atomically claim a seat:
        UPDATE trek SET available_slots = available_slots - 1
        WHERE id = :id AND status = 'Open' AND available_slots > 0
    The check and the decrement are ONE statement, so two requests can't both
    see "1 seat left" and both take it. The database runs the two UPDATEs one
    after the other; the second finds available_slots = 0, matches no row and
    rowcount is 0. Returns True if a seat was taken.
    """
    result = db.session.execute(
        update(Trek)
        .where(Trek.id == trek_id, Trek.status == "Open", Trek.available_slots > 0)
        .values(available_slots=Trek.available_slots - 1)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def give_back_one_slot(trek_id):
    """Atomic +1, never going above total_slots."""
    db.session.execute(
        update(Trek)
        .where(Trek.id == trek_id, Trek.available_slots < Trek.total_slots)
        .values(available_slots=Trek.available_slots + 1)
        .execution_options(synchronize_session=False)
    )


@booking_bp.route("", methods=["POST"])
@role_required(ROLE_USER)
def create_booking():
    trek_id = to_int(json_body().get("trek_id"))
    if trek_id is None:
        return validation_error({"trek_id": "A valid trek_id is required."})

    # 1. The trek must exist
    trek = db.get_or_404(Trek, trek_id, description="Trek not found.")

    # 2. It must be open for booking
    if trek.status != "Open":
        abort(400, description=f"This trek is {trek.status} and not open for booking.")

    # 3. Blacklisted users can't book. (role_required already rejects them before
    #    this function runs; kept here so the rule is visible next to the others.)
    if current_user.is_blacklisted:
        abort(403, description="Your account has been blacklisted.")

    # 4. No second active booking on the same trek (re-booking after cancelling is fine)
    already = Booking.query.filter_by(user_id=current_user.id, trek_id=trek.id, status="Booked").first()
    if already:
        abort(409, description="You already have an active booking for this trek.")

    # 5. Claim a seat atomically - this is the real overbooking guard
    if not take_one_slot(trek.id):
        db.session.rollback()
        abort(409, description="Sorry, this trek is fully booked.")

    booking = Booking(
        user_id=current_user.id,
        trek_id=trek.id,
        status="Booked",
        payment_status="Pending",
        amount=trek.price,
    )
    db.session.add(booking)
    try:
        # Seat decrement + new booking are committed together: both or neither.
        db.session.commit()
    except IntegrityError:
        # The partial unique index caught a simultaneous duplicate booking.
        # Rolling back also undoes the seat we just took.
        db.session.rollback()
        abort(409, description="You already have an active booking for this trek.")

    db.session.refresh(trek)
    return jsonify({
        "message": "Booking confirmed.",
        "booking": booking.to_dict(),
        "available_slots": trek.available_slots,
    }), 201


@booking_bp.route("/<int:booking_id>/cancel", methods=["PUT"])
@role_required(ROLE_USER)
def cancel_booking(booking_id):
    booking = db.session.get(Booking, booking_id)
    # Someone else's booking looks exactly like a missing one (don't leak ids).
    if booking is None or booking.user_id != current_user.id:
        abort(404, description="Booking not found.")
    if booking.status != "Booked":
        abort(400, description=f"Only active bookings can be cancelled (this one is {booking.status}).")

    trek = booking.trek
    if trek.status in ("Ongoing", "Completed") or (trek.start_date and trek.start_date <= date.today()):
        abort(400, description="This trek has already started and can no longer be cancelled.")

    booking.status = "Cancelled"
    booking.cancelled_at = datetime.now(timezone.utc)
    if booking.payment_status == "Paid":
        booking.payment_status = "Refunded"
    give_back_one_slot(trek.id)
    db.session.commit()  # status change + seat returned in one transaction

    db.session.refresh(trek)
    return jsonify({
        "message": "Booking cancelled.",
        "booking": booking.to_dict(),
        "available_slots": trek.available_slots,
    })
