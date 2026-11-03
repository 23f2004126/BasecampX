"""
Input validation helpers.

Body validators return (cleaned_data, errors). If errors is non-empty the
route responds with validation_error(errors) -> 400:
    {"message": "Validation failed.", "errors": {"field": "what is wrong"}}

Query-string helpers (arg_int, arg_choice, arg_text) abort with a 400
{"message": ...} straight away, because a bad URL parameter is a single problem.
"""
import re
from datetime import date

from email_validator import EmailNotValidError, validate_email
from flask import abort, jsonify, request

from models import TREK_DIFFICULTIES, TREK_STATUSES

PHONE_RE = re.compile(r"^\+?\d{10,15}$")
MIN_PASSWORD_LENGTH = 6
REQUIRED = "This field is required."


# ---------------------------------------------------------------------------
# Small building blocks
# ---------------------------------------------------------------------------
def json_body():
    """Request body as a dict ({} if it is missing or not a JSON object)."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def validation_error(errors):
    return jsonify({"message": "Validation failed.", "errors": errors}), 400


def _text(data, key):
    """Read a field as a stripped string ('' if missing or not a string)."""
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


def to_int(value, minimum=1):
    """Whole number >= minimum, or None. Rejects booleans and 2.5-style floats."""
    if isinstance(value, bool) or (isinstance(value, float) and not value.is_integer()):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= minimum else None


def to_number(value, minimum=0):
    """Any number (int or float) >= minimum, or None."""
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= minimum else None


def parse_date(value):
    """'YYYY-MM-DD' -> date, or None if the format is wrong."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def match_choice(value, choices):
    """Case-insensitive match: 'open' -> 'Open'. None if not an allowed value."""
    if not isinstance(value, str):
        return None
    for choice in choices:
        if choice.lower() == value.strip().lower():
            return choice
    return None


def clean_email(raw):
    """Return a normalised (lower-case) email, or None if it is invalid."""
    try:
        # check_deliverability=False: don't do DNS lookups for the domain.
        return validate_email(raw, check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        return None


# ---------------------------------------------------------------------------
# Query-string helpers (?page=2&status=Open ...)
# ---------------------------------------------------------------------------
def arg_text(name):
    return (request.args.get(name) or "").strip()


def arg_int(name, minimum=1, default=None):
    raw = arg_text(name)
    if not raw:
        return default
    number = to_int(raw, minimum)
    if number is None:
        abort(400, description=f"'{name}' must be a whole number >= {minimum}.")
    return number


def arg_choice(name, choices):
    raw = arg_text(name)
    if not raw:
        return None
    choice = match_choice(raw, choices)
    if choice is None:
        abort(400, description=f"'{name}' must be one of: {', '.join(choices)}.")
    return choice


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
def validate_registration(data):
    errors = {}

    email = clean_email(_text(data, "email"))
    if not email:
        errors["email"] = "A valid email is required."

    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if len(password) < MIN_PASSWORD_LENGTH:
        errors["password"] = f"Password must be at least {MIN_PASSWORD_LENGTH} characters."

    full_name = _text(data, "full_name")
    if len(full_name) < 2:
        errors["full_name"] = "Full name is required."

    contact_number = _text(data, "contact_number").replace(" ", "")
    if not PHONE_RE.match(contact_number):
        errors["contact_number"] = "Contact number must be 10-15 digits."

    cleaned = {
        "email": email,
        "password": password,
        "full_name": full_name,
        "contact_number": contact_number,
    }
    return cleaned, errors


def validate_staff(data):
    """Same checks as registration, plus the StaffProfile fields."""
    cleaned, errors = validate_registration(data)

    raw_exp = data.get("experience_years", 0)
    experience = to_int(raw_exp, minimum=0)
    if experience is None:
        errors["experience_years"] = "Experience must be a whole number >= 0."
    cleaned["experience_years"] = experience
    cleaned["specialization"] = _text(data, "specialization") or None
    return cleaned, errors


def validate_profile_update(data):
    """Only the fields that were sent are validated and returned."""
    cleaned, errors = {}, {}

    if "full_name" in data:
        full_name = _text(data, "full_name")
        if len(full_name) < 2:
            errors["full_name"] = "Full name must be at least 2 characters."
        cleaned["full_name"] = full_name

    if "contact_number" in data:
        contact = _text(data, "contact_number").replace(" ", "")
        if not PHONE_RE.match(contact):
            errors["contact_number"] = "Contact number must be 10-15 digits."
        cleaned["contact_number"] = contact

    if "new_password" in data:
        new_password = data.get("new_password")
        if not isinstance(new_password, str) or len(new_password) < MIN_PASSWORD_LENGTH:
            errors["new_password"] = f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        if not isinstance(data.get("current_password"), str) or not data["current_password"]:
            errors["current_password"] = "Your current password is required to set a new one."
        cleaned["new_password"] = new_password
        cleaned["current_password"] = data.get("current_password")

    if not cleaned and not errors:
        errors["body"] = "Send at least one of: full_name, contact_number, new_password."
    return cleaned, errors


# ---------------------------------------------------------------------------
# Treks
# ---------------------------------------------------------------------------
TREK_REQUIRED = (
    "name", "location", "difficulty", "duration_days",
    "total_slots", "price", "start_date", "end_date",
)


def validate_trek(data, existing=None):
    """
    Create (existing=None): all TREK_REQUIRED fields must be present.
    Update (existing=Trek): only the fields sent are checked, but the date
    rule is checked against the merged result (new value or current value).
    """
    cleaned, errors = {}, {}
    sent = lambda key: key in data  # noqa: E731

    if existing is None:
        for key in TREK_REQUIRED:
            if data.get(key) in (None, ""):
                errors[key] = REQUIRED

    for key in ("name", "location"):
        if sent(key) and key not in errors:
            value = _text(data, key)
            if value:
                cleaned[key] = value
            else:
                errors[key] = REQUIRED

    for key in ("description", "instructions", "image_url"):
        if sent(key):
            cleaned[key] = _text(data, key) or None

    if sent("difficulty") and "difficulty" not in errors:
        value = match_choice(data["difficulty"], TREK_DIFFICULTIES)
        if value:
            cleaned["difficulty"] = value
        else:
            errors["difficulty"] = f"Must be one of: {', '.join(TREK_DIFFICULTIES)}."

    if sent("status"):
        value = match_choice(data["status"], TREK_STATUSES)
        if value:
            cleaned["status"] = value
        else:
            errors["status"] = f"Must be one of: {', '.join(TREK_STATUSES)}."

    for key in ("duration_days", "total_slots"):
        if sent(key) and key not in errors:
            value = to_int(data[key], minimum=1)
            if value is None:
                errors[key] = "Must be a positive whole number."
            else:
                cleaned[key] = value

    if sent("price") and "price" not in errors:
        value = to_number(data["price"], minimum=0)
        if value is None:
            errors["price"] = "Must be a number >= 0."
        else:
            cleaned["price"] = value

    for key in ("start_date", "end_date"):
        if sent(key) and key not in errors:
            value = parse_date(data[key])
            if value is None:
                errors[key] = "Use the format YYYY-MM-DD."
            else:
                cleaned[key] = value

    # Cross-field rule, using the merged values on update.
    start = cleaned.get("start_date", existing.start_date if existing else None)
    end = cleaned.get("end_date", existing.end_date if existing else None)
    if start and end and not start < end and "end_date" not in errors:
        errors["end_date"] = "End date must be after the start date."

    return cleaned, errors
