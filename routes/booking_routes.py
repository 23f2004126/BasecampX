"""
Booking API (role: user / trekker). Everything is under /api/bookings.

POST /api/bookings              - hold a seat on a trek (pay within 30 minutes: POST /api/payments)
PUT  /api/bookings/<id>/cancel  - cancel your own booking before the trek starts

Bookings are never deleted: cancelling only changes the status, so the
admin keeps a full history of payments, refunds and demand.
Seat changes live in utils/bookings.py (shared with the Celery jobs).
"""
from datetime import date

from flask import Blueprint, abort, jsonify
from flask_security import current_user
from sqlalchemy.exc import IntegrityError

from extensions import db
from models import PAYMENT_WINDOW_MINUTES, ROLE_USER, Booking, Trek
from tasks.tasks import send_booking_email
from utils.bookings import cancel_booking, take_one_slot
from utils.cache import clear_trek_cache
from utils.decorators import role_required
from utils.jobs import enqueue_quietly
from utils.notify import notify
from utils.validators import json_body, to_int, validation_error

booking_bp = Blueprint("booking", __name__, url_prefix="/api/bookings")


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
        abort(409, description="Sorry, this trek is fully booked. You can join the waitlist.")

    booking = Booking(user_id=current_user.id, trek_id=trek.id, status="Booked",
                      payment_status="Pending", amount=trek.price)
    db.session.add(booking)
    notify(current_user.id, "Seat held",
           f"Your seat on {trek.name} is held. Complete payment within "
           f"{PAYMENT_WINDOW_MINUTES} minutes to confirm it.", "booking", "/user/bookings")
    try:
        # Seat decrement + booking + notification are committed together.
        db.session.commit()
    except IntegrityError:
        # The partial unique index caught a simultaneous duplicate booking.
        # Rolling back also undoes the seat we just took.
        db.session.rollback()
        abort(409, description="You already have an active booking for this trek.")

    clear_trek_cache(trek.id)  # slots changed
    db.session.refresh(trek)
    return jsonify({
        "message": f"Seat held. Complete payment within {PAYMENT_WINDOW_MINUTES} minutes to confirm your booking.",
        "booking": booking.to_dict(),
        "available_slots": trek.available_slots,
    }), 201


@booking_bp.route("/<int:booking_id>/cancel", methods=["PUT"])
@role_required(ROLE_USER)
def cancel(booking_id):
    booking = db.session.get(Booking, booking_id)
    # Someone else's booking looks exactly like a missing one (don't leak ids).
    if booking is None or booking.user_id != current_user.id:
        abort(404, description="Booking not found.")
    if booking.status != "Booked":
        abort(400, description=f"Only active bookings can be cancelled (this one is {booking.status}).")

    trek = booking.trek
    if trek.status in ("Ongoing", "Completed") or (trek.start_date and trek.start_date <= date.today()):
        abort(400, description="This trek has already started and can no longer be cancelled.")

    # Status, refund record, seat back and waitlist promotion: one transaction.
    cancelled, promoted = cancel_booking(booking, reason="")
    if not cancelled:
        db.session.rollback()
        abort(409, description="This booking was already cancelled.")
    db.session.commit()
    clear_trek_cache(trek.id)

    enqueue_quietly(send_booking_email, booking.id, "cancelled")
    for new_booking in promoted:
        enqueue_quietly(send_booking_email, new_booking.id, "promoted")

    db.session.refresh(trek)
    return jsonify({
        "message": "Booking cancelled." + (" Your refund has been issued." if booking.payment_status == "Refunded" else ""),
        "booking": booking.to_dict(),
        "available_slots": trek.available_slots,
    })
