"""
Database models for the Trek Management App (TMA).

Tables
------
role, user, roles_users   -> accounts and permissions (used by Flask-Security)
staff_profile             -> extra details for staff users (one-to-one with user)
trek                      -> treks that trekkers can book
booking                   -> a trekker's booking for a trek

Every model has a to_dict() method so routes can return it as JSON.
Secrets (password hash, fs_uniquifier) are NEVER included in to_dict().
"""
from datetime import datetime, timezone

from flask_security import RoleMixin, UserMixin

from extensions import db


def utcnow():
    """Current time in UTC (used as the default for created_at columns)."""
    return datetime.now(timezone.utc)


def iso(value):
    """Turn a date/datetime into an ISO string for JSON (or None)."""
    return value.isoformat() if value else None


# ---------------------------------------------------------------------------
# Allowed values for the "enum-like" string columns.
# Kept as constants so routes and validators can reuse them.
# ---------------------------------------------------------------------------
ROLE_ADMIN, ROLE_STAFF, ROLE_USER = "admin", "staff", "user"

TREK_DIFFICULTIES = ("Easy", "Moderate", "Hard")
TREK_STATUSES = ("Pending", "Approved", "Open", "Closed", "Completed")
BOOKING_STATUSES = ("Booked", "Cancelled", "Completed")
PAYMENT_STATUSES = ("Pending", "Paid", "Refunded")


def _in_list(column, values):
    """Build a CHECK constraint so the database itself rejects invalid values."""
    allowed = ", ".join(f"'{v}'" for v in values)
    return db.CheckConstraint(f"{column} IN ({allowed})", name=f"ck_{column}_valid")


# ---------------------------------------------------------------------------
# Many-to-many: a user can have many roles, a role can belong to many users.
# The composite primary key stops the same role being given twice.
# ---------------------------------------------------------------------------
roles_users = db.Table(
    "roles_users",
    db.Column("user_id", db.Integer, db.ForeignKey("user.id"), primary_key=True),
    db.Column("role_id", db.Integer, db.ForeignKey("role.id"), primary_key=True),
)


class Role(db.Model, RoleMixin):
    __tablename__ = "role"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(255))

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description}


class User(db.Model, UserMixin):
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)  # bcrypt hash, never plain text
    # Random value that is baked into every auth token. Changing it invalidates
    # all of this user's tokens (used for logout and blacklisting).
    fs_uniquifier = db.Column(db.String(64), unique=True, nullable=False)
    full_name = db.Column(db.String(120))
    contact_number = db.Column(db.String(20))
    active = db.Column(db.Boolean, default=True, nullable=False)
    is_blacklisted = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    roles = db.relationship("Role", secondary=roles_users, backref="users")

    # One-to-one: only staff users have a profile. Deleted together with the user.
    staff_profile = db.relationship(
        "StaffProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    # Treks this user leads as staff (Trek.staff_id points here).
    assigned_treks = db.relationship("Trek", back_populates="staff")
    # Bookings this user made as a trekker.
    bookings = db.relationship("Booking", back_populates="user")

    @property
    def primary_role(self):
        """The single role shown in the UI (a user normally has exactly one)."""
        for name in (ROLE_ADMIN, ROLE_STAFF, ROLE_USER):
            if self.has_role(name):
                return name
        return None

    def to_dict(self):
        data = {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "contact_number": self.contact_number,
            "active": self.active,
            "is_blacklisted": self.is_blacklisted,
            "role": self.primary_role,
            "roles": [r.name for r in self.roles],
            "created_at": iso(self.created_at),
        }
        if self.staff_profile:
            data["staff_profile"] = self.staff_profile.to_dict()
        return data


class StaffProfile(db.Model):
    __tablename__ = "staff_profile"

    id = db.Column(db.Integer, primary_key=True)
    # unique=True makes this a one-to-one link: one profile per user.
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), unique=True, nullable=False)
    experience_years = db.Column(db.Integer, default=0)
    specialization = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    user = db.relationship("User", back_populates="staff_profile")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "experience_years": self.experience_years,
            "specialization": self.specialization,
            "created_at": iso(self.created_at),
        }


class Trek(db.Model):
    __tablename__ = "trek"
    __table_args__ = (
        _in_list("difficulty", TREK_DIFFICULTIES),
        _in_list("status", TREK_STATUSES),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    location = db.Column(db.String(120), nullable=False)
    difficulty = db.Column(db.String(20), nullable=False)
    duration_days = db.Column(db.Integer, nullable=False)
    total_slots = db.Column(db.Integer, nullable=False)
    available_slots = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default="Pending", nullable=False)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    description = db.Column(db.Text)
    instructions = db.Column(db.Text)
    price = db.Column(db.Float, nullable=False, default=0)
    image_url = db.Column(db.String(500))
    # The staff member leading this trek (optional until the admin assigns one).
    staff_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    staff = db.relationship("User", back_populates="assigned_treks")
    bookings = db.relationship("Booking", back_populates="trek")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "location": self.location,
            "difficulty": self.difficulty,
            "duration_days": self.duration_days,
            "total_slots": self.total_slots,
            "available_slots": self.available_slots,
            "status": self.status,
            "start_date": iso(self.start_date),
            "end_date": iso(self.end_date),
            "description": self.description,
            "instructions": self.instructions,
            "price": self.price,
            "image_url": self.image_url,
            "staff_id": self.staff_id,
            "staff_name": self.staff.full_name if self.staff else None,
            "created_at": iso(self.created_at),
        }


class Booking(db.Model):
    __tablename__ = "booking"
    # Deliberately NO unique constraint on (user_id, trek_id): a user who
    # cancelled may book the same trek again. Duplicate *active* bookings
    # are blocked in the booking route instead.
    __table_args__ = (
        _in_list("status", BOOKING_STATUSES),
        _in_list("payment_status", PAYMENT_STATUSES),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    trek_id = db.Column(db.Integer, db.ForeignKey("trek.id"), nullable=False)
    booking_date = db.Column(db.DateTime, default=utcnow, nullable=False)
    status = db.Column(db.String(20), default="Booked", nullable=False)
    payment_status = db.Column(db.String(20), default="Pending", nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0)
    cancelled_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="bookings")
    trek = db.relationship("Trek", back_populates="bookings")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "trek_id": self.trek_id,
            "trek_name": self.trek.name if self.trek else None,
            "booking_date": iso(self.booking_date),
            "status": self.status,
            "payment_status": self.payment_status,
            "amount": self.amount,
            "cancelled_at": iso(self.cancelled_at),
        }
