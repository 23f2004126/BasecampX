"""
Authentication API.

POST /api/register  - create a trekker account
POST /api/login     - check email + password, return an auth token
POST /api/logout    - invalidate the current user's tokens
GET  /api/me        - details of the logged-in user
GET  /api/profile   - same, for the Settings / Profile pages (any role)
PUT  /api/profile   - edit name, contact, password (+ experience/specialization for staff)
"""
from flask import Blueprint, jsonify
from flask_security import current_user, hash_password, verify_password

from extensions import db, security
from models import ROLE_USER
from utils.cache import clear_admin_cache
from utils.decorators import json_error, token_required
from utils.profile import update_profile
from utils.validators import clean_email, json_body as _json_body
from utils.validators import validate_registration, validation_error

auth_bp = Blueprint("auth", __name__, url_prefix="/api")


@auth_bp.route("/register", methods=["POST"])
def register():
    data, errors = validate_registration(_json_body())
    if errors:
        return validation_error(errors)

    datastore = security.datastore
    if datastore.find_user(email=data["email"]):
        return json_error("An account with this email already exists.", 409)

    # Public sign-up is for trekkers only. Any "role" in the request is ignored
    # on purpose, so nobody can register themselves as admin or staff.
    user = datastore.create_user(
        email=data["email"],
        password=hash_password(data["password"]),
        full_name=data["full_name"],
        contact_number=data["contact_number"],
        roles=[datastore.find_role(ROLE_USER)],
    )
    db.session.commit()
    clear_admin_cache()  # total_users changed
    return jsonify({"message": "Registration successful.", "user": user.to_dict()}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = _json_body()
    email = clean_email(data.get("email") or "")
    password = data.get("password") or ""
    if not email or not password:
        return json_error("Email and password are required.", 400)

    user = security.datastore.find_user(email=email)
    # Same message whether the email or the password is wrong, so attackers
    # can't use this endpoint to discover which emails are registered.
    if not user or not verify_password(password, user.password):
        return json_error("Invalid email or password.", 401)
    if user.is_blacklisted:
        return json_error("Your account has been blacklisted. Contact the admin.", 403)
    if not user.active:
        return json_error("Your account is inactive. Contact the admin.", 403)

    return jsonify(
        {
            "token": user.get_auth_token(),
            "role": user.primary_role,
            "id": user.id,
            "full_name": user.full_name,
        }
    ), 200


@auth_bp.route("/logout", methods=["POST"])
@token_required
def logout():
    # Tokens can't be "deleted" (they are not stored on the server). Instead we
    # change fs_uniquifier: every token signed with the old value stops working.
    security.datastore.set_uniquifier(current_user)
    db.session.commit()
    return jsonify({"message": "Logged out."}), 200


@auth_bp.route("/me", methods=["GET"])
@token_required
def me():
    return jsonify(current_user.to_dict()), 200


@auth_bp.route("/profile", methods=["GET"])
@token_required
def get_profile():
    return jsonify(current_user.to_dict()), 200


@auth_bp.route("/profile", methods=["PUT"])
@token_required
def edit_profile():
    return update_profile(current_user)
