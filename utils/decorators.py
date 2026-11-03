"""
Access-control helpers for API routes.

    @role_required("admin")            -> only admins
    @role_required("admin", "staff")   -> admins OR staff
    @token_required                    -> any logged-in (non-blacklisted) user

All failures are JSON responses, never HTML redirects.
"""
from functools import wraps

from flask import jsonify
from flask_security import auth_required, current_user, roles_accepted


def json_error(message, status):
    """Standard JSON error body used across the whole API."""
    return jsonify({"error": message}), status


def role_required(*roles):
    """
    Built from Flask-Security's own decorators, applied in this order:
      1. auth_required("token")  - a valid Authentication-Token header (else 401)
      2. blacklist check         - our own rule, since Flask-Security has no such field (403)
      3. roles_accepted(*roles)  - the user has at least one of the roles (else 403)
    The 401/403 bodies from Flask-Security are made JSON by the handlers
    registered in app.py.
    """

    def decorator(fn):
        protected = roles_accepted(*roles)(fn) if roles else fn

        @wraps(fn)
        def check_blacklist(*args, **kwargs):
            if current_user.is_blacklisted:
                return json_error("Your account has been blacklisted.", 403)
            return protected(*args, **kwargs)

        return auth_required("token")(check_blacklist)

    return decorator


def token_required(fn):
    """Any authenticated user, whatever their role."""
    return role_required()(fn)
