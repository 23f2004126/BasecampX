"""
Staff API (role: staff). Everything is under /api/staff.

A staff member can only see and change treks where trek.staff_id is their
own user id. get_my_trek() enforces this for every endpoint that takes a
trek id; the list endpoints filter by staff_id in the query itself.

Status changes allowed for staff:
    Approved / Open / Closed  ->  Open or Closed   (PUT /treks/<id>)
    Open / Closed             ->  Ongoing          (PUT /treks/<id>/start)
    Ongoing                   ->  Completed        (PUT /treks/<id>/complete)
"""
from flask import Blueprint, abort, jsonify
from flask_security import current_user

from sqlalchemy import or_

from extensions import db
from models import ROLE_STAFF, TREK_STATUSES, Booking, Trek, Waitlist
from tasks.tasks import send_booking_email
from utils.bookings import promote_from_waitlist
from utils.cache import clear_trek_cache
from utils.decorators import role_required
from utils.jobs import enqueue_quietly
from utils.notify import notify_many
from utils.pagination import paginate
from utils.validators import arg_choice, arg_text, json_body, match_choice, to_int, validation_error

staff_bp = Blueprint("staff", __name__, url_prefix="/api/staff")

# Bookings that mean "this person is coming / came" (cancelled ones are not participants)
PARTICIPANT_STATUSES = ("Booked", "Completed")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_my_trek(trek_id):
    """Load a trek, but only if the logged-in staff member is assigned to it."""
    trek = db.get_or_404(Trek, trek_id, description="Trek not found.")
    if trek.staff_id != current_user.id:
        abort(403, description="You are not the assigned staff member for this trek.")
    return trek


def participants_query(trek_id):
    return Booking.query.filter(
        Booking.trek_id == trek_id, Booking.status.in_(PARTICIPANT_STATUSES)
    )


def trek_with_count(trek):
    data = trek.to_dict()
    data["participant_count"] = participants_query(trek.id).count()
    return data


def participant_to_dict(booking):
    user = booking.user
    return {
        "booking_id": booking.id,
        "booking_status": booking.status,
        "payment_status": booking.payment_status,
        "booking_date": booking.booking_date.isoformat(),
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "contact_number": user.contact_number,
    }


def require_status(trek, allowed, action):
    if trek.status not in allowed:
        abort(400, description=f"Cannot {action} a trek that is {trek.status} "
                               f"(must be {' or '.join(allowed)}).")


def booked_user_ids(trek_id):
    return [b.user_id for b in Booking.query.filter_by(trek_id=trek_id, status="Booked")]


def tell_booked_trekkers(trek, message):
    notify_many(booked_user_ids(trek.id), f"{trek.name}: trek update", message, "trek", "/user/bookings")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@staff_bp.route("/dashboard", methods=["GET"])
@role_required(ROLE_STAFF)
def dashboard():
    treks = Trek.query.filter_by(staff_id=current_user.id).all()
    trek_ids = [t.id for t in treks]
    total_participants = (
        Booking.query.filter(Booking.trek_id.in_(trek_ids),
                             Booking.status.in_(PARTICIPANT_STATUSES)).count()
        if trek_ids else 0
    )
    ongoing = [trek_with_count(t) for t in treks if t.status == "Ongoing"]
    return jsonify({
        "assigned_treks_count": len(treks),
        "total_participants": total_participants,
        "ongoing_treks_count": len(ongoing),
        "ongoing_treks": ongoing,
    })


@staff_bp.route("/treks", methods=["GET"])
@role_required(ROLE_STAFF)
def my_treks():
    """My assigned treks. Optional ?search= (name/location) and ?status=."""
    query = Trek.query.filter_by(staff_id=current_user.id)
    search = arg_text("search")
    if search:
        query = query.filter(or_(Trek.name.ilike(f"%{search}%"), Trek.location.ilike(f"%{search}%")))
    status = arg_choice("status", TREK_STATUSES)
    if status:
        query = query.filter(Trek.status == status)
    return jsonify(paginate(query.order_by(Trek.start_date), trek_with_count))


@staff_bp.route("/treks/<int:trek_id>", methods=["GET"])
@role_required(ROLE_STAFF)
def trek_details(trek_id):
    trek = get_my_trek(trek_id)
    bookings = participants_query(trek.id).order_by(Booking.booking_date).all()
    data = trek.to_dict()
    data["participant_count"] = len(bookings)
    data["participants"] = [participant_to_dict(b) for b in bookings]
    return jsonify(data)


@staff_bp.route("/treks/<int:trek_id>", methods=["PUT"])
@role_required(ROLE_STAFF)
def update_trek(trek_id):
    trek = get_my_trek(trek_id)
    body = json_body()
    if "available_slots" not in body and "status" not in body:
        return validation_error({"body": "Send available_slots and/or status."})

    errors = {}
    if "status" in body:
        status = match_choice(body["status"], ("Open", "Closed"))
        if not status:
            errors["status"] = "Staff can only set status to Open or Closed."
        else:
            # Admin must approve first; Ongoing/Completed treks can't be reopened.
            require_status(trek, ("Approved", "Open", "Closed"), "open or close")

    if "available_slots" in body:
        slots = to_int(body["available_slots"], minimum=0)
        # Free seats can never be more than capacity minus seats already booked.
        max_free = trek.total_slots - participants_query(trek.id).filter(Booking.status == "Booked").count()
        if slots is None or slots > max_free:
            errors["available_slots"] = f"Must be a whole number between 0 and {max_free}."

    if errors:
        return validation_error(errors)

    if "status" in body and status != trek.status:
        trek.status = status
        tell_booked_trekkers(trek, f"{trek.name} is now {status}.")
    if "available_slots" in body:
        trek.available_slots = slots
    # More free seats (or reopened): offer them to the waitlist in the same transaction.
    promoted = promote_from_waitlist(trek.id)
    db.session.commit()
    clear_trek_cache(trek.id)
    for booking in promoted:
        enqueue_quietly(send_booking_email, booking.id, "promoted")
    return jsonify({"message": "Trek updated.", "trek": trek_with_count(trek),
                    "promoted_from_waitlist": len(promoted)})


@staff_bp.route("/treks/<int:trek_id>/start", methods=["PUT"])
@role_required(ROLE_STAFF)
def start_trek(trek_id):
    trek = get_my_trek(trek_id)
    require_status(trek, ("Open", "Closed"), "start")
    trek.status = "Ongoing"
    tell_booked_trekkers(trek, f"{trek.name} has started. Have a great trek!")
    # The trek has left: nobody on the waitlist can get a seat any more.
    waiting = Waitlist.query.filter_by(trek_id=trek.id, status="Waiting").all()
    for entry in waiting:
        entry.status = "Left"
    notify_many([w.user_id for w in waiting], "Waitlist closed",
                f"{trek.name} has started, so its waitlist is closed.", "waitlist", "/user/treks")
    db.session.commit()
    clear_trek_cache(trek.id)
    return jsonify({"message": "Trek started.", "trek": trek_with_count(trek)})


@staff_bp.route("/treks/<int:trek_id>/complete", methods=["PUT"])
@role_required(ROLE_STAFF)
def complete_trek(trek_id):
    trek = get_my_trek(trek_id)
    require_status(trek, ("Ongoing",), "complete")

    trek.status = "Completed"
    finishers = booked_user_ids(trek.id)
    # Everyone still "Booked" actually went on the trek -> their booking is now history.
    completed = (
        Booking.query.filter_by(trek_id=trek.id, status="Booked")
        .update({"status": "Completed"}, synchronize_session=False)
    )
    notify_many(finishers, f"You completed {trek.name}!",
                "Rate your trek and download your completion certificate from History.",
                "trek", "/user/history")
    db.session.commit()  # trek status + all bookings + notifications saved together
    clear_trek_cache(trek.id)
    return jsonify({
        "message": "Trek completed.",
        "bookings_completed": completed,
        "trek": trek_with_count(trek),
    })
