"""
Simulated payments (role: user). No real money moves; the flow mirrors a
real gateway so the rest of the app (seats, refunds, emails) behaves correctly.

POST /api/payments  {booking_id, method: UPI|Card|NetBanking, card_number (Card only)}

- Succeeds by default. A card number ending in 0000 is "declined" (for demos).
- Success: Payment(Success), booking.payment_status = Paid, notification + email.
- Failure: Payment(Failed); the booking stays Pending so the user can retry
  until the 30-minute payment window ends.
"""
import re
import time

from flask import Blueprint, abort, current_app, jsonify
from flask_security import current_user
from sqlalchemy import update

from extensions import db
from models import PAYMENT_METHODS, ROLE_USER, Booking, Payment
from tasks.tasks import send_booking_email
from utils.bookings import cancel_booking, utcnow_naive
from utils.cache import clear_admin_cache, clear_trek_cache
from utils.decorators import role_required
from utils.jobs import enqueue_quietly
from utils.notify import notify
from utils.validators import json_body, match_choice, to_int, validation_error

payment_bp = Blueprint("payment", __name__, url_prefix="/api/payments")

DECLINED_CARD_SUFFIX = "0000"


@payment_bp.route("", methods=["POST"])
@role_required(ROLE_USER)
def pay():
    data = json_body()
    errors = {}
    booking_id = to_int(data.get("booking_id"))
    if booking_id is None:
        errors["booking_id"] = "A valid booking_id is required."
    method = match_choice(data.get("method"), PAYMENT_METHODS)
    if not method:
        errors["method"] = f"Must be one of: {', '.join(PAYMENT_METHODS)}."
    card = re.sub(r"[\s-]", "", str(data.get("card_number") or ""))
    if method == "Card" and not re.fullmatch(r"\d{12,19}", card):
        errors["card_number"] = "Enter a valid card number (12-19 digits)."
    if errors:
        return validation_error(errors)

    booking = db.session.get(Booking, booking_id)
    if booking is None or booking.user_id != current_user.id:
        abort(404, description="Booking not found.")
    if booking.status != "Booked":
        abort(400, description=f"This booking is {booking.status} and can't be paid.")
    if booking.payment_status == "Paid":
        abort(409, description="This booking is already paid.")

    # Paying after the window: release the seat now instead of waiting for the job.
    if booking.payment_due_at and utcnow_naive() > booking.payment_due_at:
        cancelled, promoted = cancel_booking(booking, " because payment wasn't completed in time", only_if_unpaid=True)
        db.session.commit()
        if cancelled:
            clear_trek_cache(booking.trek_id)
            for new_booking in promoted:
                enqueue_quietly(send_booking_email, new_booking.id, "promoted")
        abort(400, description="The payment window has expired and the seat was released. Please book again.")

    # "Talking to the bank"
    time.sleep(current_app.config["PAYMENT_SIMULATION_SECONDS"])
    trek_name = booking.trek.name

    if method == "Card" and card.endswith(DECLINED_CARD_SUFFIX):
        payment = Payment(booking_id=booking.id, amount=booking.amount, method=method, status="Failed")
        db.session.add(payment)
        notify(current_user.id, "Payment failed",
               f"Your payment for {trek_name} was declined. Your seat is still held, so you can try again.",
               "payment", "/user/bookings")
        db.session.commit()
        return jsonify({
            "message": "Payment declined by the bank. Please try another card or method.",
            "payment": payment.to_dict(),
            "booking": booking.to_dict(),
        }), 402

    # Mark paid ONLY if it is still an unpaid active booking. This conditional
    # UPDATE is what makes double-clicks and the auto-cancel job safe: if the
    # booking changed meanwhile, no row matches and nothing is charged.
    result = db.session.execute(
        update(Booking)
        .where(Booking.id == booking.id, Booking.status == "Booked", Booking.payment_status == "Pending")
        .values(payment_status="Paid")
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.session.rollback()
        db.session.refresh(booking)
        if booking.payment_status == "Paid":
            abort(409, description="This booking is already paid.")
        abort(409, description="This booking was cancelled before the payment completed.")

    payment = Payment(booking_id=booking.id, amount=booking.amount, method=method, status="Success")
    db.session.add(payment)
    notify(current_user.id, "Payment successful",
           f"₹{booking.amount:,.0f} received. Your booking for {trek_name} is confirmed.",
           "payment", "/user/bookings")
    db.session.commit()
    db.session.refresh(booking)
    clear_admin_cache()  # recent bookings on the admin dashboard show payment status

    enqueue_quietly(send_booking_email, booking.id, "confirmed")
    return jsonify({
        "message": "Payment successful. Your booking is confirmed.",
        "payment": payment.to_dict(),
        "booking": booking.to_dict(),
    }), 201
