"""
Waitlist for full treks.

POST   /api/treks/<id>/waitlist        (trekker) join - only when the trek is Open and full
DELETE /api/treks/<id>/waitlist        (trekker) leave
GET    /api/user/waitlist              (trekker) my entries with positions
GET    /api/staff/treks/<id>/waitlist  (assigned staff) who is waiting

Promotion (a freed seat goes to position 1) happens in utils/bookings.py,
inside the same transaction that frees the seat.
"""
from flask import Blueprint, abort, jsonify
from flask_security import current_user
from sqlalchemy.exc import IntegrityError

from extensions import db
from models import ROLE_STAFF, ROLE_USER, Booking, Trek, Waitlist
from routes.staff_routes import get_my_trek
from utils.bookings import renumber_waitlist
from utils.cache import clear_admin_cache
from utils.decorators import role_required
from utils.notify import notify

waitlist_bp = Blueprint("waitlist", __name__, url_prefix="/api")


def my_waiting_entry(trek_id):
    return Waitlist.query.filter_by(trek_id=trek_id, user_id=current_user.id, status="Waiting").first()


@waitlist_bp.route("/treks/<int:trek_id>/waitlist", methods=["POST"])
@role_required(ROLE_USER)
def join(trek_id):
    trek = db.get_or_404(Trek, trek_id, description="Trek not found.")
    if trek.status != "Open":
        abort(400, description=f"This trek is {trek.status}; its waitlist isn't open.")
    if trek.available_slots > 0:
        abort(409, description="Seats are still available, so you can book directly.")
    if Booking.query.filter_by(trek_id=trek.id, user_id=current_user.id, status="Booked").first():
        abort(409, description="You already have a booking for this trek.")
    if my_waiting_entry(trek.id):
        abort(409, description="You're already on the waitlist for this trek.")

    entry = Waitlist(trek_id=trek.id, user_id=current_user.id)
    db.session.add(entry)
    try:
        db.session.flush()           # the partial unique index catches a double-click here
    except IntegrityError:
        db.session.rollback()
        abort(409, description="You're already on the waitlist for this trek.")
    renumber_waitlist(trek.id)       # positions = join order among people still waiting
    notify(current_user.id, "Joined the waitlist",
           f"You're number {entry.position} on the waitlist for {trek.name}. "
           "We'll hold a seat for you as soon as one frees up.", "waitlist", "/user/bookings")
    db.session.commit()
    clear_admin_cache()  # waitlist demand chart
    return jsonify({"message": f"You're number {entry.position} on the waitlist.", "entry": entry.to_dict()}), 201


@waitlist_bp.route("/treks/<int:trek_id>/waitlist", methods=["DELETE"])
@role_required(ROLE_USER)
def leave(trek_id):
    entry = my_waiting_entry(trek_id)
    if entry is None:
        abort(404, description="You're not on the waitlist for this trek.")
    entry.status = "Left"
    db.session.flush()
    renumber_waitlist(trek_id)       # everyone behind moves up one place
    db.session.commit()
    clear_admin_cache()
    return jsonify({"message": "You've left the waitlist.", "entry": entry.to_dict()})


@waitlist_bp.route("/user/waitlist", methods=["GET"])
@role_required(ROLE_USER)
def my_waitlist():
    entries = (
        Waitlist.query.filter_by(user_id=current_user.id)
        .order_by((Waitlist.status == "Waiting").desc(), Waitlist.created_at.desc()).all()
    )
    return jsonify({"items": [e.to_dict() for e in entries]})


@waitlist_bp.route("/staff/treks/<int:trek_id>/waitlist", methods=["GET"])
@role_required(ROLE_STAFF)
def staff_waitlist(trek_id):
    trek = get_my_trek(trek_id)  # 403 unless this staff member leads the trek
    entries = Waitlist.query.filter_by(trek_id=trek.id, status="Waiting").order_by(Waitlist.position).all()
    return jsonify({"trek_id": trek.id, "trek_name": trek.name, "items": [e.to_dict() for e in entries]})
