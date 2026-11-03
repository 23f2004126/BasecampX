"""
Admin API (role: admin). Everything is under /api/admin.

Dashboard : GET  /stats, GET /reports, GET /search
Treks     : GET/POST /treks, PUT/DELETE /treks/<id>, PUT /treks/<id>/assign
Staff     : GET/POST /staff
Users     : GET /users, PUT /users/<id>/blacklist, PUT /users/<id>/whitelist
Bookings  : GET /bookings
Jobs      : GET /reports/pdf, POST /jobs/daily-reminder, POST /jobs/monthly-report
"""
import re
from datetime import date
from io import BytesIO

from flask import Blueprint, abort, jsonify, request, send_file
from flask_security import hash_password
from sqlalchemy import func, or_

from extensions import db, security
from models import (
    BOOKING_STATUSES, ROLE_ADMIN, ROLE_STAFF, ROLE_USER, TREK_DIFFICULTIES,
    TREK_STATUSES, Booking, Role, StaffProfile, Trek, User,
)
from utils.cache import cached_json, clear_admin_cache, clear_trek_cache, ttl
from tasks.tasks import daily_reminder, monthly_report, monthly_report_files, previous_month, send_staff_welcome
from utils.decorators import role_required
from utils.jobs import enqueue
from utils.pdf import PdfError
from utils.pagination import paginate
from utils.validators import (
    arg_choice, arg_int, arg_text, json_body, to_int, validate_staff,
    validate_trek, validation_error,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

SEARCH_LIMIT = 20  # max results per type for the global search


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def users_with_role(role_name):
    """Query of users that have the given role."""
    return User.query.filter(User.roles.any(Role.name == role_name))


def search_filter(query, text, *columns):
    """Case-insensitive 'contains' search across several columns."""
    if not text:
        return query
    pattern = f"%{text}%"
    return query.filter(or_(*[column.ilike(pattern) for column in columns]))


def count_bookings(trek_id, *statuses):
    return Booking.query.filter(Booking.trek_id == trek_id, Booking.status.in_(statuses)).count()


def staff_to_dict(user):
    data = user.to_dict()
    data["assigned_treks_count"] = len(user.assigned_treks)
    return data


def trekker_to_dict(user):
    data = user.to_dict()
    data["bookings_count"] = len(user.bookings)
    return data


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@admin_bp.route("/stats", methods=["GET"])
@role_required(ROLE_ADMIN)
def stats():
    def build():
        recent = Booking.query.order_by(Booking.booking_date.desc()).limit(5).all()
        return {
            "total_treks": Trek.query.count(),
            "total_users": users_with_role(ROLE_USER).count(),
            "total_staff": users_with_role(ROLE_STAFF).count(),
            "total_bookings": Booking.query.count(),
            "recent_bookings": [b.to_dict() for b in recent],
        }

    return cached_json("admin:stats", ttl("CACHE_TTL_ADMIN"), build)


# ---------------------------------------------------------------------------
# Treks
# ---------------------------------------------------------------------------
@admin_bp.route("/treks", methods=["GET"])
@role_required(ROLE_ADMIN)
def list_treks():
    query = search_filter(Trek.query, arg_text("search"), Trek.name, Trek.location)
    status = arg_choice("status", TREK_STATUSES)
    if status:
        query = query.filter(Trek.status == status)
    return jsonify(paginate(query.order_by(Trek.start_date)))


@admin_bp.route("/treks", methods=["POST"])
@role_required(ROLE_ADMIN)
def create_trek():
    data, errors = validate_trek(json_body())
    if errors:
        return validation_error(errors)

    data.setdefault("status", "Pending")
    trek = Trek(**data, available_slots=data["total_slots"])  # brand-new trek: every seat free
    db.session.add(trek)
    db.session.commit()
    clear_trek_cache(trek.id)
    return jsonify({"message": "Trek created.", "trek": trek.to_dict()}), 201


@admin_bp.route("/treks/<int:trek_id>", methods=["PUT"])
@role_required(ROLE_ADMIN)
def update_trek(trek_id):
    trek = db.get_or_404(Trek, trek_id, description="Trek not found.")
    data, errors = validate_trek(json_body(), existing=trek)
    if errors:
        return validation_error(errors)

    new_total = data.pop("total_slots", trek.total_slots)
    if new_total != trek.total_slots:
        booked = count_bookings(trek.id, "Booked")
        if new_total < booked:
            abort(409, description=f"{booked} seats are already booked; total_slots cannot be lower.")
        # Shift free seats by the same amount the capacity changed (20 -> 25 adds 5 free seats).
        trek.available_slots = max(0, trek.available_slots + (new_total - trek.total_slots))
        trek.total_slots = new_total

    for field, value in data.items():
        setattr(trek, field, value)
    db.session.commit()
    clear_trek_cache(trek.id)
    return jsonify({"message": "Trek updated.", "trek": trek.to_dict()})


@admin_bp.route("/treks/<int:trek_id>", methods=["DELETE"])
@role_required(ROLE_ADMIN)
def delete_trek(trek_id):
    trek = db.get_or_404(Trek, trek_id, description="Trek not found.")

    active = count_bookings(trek.id, "Booked")
    if active:
        abort(409, description=f"Trek has {active} active booking(s) and cannot be deleted.")
    # Bookings are permanent records (payments, refunds, history), so a trek
    # with any past bookings is kept too. Closing it hides it from trekkers.
    if trek.bookings:
        abort(409, description="Trek has booking history and cannot be deleted. Set its status to Closed instead.")

    db.session.delete(trek)
    db.session.commit()
    clear_trek_cache(trek_id)
    return jsonify({"message": "Trek deleted."})


@admin_bp.route("/treks/<int:trek_id>/assign", methods=["PUT"])
@role_required(ROLE_ADMIN)
def assign_staff(trek_id):
    trek = db.get_or_404(Trek, trek_id, description="Trek not found.")
    data = json_body()
    if "staff_id" not in data:
        return validation_error({"staff_id": "This field is required (null to unassign)."})

    if data["staff_id"] is None:  # explicit unassign
        trek.staff_id = None
    else:
        staff_id = to_int(data["staff_id"])
        if staff_id is None:
            return validation_error({"staff_id": "Must be a valid user id."})
        staff = db.get_or_404(User, staff_id, description="Staff member not found.")
        # The id must belong to a staff account, not a trekker or the admin.
        if not staff.has_role(ROLE_STAFF):
            return validation_error({"staff_id": "This user is not a staff member."})
        if staff.is_blacklisted or not staff.active:
            return validation_error({"staff_id": "This staff member is blacklisted or inactive."})
        trek.staff_id = staff.id

    db.session.commit()
    clear_trek_cache(trek.id)  # staff_name is part of the cached trek data
    return jsonify({"message": "Staff assignment updated.", "trek": trek.to_dict()})


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------
@admin_bp.route("/staff", methods=["POST"])
@role_required(ROLE_ADMIN)
def create_staff():
    data, errors = validate_staff(json_body())
    if errors:
        return validation_error(errors)

    datastore = security.datastore
    if datastore.find_user(email=data["email"]):
        abort(409, description="An account with this email already exists.")

    user = datastore.create_user(
        email=data["email"],
        password=hash_password(data["password"]),
        full_name=data["full_name"],
        contact_number=data["contact_number"],
        roles=[datastore.find_role(ROLE_STAFF)],
    )
    user.staff_profile = StaffProfile(
        experience_years=data["experience_years"], specialization=data["specialization"]
    )
    db.session.commit()
    clear_admin_cache()  # total_staff changed
    # Email the new staff member their login details (in the background).
    enqueue(send_staff_welcome, user.id, data["password"])
    return jsonify({"message": "Staff member created.", "staff": staff_to_dict(user)}), 201


@admin_bp.route("/staff", methods=["GET"])
@role_required(ROLE_ADMIN)
def list_staff():
    query = users_with_role(ROLE_STAFF).outerjoin(StaffProfile)
    query = search_filter(query, arg_text("search"), User.full_name, User.email,
                          User.contact_number, StaffProfile.specialization)
    return jsonify(paginate(query.order_by(User.full_name), staff_to_dict))


# ---------------------------------------------------------------------------
# Users (trekkers) and blacklisting
# ---------------------------------------------------------------------------
@admin_bp.route("/users", methods=["GET"])
@role_required(ROLE_ADMIN)
def list_users():
    query = search_filter(users_with_role(ROLE_USER), arg_text("search"),
                          User.full_name, User.email, User.contact_number)
    return jsonify(paginate(query.order_by(User.full_name), trekker_to_dict))


def set_blacklisted(user_id, blacklisted):
    user = db.get_or_404(User, user_id, description="User not found.")
    if user.has_role(ROLE_ADMIN):
        abort(403, description="The admin account cannot be blacklisted or whitelisted.")

    # Takes effect immediately: role_required checks is_blacklisted on EVERY
    # request, so a token the user already holds now gets a 403 on any endpoint.
    user.is_blacklisted = blacklisted
    db.session.commit()
    action = "blacklisted" if blacklisted else "whitelisted"
    return jsonify({"message": f"User {action}.", "user": user.to_dict()})


@admin_bp.route("/users/<int:user_id>/blacklist", methods=["PUT"])
@role_required(ROLE_ADMIN)
def blacklist_user(user_id):
    return set_blacklisted(user_id, True)


@admin_bp.route("/users/<int:user_id>/whitelist", methods=["PUT"])
@role_required(ROLE_ADMIN)
def whitelist_user(user_id):
    return set_blacklisted(user_id, False)


# ---------------------------------------------------------------------------
# Bookings (all of them, history included)
# ---------------------------------------------------------------------------
@admin_bp.route("/bookings", methods=["GET"])
@role_required(ROLE_ADMIN)
def list_bookings():
    query = Booking.query
    status = arg_choice("status", BOOKING_STATUSES)
    trek_id = arg_int("trek_id")
    if status:
        query = query.filter(Booking.status == status)
    if trek_id:
        query = query.filter(Booking.trek_id == trek_id)
    return jsonify(paginate(query.order_by(Booking.booking_date.desc())))


# ---------------------------------------------------------------------------
# Global search
# ---------------------------------------------------------------------------
@admin_bp.route("/search", methods=["GET"])
@role_required(ROLE_ADMIN)
def search():
    q = arg_text("q")
    if not q:
        abort(400, description="'q' (the search text) is required.")
    kind = arg_choice("type", ("users", "staff", "treks"))  # None = search everything

    results = {}
    if kind in (None, "users"):
        query = search_filter(users_with_role(ROLE_USER), q, User.full_name, User.email, User.contact_number)
        results["users"] = [trekker_to_dict(u) for u in query.limit(SEARCH_LIMIT)]
    if kind in (None, "staff"):
        query = search_filter(users_with_role(ROLE_STAFF).outerjoin(StaffProfile), q,
                              User.full_name, User.email, StaffProfile.specialization)
        results["staff"] = [staff_to_dict(u) for u in query.limit(SEARCH_LIMIT)]
    if kind in (None, "treks"):
        query = search_filter(Trek.query, q, Trek.name, Trek.location, Trek.difficulty, Trek.status)
        results["treks"] = [t.to_dict() for t in query.limit(SEARCH_LIMIT)]
    return jsonify({"query": q, "type": kind or "all", "results": results})


# ---------------------------------------------------------------------------
# Reports (chart-ready: {"labels": [...], "data": [...]})
# ---------------------------------------------------------------------------
def last_n_months(n, today=None):
    """['2026-06', ..., '2026-11'] - the current month and the n-1 before it."""
    today = today or date.today()
    year, month = today.year, today.month
    months = []
    for _ in range(n):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(months))


@admin_bp.route("/reports", methods=["GET"])
@role_required(ROLE_ADMIN)
def reports():
    return cached_json("admin:reports", ttl("CACHE_TTL_ADMIN"), build_reports)


def build_reports():
    """Chart data behind GET /api/admin/reports (runs only on a cache MISS)."""
    # Cancelled bookings don't count as "demand" in any of these charts.
    not_cancelled = Booking.status != "Cancelled"

    # 1. Top 5 treks by number of bookings
    top = (
        db.session.query(Trek.name, func.count(Booking.id))
        .join(Booking).filter(not_cancelled)
        .group_by(Trek.id).order_by(func.count(Booking.id).desc()).limit(5).all()
    )

    # 2. Bookings per month for the last 6 months (months with 0 still appear)
    months = last_n_months(6)
    per_month = dict.fromkeys(months, 0)
    for (booked_on,) in db.session.query(Booking.booking_date).filter(not_cancelled):
        key = booked_on.strftime("%Y-%m")
        if key in per_month:
            per_month[key] += 1

    # 3. Treks by status (every status listed, even if 0)
    status_counts = dict(db.session.query(Trek.status, func.count(Trek.id)).group_by(Trek.status).all())

    # 4. Difficulty preference: how many different trekkers booked each difficulty
    difficulty_counts = dict(
        db.session.query(Trek.difficulty, func.count(func.distinct(Booking.user_id)))
        .join(Booking).filter(not_cancelled).group_by(Trek.difficulty).all()
    )

    return {
        "bookings_per_trek": {"labels": [n for n, _ in top], "data": [c for _, c in top]},
        "bookings_per_month": {"labels": months, "data": list(per_month.values())},
        "treks_by_status": {"labels": list(TREK_STATUSES),
                            "data": [status_counts.get(s, 0) for s in TREK_STATUSES]},
        "users_by_difficulty": {"labels": list(TREK_DIFFICULTIES),
                                "data": [difficulty_counts.get(d, 0) for d in TREK_DIFFICULTIES]},
    }


# ---------------------------------------------------------------------------
# Monthly report PDF + manual job triggers (for demos)
# ---------------------------------------------------------------------------
MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def parse_month(value):
    """'YYYY-MM' -> (year, month); empty -> previous month; bad/future -> 400."""
    if not value:
        return previous_month()
    match = MONTH_RE.match(value.strip())
    if not match:
        abort(400, description="'month' must look like YYYY-MM, e.g. 2026-10.")
    year, month = int(match.group(1)), int(match.group(2))
    if (year, month) > (date.today().year, date.today().month):
        abort(400, description="That month hasn't happened yet.")
    return year, month


@admin_bp.route("/reports/pdf", methods=["GET"])
@role_required(ROLE_ADMIN)
def report_pdf():
    """The monthly report as a PDF download, generated on demand."""
    year, month = parse_month(request.args.get("month"))
    try:
        data, _html, pdf = monthly_report_files(year, month)
    except PdfError as error:
        abort(500, description=str(error))
    return send_file(BytesIO(pdf), mimetype="application/pdf", as_attachment=True,
                     download_name=f"tma-report-{data['month_key']}.pdf")


@admin_bp.route("/jobs/daily-reminder", methods=["POST"])
@role_required(ROLE_ADMIN)
def run_daily_reminder():
    job = enqueue(daily_reminder)
    return jsonify({"task_id": job.id, "message": "Daily reminder job started."}), 202


@admin_bp.route("/jobs/monthly-report", methods=["POST"])
@role_required(ROLE_ADMIN)
def run_monthly_report():
    year, month = parse_month(json_body().get("month"))
    job = enqueue(monthly_report, f"{year:04d}-{month:02d}")
    return jsonify({"task_id": job.id, "message": f"Monthly report for {year:04d}-{month:02d} started."}), 202
