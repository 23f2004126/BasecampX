"""
Database models for the Trek Management App (TMA).

Tables
------
role, user, roles_users   -> accounts and permissions (used by Flask-Security)
staff_profile             -> extra details for staff users (one-to-one with user)
trek                      -> treks that trekkers can book
booking                   -> a trekker's booking for a trek
payment                   -> payment attempts / refunds for a booking (simulated)
waitlist                  -> queue of trekkers waiting for a full trek
review                    -> rating + comment for a completed booking
notification              -> in-app notifications for a user
checklist_item            -> packing list items (per difficulty or per trek)

Every model has a to_dict() method so routes can return it as JSON.
Secrets (password hash, fs_uniquifier) are NEVER included in to_dict().
"""
import secrets
from datetime import datetime, timedelta, timezone

from flask_security import RoleMixin, UserMixin
from sqlalchemy import func

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
# Lifecycle: Pending -> Approved (admin) -> Open/Closed (staff) -> Ongoing -> Completed
TREK_STATUSES = ("Pending", "Approved", "Open", "Closed", "Ongoing", "Completed")
BOOKING_STATUSES = ("Booked", "Cancelled", "Completed")
PAYMENT_STATUSES = ("Pending", "Paid", "Refunded")

PAYMENT_METHODS = ("UPI", "Card", "NetBanking")
PAYMENT_RECORD_STATUSES = ("Success", "Failed", "Refunded")
WAITLIST_STATUSES = ("Waiting", "Promoted", "Left")
NOTIFICATION_TYPES = ("booking", "payment", "waitlist", "trek", "system")
CHECKLIST_CATEGORIES = ("Documents", "Clothing", "Gear", "Health")

# A new (or promoted) booking holds its seat this long while waiting for payment.
PAYMENT_WINDOW_MINUTES = 30


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
    reviews = db.relationship("Review", back_populates="trek")
    # Waitlist entries and trek-specific checklist items belong to the trek
    # and are deleted with it (bookings/reviews are history and block deletion).
    waitlist = db.relationship("Waitlist", back_populates="trek", cascade="all, delete-orphan")
    checklist_items = db.relationship("ChecklistItem", back_populates="trek", cascade="all, delete-orphan")

    def rating_summary(self):
        """(average rating rounded to 1 decimal or None, number of visible reviews)"""
        avg, count = (
            db.session.query(func.avg(Review.rating), func.count(Review.id))
            .filter(Review.trek_id == self.id, Review.is_hidden.is_(False))
            .one()
        )
        return (round(float(avg), 1) if avg is not None else None), count

    def to_dict(self):
        avg_rating, review_count = self.rating_summary()
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
            "avg_rating": avg_rating,
            "review_count": review_count,
            "created_at": iso(self.created_at),
        }


class Booking(db.Model):
    __tablename__ = "booking"
    # Deliberately NO plain unique constraint on (user_id, trek_id): a user who
    # cancelled may book the same trek again. Duplicate *active* bookings are
    # blocked in the booking route, and this PARTIAL unique index is a safety
    # net: it only covers rows with status 'Booked', so at most one active
    # booking per user per trek can exist, even if two requests race.
    __table_args__ = (
        _in_list("status", BOOKING_STATUSES),
        _in_list("payment_status", PAYMENT_STATUSES),
        db.Index(
            "uq_one_active_booking",
            "user_id",
            "trek_id",
            unique=True,
            sqlite_where=db.text("status = 'Booked'"),
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    trek_id = db.Column(db.Integer, db.ForeignKey("trek.id"), nullable=False)
    booking_date = db.Column(db.DateTime, default=utcnow, nullable=False)
    status = db.Column(db.String(20), default="Booked", nullable=False)
    payment_status = db.Column(db.String(20), default="Pending", nullable=False)
    amount = db.Column(db.Float, nullable=False, default=0)
    cancelled_at = db.Column(db.DateTime, nullable=True)
    # Issued the first time the completion certificate is downloaded (TMA-2026-000123)
    certificate_no = db.Column(db.String(30), unique=True, nullable=True)

    user = db.relationship("User", back_populates="bookings")
    trek = db.relationship("Trek", back_populates="bookings")
    payments = db.relationship("Payment", back_populates="booking", order_by="Payment.created_at")
    review = db.relationship("Review", back_populates="booking", uselist=False)

    @property
    def payment_due_at(self):
        """Deadline to pay for an unpaid active booking (None otherwise)."""
        if self.status == "Booked" and self.payment_status == "Pending" and self.booking_date:
            return self.booking_date + timedelta(minutes=PAYMENT_WINDOW_MINUTES)
        return None

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
            "payment_due_at": iso(self.payment_due_at),
            "certificate_no": self.certificate_no,
            "reviewed": self.review is not None,
        }


def _ref():
    """Simulated payment reference, e.g. TMA-8F3A21C9."""
    return "TMA-" + secrets.token_hex(4).upper()


class Payment(db.Model):
    """One row per payment attempt or refund (bookings can have several)."""

    __tablename__ = "payment"
    __table_args__ = (
        _in_list("method", PAYMENT_METHODS),
        _in_list("status", PAYMENT_RECORD_STATUSES),
    )

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("booking.id"), nullable=False, index=True)
    amount = db.Column(db.Float, nullable=False)
    method = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    transaction_ref = db.Column(db.String(20), unique=True, nullable=False, default=_ref)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    booking = db.relationship("Booking", back_populates="payments")

    def to_dict(self):
        return {
            "id": self.id,
            "booking_id": self.booking_id,
            "amount": self.amount,
            "method": self.method,
            "status": self.status,
            "transaction_ref": self.transaction_ref,
            "created_at": iso(self.created_at),
        }


class Waitlist(db.Model):
    """Trekkers queuing for a full trek. position is 1-based among 'Waiting' rows."""

    __tablename__ = "waitlist"
    __table_args__ = (
        _in_list("status", WAITLIST_STATUSES),
        # At most one *waiting* entry per user per trek (leaving and re-joining is fine).
        db.Index("uq_one_waiting_entry", "user_id", "trek_id", unique=True,
                 sqlite_where=db.text("status = 'Waiting'")),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    trek_id = db.Column(db.Integer, db.ForeignKey("trek.id"), nullable=False, index=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="Waiting")
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    user = db.relationship("User")
    trek = db.relationship("Trek", back_populates="waitlist")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "user_email": self.user.email if self.user else None,
            "trek_id": self.trek_id,
            "trek_name": self.trek.name if self.trek else None,
            "trek_start_date": iso(self.trek.start_date) if self.trek else None,
            "position": self.position if self.status == "Waiting" else None,
            "status": self.status,
            "created_at": iso(self.created_at),
        }


class Review(db.Model):
    __tablename__ = "review"
    __table_args__ = (
        db.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_rating_range"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    trek_id = db.Column(db.Integer, db.ForeignKey("trek.id"), nullable=False, index=True)
    # unique: one review per booking (the DB enforces it even if two requests race)
    booking_id = db.Column(db.Integer, db.ForeignKey("booking.id"), unique=True, nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.String(500))
    is_hidden = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    user = db.relationship("User")
    trek = db.relationship("Trek", back_populates="reviews")
    booking = db.relationship("Booking", back_populates="review")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "trek_id": self.trek_id,
            "trek_name": self.trek.name if self.trek else None,
            "booking_id": self.booking_id,
            "rating": self.rating,
            "comment": self.comment,
            "is_hidden": self.is_hidden,
            "created_at": iso(self.created_at),
        }


class Notification(db.Model):
    __tablename__ = "notification"
    __table_args__ = (
        _in_list("type", NOTIFICATION_TYPES),
        db.Index("ix_notification_user_unread", "user_id", "is_read"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    message = db.Column(db.String(500), nullable=False)
    type = db.Column(db.String(20), nullable=False, default="system")
    link = db.Column(db.String(255))  # front-end route, e.g. "/user/bookings"
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "type": self.type,
            "link": self.link,
            "is_read": self.is_read,
            "created_at": iso(self.created_at),
        }


class ChecklistItem(db.Model):
    """A default item for every trek of a difficulty, or an extra item for one trek."""

    __tablename__ = "checklist_item"
    __table_args__ = (
        _in_list("category", CHECKLIST_CATEGORIES),
        db.CheckConstraint("difficulty IS NOT NULL OR trek_id IS NOT NULL", name="ck_checklist_scope"),
    )

    id = db.Column(db.Integer, primary_key=True)
    difficulty = db.Column(db.String(20), nullable=True)
    trek_id = db.Column(db.Integer, db.ForeignKey("trek.id"), nullable=True, index=True)
    item = db.Column(db.String(150), nullable=False)
    category = db.Column(db.String(20), nullable=False)
    is_essential = db.Column(db.Boolean, default=False, nullable=False)

    trek = db.relationship("Trek", back_populates="checklist_items")

    def to_dict(self):
        return {
            "id": self.id,
            "item": self.item,
            "category": self.category,
            "is_essential": self.is_essential,
            "difficulty": self.difficulty,
            "trek_id": self.trek_id,
            "trek_specific": self.trek_id is not None,
        }

