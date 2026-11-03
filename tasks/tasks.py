"""
Background jobs (run by the Celery worker).

    daily_reminder       - beat: every day 18:00 IST  - email trekkers whose trek starts within 3 days
    monthly_report       - beat: 1st of month 09:00   - HTML + PDF report of last month to the admin(s)
    export_bookings_csv  - on demand (user clicks Export CSV) - writes a CSV, emails it, returns the filename
    send_staff_welcome   - on demand (admin creates staff)    - login details for the new staff member
    send_booking_email   - on demand - booking confirmed (paid) / cancelled / waitlist spot opened
    auto_cancel_unpaid   - beat: every 10 minutes - cancel bookings left unpaid for 30 minutes

Each task runs inside the Flask app context (see celery_app.FlaskTask).
"""
import csv
import json
import os
import secrets
import urllib.request
from datetime import date, datetime, timedelta

from celery.utils.log import get_task_logger
from flask import current_app
from sqlalchemy import func

from extensions import db
from models import PAYMENT_WINDOW_MINUTES, ROLE_ADMIN, ROLE_STAFF, Booking, Role, Trek, User
from tasks.celery_app import celery
from tasks.mailer import render, send_email
from utils.bookings import cancel_booking, utcnow_naive
from utils.cache import clear_trek_cache
from utils.pdf import html_to_pdf

logger = get_task_logger(__name__)

CARRY_LIST = [
    "Valid photo ID (and permits, if your trek needs them)",
    "Broken-in trekking shoes and two pairs of woollen socks",
    "Warm layers: thermal, fleece and a windproof/rain jacket",
    "Water bottle (2 L), energy snacks and electrolytes",
    "Personal medicines, sunscreen, sunglasses and a cap",
    "Headlamp with spare batteries",
]
HARD_TREK_EXTRAS = [
    "Down jacket, gloves and a balaclava for sub-zero nights",
    "Medical fitness certificate",
]


def _fmt(d):
    return d.strftime("%d %b %Y") if d else "—"


def _users_with_role(name):
    return User.query.filter(User.roles.any(Role.name == name))


def _post_to_google_chat(text):
    """Optional: post to a Google Chat space. Skipped quietly if no webhook is configured."""
    url = current_app.config.get("GCHAT_WEBHOOK_URL")
    if not url:
        return False
    try:
        request = urllib.request.Request(
            url,
            data=json.dumps({"text": text}).encode(),
            headers={"Content-Type": "application/json; charset=UTF-8"},
            method="POST",
        )
        urllib.request.urlopen(request, timeout=5).close()
        return True
    except Exception as error:  # a chat outage must never break the email job
        logger.warning("Google Chat webhook failed: %s", error)
        return False


# ---------------------------------------------------------------------------
# a) Daily reminder
# ---------------------------------------------------------------------------
@celery.task(name="tasks.daily_reminder")
def daily_reminder():
    today = date.today()
    last_day = today + timedelta(days=current_app.config["REMINDER_DAYS_AHEAD"])
    base_url = current_app.config["APP_BASE_URL"]

    # Active bookings on treks starting tomorrow .. in 3 days
    bookings = (
        Booking.query.join(Trek).join(User, Booking.user_id == User.id)
        .filter(
            Booking.status == "Booked",
            Trek.start_date > today,
            Trek.start_date <= last_day,
            User.active.is_(True),
            User.is_blacklisted.is_(False),
        )
        .order_by(Trek.start_date)
        .all()
    )

    sent, failed = 0, 0
    for booking in bookings:
        trek, user = booking.trek, booking.user
        days_left = (trek.start_date - today).days
        html = render(
            "reminder_email.html",
            subject=f"{trek.name} starts in {days_left} days",
            name=user.full_name or "trekker",
            trek=trek,
            days_left=days_left,
            start_date=_fmt(trek.start_date),
            end_date=_fmt(trek.end_date),
            carry_list=CARRY_LIST + (HARD_TREK_EXTRAS if trek.difficulty == "Hard" else []),
            bookings_url=f"{base_url}/#/user/bookings",
        )
        try:
            send_email(user.email, f"Reminder: {trek.name} starts in {days_left} day{'s' if days_left != 1 else ''}", html)
            sent += 1
        except Exception as error:  # one bad address must not stop the others
            failed += 1
            logger.error("Reminder to %s failed: %s", user.email, error)

    chat_posted = False
    if bookings:
        treks = sorted({b.trek.name for b in bookings})
        chat_posted = _post_to_google_chat(
            f"⛰️ TMA daily reminder: {sent} trekker reminder(s) sent for treks starting in the next "
            f"{current_app.config['REMINDER_DAYS_AHEAD']} days: {', '.join(treks)}."
        )

    logger.info("Daily reminder: %s sent, %s failed", sent, failed)
    return {"user_id": None, "job": "daily_reminder", "sent": sent, "failed": failed, "google_chat": chat_posted}


# ---------------------------------------------------------------------------
# b) Monthly report
# ---------------------------------------------------------------------------
def previous_month(today=None):
    today = today or date.today()
    first_of_this_month = today.replace(day=1)
    last_month = first_of_this_month - timedelta(days=1)
    return last_month.year, last_month.month


def build_monthly_report(year, month):
    """All numbers for one calendar month, ready for monthly_report.html."""
    start = date(year, month, 1)
    end = (start + timedelta(days=32)).replace(day=1)          # first day of next month
    start_dt, end_dt = datetime(start.year, start.month, 1), datetime(end.year, end.month, 1)
    in_month = (Booking.booking_date >= start_dt) & (Booking.booking_date < end_dt)

    # Treks conducted = completed treks that ended this month
    conducted = (
        Trek.query.filter(Trek.status == "Completed", Trek.end_date >= start, Trek.end_date < end)
        .order_by(Trek.end_date).all()
    )
    conducted_ids = [t.id for t in conducted]
    participants = dict(
        db.session.query(Booking.trek_id, func.count(Booking.id))
        .filter(Booking.trek_id.in_(conducted_ids), Booking.status == "Completed")
        .group_by(Booking.trek_id).all()
    ) if conducted_ids else {}
    unique_trekkers = (
        db.session.query(func.count(func.distinct(Booking.user_id)))
        .filter(Booking.trek_id.in_(conducted_ids), Booking.status == "Completed").scalar()
    ) if conducted_ids else 0

    top = (
        db.session.query(Trek.name, Trek.location, func.count(Booking.id).label("n"))
        .join(Booking).filter(in_month, Booking.status != "Cancelled")
        .group_by(Trek.id).order_by(func.count(Booking.id).desc(), Trek.name).limit(5).all()
    )

    staff_rows = []
    for staff in _users_with_role(ROLE_STAFF).order_by(User.full_name):
        bookings = (
            Booking.query.join(Trek)
            .filter(Trek.staff_id == staff.id, in_month, Booking.status != "Cancelled").count()
        )
        staff_rows.append({
            "name": staff.full_name, "email": staff.email,
            "treks": len(staff.assigned_treks), "bookings": bookings,
        })
    staff_rows.sort(key=lambda s: (-s["bookings"], s["name"] or ""))

    return {
        "month_key": f"{year:04d}-{month:02d}",
        "month_label": start.strftime("%B %Y"),
        "period_start": _fmt(start),
        "period_end": _fmt(end - timedelta(days=1)),
        "generated_at": datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "summary": {
            "treks_conducted": len(conducted),
            "total_bookings": Booking.query.filter(in_month).count(),
            "cancellations": Booking.query.filter(
                Booking.cancelled_at >= start_dt, Booking.cancelled_at < end_dt).count(),
            "unique_trekkers": unique_trekkers,
        },
        "conducted": [{
            "name": t.name, "location": t.location,
            "dates": f"{_fmt(t.start_date)} – {_fmt(t.end_date)}",
            "staff": t.staff.full_name if t.staff else "—",
            "participants": participants.get(t.id, 0),
        } for t in conducted],
        "top_treks": [{"name": n, "location": loc, "bookings": c} for n, loc, c in top],
        "staff": staff_rows,
    }


def monthly_report_files(year, month):
    """(report data, html, pdf bytes) - shared by the scheduled job and the download endpoint."""
    data = build_monthly_report(year, month)
    html = render("monthly_report.html", **data)
    return data, html, html_to_pdf(html)


@celery.task(name="tasks.monthly_report")
def monthly_report(month=None):
    """month: 'YYYY-MM'; default = the previous calendar month."""
    year, mon = (int(month[:4]), int(month[5:7])) if month else previous_month()
    data, html, pdf = monthly_report_files(year, mon)

    admins = [u.email for u in _users_with_role(ROLE_ADMIN)]
    send_email(
        admins,
        f"TMA Monthly Report – {data['month_label']}",
        html,
        attachments=[(f"tma-report-{data['month_key']}.pdf", "application/pdf", pdf)],
    )
    logger.info("Monthly report %s sent to %s", data["month_key"], admins)
    return {"user_id": None, "job": "monthly_report", "month": data["month_key"],
            "sent_to": admins, "pdf_bytes": len(pdf)}


# ---------------------------------------------------------------------------
# c) CSV export of one trekker's bookings
# ---------------------------------------------------------------------------
CSV_HEADER = ["User ID", "Trek Name", "Location", "Booking Status", "Booking Date", "Trek Start Date", "Trek End Date"]


def export_filename(user_id):
    """bookings_u<id>_<timestamp>_<random>.csv - the owner's id is part of the name,
    and the random part makes it impossible to guess someone else's file."""
    return f"bookings_u{user_id}_{datetime.now():%Y%m%d_%H%M%S}_{secrets.token_hex(4)}.csv"


@celery.task(name="tasks.export_bookings_csv")
def export_bookings_csv(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    export_dir = current_app.config["EXPORT_DIR"]
    os.makedirs(export_dir, exist_ok=True)
    filename = export_filename(user_id)
    path = os.path.join(export_dir, filename)

    bookings = Booking.query.filter_by(user_id=user_id).join(Trek).order_by(Booking.booking_date.desc()).all()
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADER)
        for b in bookings:
            writer.writerow([
                user_id, b.trek.name, b.trek.location, b.status,
                b.booking_date.strftime("%Y-%m-%d"),
                b.trek.start_date.isoformat() if b.trek.start_date else "",
                b.trek.end_date.isoformat() if b.trek.end_date else "",
            ])

    # Let the user know (with the file attached). The export itself already
    # succeeded, so an email problem is logged, not raised.
    try:
        with open(path, "rb") as f:
            csv_bytes = f.read()
        html = render(
            "export_ready_email.html",
            subject="Your TMA bookings export is ready",
            name=user.full_name or "trekker",
            rows=len(bookings),
            history_url=f"{current_app.config['APP_BASE_URL']}/#/user/history",
        )
        send_email(user.email, "Your TMA bookings export is ready", html,
                   attachments=[("tma-bookings.csv", "text/csv", csv_bytes)])
    except Exception as error:
        logger.warning("Export email to %s failed: %s", user.email, error)

    return {"user_id": user_id, "filename": filename, "rows": len(bookings)}


# ---------------------------------------------------------------------------
# Staff welcome email (admin creates a staff account)
# ---------------------------------------------------------------------------
@celery.task(name="tasks.send_staff_welcome")
def send_staff_welcome(user_id, password):
    user = db.session.get(User, user_id)
    if user is None:
        return {"user_id": None, "sent": False}
    html = render(
        "staff_welcome_email.html",
        subject="Your TMA staff account",
        name=user.full_name or "there",
        email=user.email,
        password=password,
        login_url=f"{current_app.config['APP_BASE_URL']}/#/login",
    )
    send_email(user.email, "Your TMA Trekking Staff account", html)
    return {"user_id": None, "sent": True}


# ---------------------------------------------------------------------------
# Booking emails (confirmed / cancelled / promoted from waitlist)
# ---------------------------------------------------------------------------
BOOKING_EMAILS = {
    "confirmed": ("Booking confirmed: {trek}", "You're going to {trek}!"),
    "cancelled": ("Booking cancelled: {trek}", "Your booking for {trek} was cancelled"),
    "promoted": ("A spot opened up on {trek}", "Good news: a spot opened up on {trek}"),
}


@celery.task(name="tasks.send_booking_email")
def send_booking_email(booking_id, kind, reason=""):
    booking = db.session.get(Booking, booking_id)
    if booking is None or kind not in BOOKING_EMAILS:
        return {"user_id": None, "sent": False}
    trek, user = booking.trek, booking.user
    subject, heading = (text.format(trek=trek.name) for text in BOOKING_EMAILS[kind])
    paid = next((p for p in reversed(booking.payments) if p.status == "Success"), None)
    html = render(
        "booking_email.html",
        subject=subject,
        kind=kind,
        heading=heading,
        reason=reason,
        name=user.full_name or "trekker",
        booking=booking,
        trek=trek,
        start_date=_fmt(trek.start_date),
        end_date=_fmt(trek.end_date),
        amount=f"₹{booking.amount:,.0f}",
        transaction_ref=paid.transaction_ref if paid else None,
        refunded=booking.payment_status == "Refunded",
        window=PAYMENT_WINDOW_MINUTES,
        bookings_url=f"{current_app.config['APP_BASE_URL']}/#/user/bookings",
    )
    send_email(user.email, subject, html)
    return {"user_id": None, "sent": True, "kind": kind}


# ---------------------------------------------------------------------------
# Auto-cancel bookings that were never paid
# ---------------------------------------------------------------------------
@celery.task(name="tasks.auto_cancel_unpaid")
def auto_cancel_unpaid():
    """
    A booking (or waitlist promotion) holds a seat for PAYMENT_WINDOW_MINUTES.
    After that, release the seat, tell the user, and offer it to the waitlist.
    """
    cutoff = utcnow_naive() - timedelta(minutes=PAYMENT_WINDOW_MINUTES)
    stale = (
        Booking.query.filter(Booking.status == "Booked", Booking.payment_status == "Pending",
                             Booking.booking_date < cutoff)
        .order_by(Booking.booking_date).all()
    )
    reason = f" because payment wasn't completed within {PAYMENT_WINDOW_MINUTES} minutes"
    cancelled, promoted_ids = [], []
    for booking in stale:
        # Each booking in its own transaction: one failure doesn't undo the others.
        ok, promoted = cancel_booking(booking, reason, only_if_unpaid=True)
        if not ok:  # paid (or cancelled) a moment ago - leave it alone
            db.session.rollback()
            continue
        db.session.commit()
        clear_trek_cache(booking.trek_id)
        cancelled.append(booking.id)
        promoted_ids += [b.id for b in promoted]
        send_booking_email.delay(booking.id, "cancelled", reason)
        for b in promoted:
            send_booking_email.delay(b.id, "promoted")

    logger.info("Auto-cancel: %s cancelled, %s promoted from waitlist", len(cancelled), len(promoted_ids))
    return {"user_id": None, "job": "auto_cancel_unpaid", "cancelled": cancelled, "promoted": promoted_ids}

