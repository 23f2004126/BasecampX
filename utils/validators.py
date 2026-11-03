"""
Input validation helpers. Each returns (cleaned_data, errors).
If errors is non-empty, the route responds with 400 and the errors dict.
"""
import re

from email_validator import EmailNotValidError, validate_email

PHONE_RE = re.compile(r"^\+?\d{10,15}$")
MIN_PASSWORD_LENGTH = 6


def _text(data, key):
    """Read a field as a stripped string ('' if missing or not a string)."""
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


def clean_email(raw):
    """Return a normalised (lower-case) email, or None if it is invalid."""
    try:
        # check_deliverability=False: don't do DNS lookups for the domain.
        return validate_email(raw, check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        return None


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
