"""
Everything that changes a trek's free seats, in one place, so routes and
Celery jobs follow exactly the same rules.

Golden rules
------------
1. Seats move only through take_one_slot() / give_back_one_slot(): single
   conditional UPDATE statements, so two requests can never both take the
   last seat.
2. A freed seat goes to the waitlist (if anyone is waiting) INSIDE THE SAME
   TRANSACTION that freed it. Nobody else can grab it in between.
3. Every function here only stages changes; the caller commits once, then
   clears the trek cache and queues emails.
"""
from datetime import datetime, timezone

from sqlalchemy import update

from extensions import db
from models import Booking, Payment, Trek, User, Waitlist
from utils.notify import notify


def utcnow_naive():
    """UTC 'now' without tzinfo (SQLite stores datetimes without a timezone)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Seats
# ---------------------------------------------------------------------------
def take_one_slot(trek_id):
    """
    Atomically claim a seat:
        UPDATE trek SET available_slots = available_slots - 1
        WHERE id = :id AND status = 'Open' AND available_slots > 0
    The check and the decrement are ONE statement, so two requests can't both
    see "1 seat left" and both take it. Returns True if a seat was taken.
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


# ---------------------------------------------------------------------------
# Waitlist
# ---------------------------------------------------------------------------
def renumber_waitlist(trek_id):
    """Positions 1..n for the 'Waiting' entries, in the order people joined (id order)."""
    waiting = (
        Waitlist.query.filter_by(trek_id=trek_id, status="Waiting")
        .order_by(Waitlist.id).all()
    )
    for position, entry in enumerate(waiting, start=1):
        entry.position = position
    return waiting


def _claim_entry(entry_id, new_status):
    """
    Compare-and-set: change a waitlist entry ONLY if it is still 'Waiting'.
    If two processes try to promote the same person at once, the database
    lets exactly one UPDATE match; the other gets rowcount 0 and moves on.
    """
    result = db.session.execute(
        update(Waitlist)
        .where(Waitlist.id == entry_id, Waitlist.status == "Waiting")
        .values(status=new_status)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def promote_from_waitlist(trek_id):
    """
    Give free seats on an Open trek to the people at the front of its waitlist.
    Each promoted person gets a Booked + payment-Pending booking (same 30-minute
    payment window as a normal booking). Returns the new bookings.
    """
    db.session.flush()        # send any staged seat/status edits to the DB first...
    trek = db.session.get(Trek, trek_id)
    db.session.refresh(trek)  # ...then re-read: seats may have been changed by UPDATE statements
    if trek.status != "Open":
        return []

    promoted = []
    for entry in Waitlist.query.filter_by(trek_id=trek_id, status="Waiting").order_by(Waitlist.id).all():
        user = db.session.get(User, entry.user_id)
        has_booking = Booking.query.filter_by(user_id=entry.user_id, trek_id=trek_id, status="Booked").first()
        if not user.active or user.is_blacklisted or has_booking:
            _claim_entry(entry.id, "Left")          # can't be promoted: skip them
            continue
        if not _claim_entry(entry.id, "Promoted"):  # someone else promoted them first
            continue
        if not take_one_slot(trek_id):              # no seat left after all: put them back
            _claim_entry_back(entry.id)
            break
        booking = Booking(user_id=entry.user_id, trek_id=trek_id, status="Booked",
                          payment_status="Pending", amount=trek.price, booking_date=utcnow_naive())
        db.session.add(booking)
        notify(entry.user_id, "A spot opened up!",
               f"You've been moved off the waitlist for {trek.name}. "
               "Complete payment within 30 minutes to keep your seat.",
               "waitlist", "/user/bookings")
        promoted.append(booking)

    db.session.flush()           # give the new bookings their ids
    db.session.expire_all()      # statuses above were changed with UPDATE statements
    renumber_waitlist(trek_id)
    return promoted


def _claim_entry_back(entry_id):
    db.session.execute(
        update(Waitlist).where(Waitlist.id == entry_id, Waitlist.status == "Promoted")
        .values(status="Waiting").execution_options(synchronize_session=False)
    )


# ---------------------------------------------------------------------------
# Cancelling
# ---------------------------------------------------------------------------
def cancel_booking(booking, reason, only_if_unpaid=False):
    """
    Cancel an active booking: status, refund record, seat back, waitlist promotion.
    Uses a conditional UPDATE so a booking can only be cancelled once (and, for
    the auto-cancel job, only if it is STILL unpaid - a payment that lands at the
    same moment wins). Returns (cancelled: bool, promoted_bookings: list).
    """
    conditions = [Booking.id == booking.id, Booking.status == "Booked"]
    if only_if_unpaid:
        conditions.append(Booking.payment_status == "Pending")
    now = utcnow_naive()
    result = db.session.execute(
        update(Booking).where(*conditions)
        .values(status="Cancelled", cancelled_at=now)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        return False, []

    db.session.refresh(booking)
    trek = booking.trek
    refunded = booking.payment_status == "Paid"
    if refunded:
        booking.payment_status = "Refunded"
        last = next((p for p in reversed(booking.payments) if p.status == "Success"), None)
        db.session.add(Payment(booking_id=booking.id, amount=booking.amount,
                               method=last.method if last else "UPI", status="Refunded"))

    message = f"Your booking for {trek.name} was cancelled{reason}."
    if refunded:
        message += f" ₹{booking.amount:,.0f} will be refunded to your original payment method."
    notify(booking.user_id, "Booking cancelled", message, "booking", "/user/history")

    give_back_one_slot(trek.id)
    promoted = promote_from_waitlist(trek.id)
    return True, promoted
