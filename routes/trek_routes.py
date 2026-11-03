"""
Trek browsing API (any logged-in role). Everything is under /api/treks.

Trekkers (role "user") only ever see Open treks - plus, for the details
page, treks they have a booking on (so their history links still work).
Admin and staff see every trek and may filter by ?status=.

Caching (utils/cache.py): list 5 min, details 5 min, locations 30 min.
Cache keys include the visibility scope ("open" for trekkers, "all" for
admin/staff) and, for lists, every query parameter.
"""
from flask import Blueprint, abort
from flask_security import current_user
from sqlalchemy import func, or_

from extensions import db
from models import ROLE_USER, TREK_DIFFICULTIES, TREK_STATUSES, Booking, Trek
from utils.cache import cached_json, get_or_compute, json_with_cache_header, query_key, ttl
from utils.decorators import token_required
from utils.pagination import paginate
from utils.validators import arg_choice, arg_int, arg_text

trek_bp = Blueprint("trek", __name__, url_prefix="/api/treks")


def is_trekker():
    return current_user.primary_role == ROLE_USER


def scope():
    """Part of every cache key: what this kind of user is allowed to see."""
    return "open" if is_trekker() else "all"


def visible_treks():
    """Base query respecting who is asking."""
    if is_trekker():
        return Trek.query.filter(Trek.status == "Open")
    return Trek.query


@trek_bp.route("", methods=["GET"])
@token_required
def list_treks():
    key = f"treks:list:{scope()}:{query_key()}"
    return cached_json(key, ttl("CACHE_TTL_TREKS"), build_trek_list)


def build_trek_list():
    """The real work behind GET /api/treks (runs only on a cache MISS)."""
    query = visible_treks()

    search = arg_text("search")
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(Trek.name.ilike(pattern), Trek.location.ilike(pattern),
                                 Trek.description.ilike(pattern)))

    difficulty = arg_choice("difficulty", TREK_DIFFICULTIES)
    if difficulty:
        query = query.filter(Trek.difficulty == difficulty)

    location = arg_text("location")
    if location:  # exact match, comes from the /locations dropdown
        query = query.filter(func.lower(Trek.location) == location.lower())

    min_days, max_days = arg_int("min_days"), arg_int("max_days")
    if min_days and max_days and min_days > max_days:
        abort(400, description="'min_days' cannot be greater than 'max_days'.")
    if min_days:
        query = query.filter(Trek.duration_days >= min_days)
    if max_days:
        query = query.filter(Trek.duration_days <= max_days)

    if not is_trekker():
        status = arg_choice("status", TREK_STATUSES)
        if status:
            query = query.filter(Trek.status == status)

    return paginate(query.order_by(Trek.start_date))


@trek_bp.route("/locations", methods=["GET"])
@token_required
def locations():
    def build():
        rows = visible_treks().with_entities(Trek.location).distinct().order_by(Trek.location)
        return {"locations": [location for (location,) in rows]}

    return cached_json(f"treks:locations:{scope()}", ttl("CACHE_TTL_LOCATIONS"), build)


@trek_bp.route("/<int:trek_id>", methods=["GET"])
@token_required
def trek_details(trek_id):
    # Only the trek's own data is cached (same for everyone). A missing trek
    # raises 404 inside the lambda, so "not found" is never cached.
    data, status = get_or_compute(
        f"treks:detail:{trek_id}",
        ttl("CACHE_TTL_TREKS"),
        lambda: db.get_or_404(Trek, trek_id, description="Trek not found.").to_dict(),
    )
    # Who-is-asking check runs on every request, never from the cache.
    if is_trekker() and data["status"] != "Open":
        has_booking = Booking.query.filter_by(trek_id=trek_id, user_id=current_user.id).first()
        if not has_booking:
            # 404 rather than 403: don't reveal unpublished treks to trekkers.
            abort(404, description="Trek not found.")
    return json_with_cache_header(data, status)
