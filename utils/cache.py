"""
Redis caching helpers (Flask-Caching).

What is cached (shared data only - never anything per user):
    tma:treks:list:<scope>:<query>   GET /api/treks          5 min
    tma:treks:detail:<id>            GET /api/treks/<id>     5 min
    tma:treks:locations:<scope>      GET /api/treks/locations 30 min
    tma:admin:stats / admin:reports  GET /api/admin/...      2 min

<scope> is "open" for trekkers (they only see Open treks) or "all" for
admin/staff, so one role never gets another role's cached list.

Two rules:
1. Redis is optional. If it is down, every helper logs a warning and the
   request is answered straight from the database (X-Cache: BYPASS).
2. After any change that affects these responses, call clear_trek_cache()
   (or clear_admin_cache()) AFTER db.session.commit().
"""
import time
from urllib.parse import urlencode

from flask import current_app, jsonify, request

from extensions import cache

_WARN_EVERY_SECONDS = 60
_last_warning = 0.0


def _warn(action, error):
    """Log Redis problems at most once a minute (not on every request)."""
    global _last_warning
    now = time.monotonic()
    if now - _last_warning > _WARN_EVERY_SECONDS:
        _last_warning = now
        current_app.logger.warning("Redis cache unavailable during %s (%s); serving without cache.", action, error)


def query_key():
    """The request's query string in a stable order: ?page=2&search=x == ?search=x&page=2."""
    return urlencode(sorted(request.args.items(multi=True)))


def get_or_compute(key, timeout, compute):
    """
    Return (data, status): data from Redis if present ("HIT"), otherwise
    compute() it and store it ("MISS"). If Redis fails: ("BYPASS").
    `data` must be JSON-serialisable (dicts/lists), never a Response.
    """
    try:
        data = cache.get(key)
    except Exception as error:  # Redis down, timeout, auth error...
        _warn("read", error)
        return compute(), "BYPASS"

    if data is not None:
        return data, "HIT"

    data = compute()
    try:
        cache.set(key, data, timeout=timeout)
    except Exception as error:
        _warn("write", error)
        return data, "BYPASS"
    return data, "MISS"


def json_with_cache_header(data, status, http_status=200):
    """JSON response + X-Cache header so caching is visible in a demo."""
    response = jsonify(data)
    response.status_code = http_status
    response.headers["X-Cache"] = status
    return response


def cached_json(key, timeout, compute):
    """Shortcut for endpoints whose whole response can be cached."""
    data, status = get_or_compute(key, timeout, compute)
    return json_with_cache_header(data, status)


def ttl(name):
    return current_app.config[name]


# ---------------------------------------------------------------------------
# Invalidation
# ---------------------------------------------------------------------------
def _delete_matching(*patterns):
    """Delete every cache key matching the given glob patterns (e.g. 'treks:list:*')."""
    try:
        backend = cache.cache
        client = getattr(backend, "_write_client", None)
        if client is None:
            # Non-Redis backend (e.g. SimpleCache in tests): just clear everything.
            cache.clear()
            return
        prefix = backend.key_prefix
        keys = [k for pattern in patterns for k in client.scan_iter(match=prefix + pattern, count=500)]
        if keys:
            client.delete(*keys)
    except Exception as error:
        # Redis is down: nothing is being served from it either, so it's safe to skip.
        _warn("invalidate", error)


def clear_admin_cache():
    """Admin dashboard numbers changed (new user/staff, bookings...)."""
    _delete_matching("admin:*")


def clear_trek_cache(trek_id=None):
    """
    Call after any change to treks or their bookings/slots.
    Lists, locations and admin stats/reports always go (a single trek's
    change can affect any page of any filtered list). Trek details: only
    this trek, or all of them if trek_id is None.
    """
    detail = f"treks:detail:{trek_id}" if trek_id is not None else "treks:detail:*"
    _delete_matching("treks:list:*", "treks:locations:*", detail, "admin:*")
