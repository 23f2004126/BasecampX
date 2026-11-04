"""
Editing your own account - shared by every role:
    PUT /api/profile        (admin, staff, trekker)
    PUT /api/user/profile   (trekker; kept for the trekker Profile page)
"""
from flask import jsonify
from flask_security import hash_password, verify_password

from extensions import db, security
from models import ROLE_STAFF, StaffProfile
from utils.cache import clear_admin_cache
from utils.validators import json_body, validate_profile_update, validation_error


def update_profile(user):
    is_staff = user.has_role(ROLE_STAFF)
    data, errors = validate_profile_update(json_body(), staff=is_staff)
    if not errors and "new_password" in data:
        if not verify_password(data["current_password"], user.password):
            errors["current_password"] = "Current password is incorrect."
    if errors:
        return validation_error(errors)

    for field in ("full_name", "contact_number"):
        if field in data:
            setattr(user, field, data[field])
    if is_staff and ("experience_years" in data or "specialization" in data):
        profile = user.staff_profile or StaffProfile(user=user)
        for field in ("experience_years", "specialization"):
            if field in data:
                setattr(profile, field, data[field])

    response = {"message": "Profile updated."}
    if "new_password" in data:
        user.password = hash_password(data["new_password"])
        # Log out every other device that still holds an old token...
        security.datastore.set_uniquifier(user)
        # ...and give this device a fresh one so it stays logged in.
        response["token"] = user.get_auth_token()

    db.session.commit()
    if "full_name" in data:
        clear_admin_cache()  # names appear on the admin dashboard
    response["user"] = user.to_dict()
    return jsonify(response)
