"""
Create the database tables, the three roles, the single admin account
and some demo data for testing.

Run:  python create_initial_data.py

Safe to run many times: every record is looked up first and only created
if it is missing, so nothing gets duplicated.
"""
from datetime import date, datetime, timedelta, timezone

from flask import current_app
from flask_security import hash_password
from sqlalchemy import inspect, text

from app import create_app
from extensions import db, security
from models import (
    ROLE_ADMIN, ROLE_STAFF, ROLE_USER, TREK_DIFFICULTIES, Booking, ChecklistItem, Notification, Payment,
    Review, StaffProfile, Trek, User, Waitlist,
)
from utils.bookings import renumber_waitlist
from utils.cache import clear_trek_cache

# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------
STAFF = [
    {"email": "staff1@tma.com", "full_name": "Rohan Negi", "contact_number": "9876500001",
     "experience_years": 8, "specialization": "High-altitude treks"},
    {"email": "staff2@tma.com", "full_name": "Priya Rawat", "contact_number": "9876500002",
     "experience_years": 5, "specialization": "Alpine meadows & beginner treks"},
    {"email": "staff3@tma.com", "full_name": "Karan Thakur", "contact_number": "9876500003",
     "experience_years": 6, "specialization": "Winter & snow treks"},
    {"email": "staff4@tma.com", "full_name": "Rahim Khan", "contact_number": "9876500004",
     "experience_years": 3, "specialization": "First aid & rescue", "blacklisted": True},
]
STAFF_PASSWORD = "staff123"

TREKKERS = [
    {"email": "trekker1@tma.com", "full_name": "Ananya Sharma", "contact_number": "9876500011"},
    {"email": "trekker2@tma.com", "full_name": "Vikram Singh", "contact_number": "9876500012"},
    {"email": "trekker3@tma.com", "full_name": "Meera Iyer", "contact_number": "9876500013"},
    {"email": "trekker4@tma.com", "full_name": "Rahul Verma", "contact_number": "9876500014"},
    {"email": "trekker5@tma.com", "full_name": "Priya Patel", "contact_number": "9876500015"},
    {"email": "trekker6@tma.com", "full_name": "Karan Tiwari", "contact_number": "9876500016"},
    {"email": "trekker7@tma.com", "full_name": "Neha Joshi", "contact_number": "9876500017"},
    {"email": "trekker8@tma.com", "full_name": "Arjun Mehta", "contact_number": "9876500018"},
    {"email": "trekker9@tma.com", "full_name": "Pooja Bisht", "contact_number": "9876500019"},
    {"email": "trekker10@tma.com", "full_name": "Sana Khan", "contact_number": "9876500020"},
    {"email": "trekker11@tma.com", "full_name": "Vikas Thapa", "contact_number": "9876500021", "blacklisted": True},
]
TREKKER_PASSWORD = "user123"

# start_in = days from today until the trek starts (negative = already happened).
# staff = which staff member leads it (index into STAFF), None = not assigned yet.
TREKS = [
    {"name": "Everest Base Camp", "location": "Nepal", "difficulty": "Hard",
     "duration_days": 12, "total_slots": 15, "price": 115000, "status": "Open",
     "start_in": 45, "staff": 0,
     "description": "Walk to the foot of the world's highest mountain through Sherpa villages.",
     "instructions": "Previous high-altitude experience recommended. Medical certificate required."},
    {"name": "Roopkund", "location": "Uttarakhand", "difficulty": "Moderate",
     "duration_days": 7, "total_slots": 20, "price": 18500, "status": "Open",
     "start_in": 30, "staff": 0,
     "description": "The 'Mystery Lake' trek through Ali and Bedni Bugyal meadows.",
     "instructions": "Carry warm layers; temperatures drop below zero at night."},
    {"name": "Kedarkantha", "location": "Uttarakhand", "difficulty": "Easy",
     "duration_days": 6, "total_slots": 25, "price": 11500, "status": "Approved",
     "start_in": 60, "staff": 1,
     "description": "A classic winter summit trek with views of Swargarohini.",
     "instructions": "Good for first-timers. Waterproof shoes are a must."},
    {"name": "Hampta Pass", "location": "Himachal Pradesh", "difficulty": "Moderate",
     "duration_days": 5, "total_slots": 18, "price": 13500, "status": "Pending",
     "start_in": 90, "staff": None,
     "description": "Cross from green Kullu valley to the stark desert of Lahaul.",
     "instructions": "Includes a river crossing; quick-dry clothing recommended."},
    {"name": "Kuari Pass", "location": "Uttarakhand", "difficulty": "Easy",
     "duration_days": 6, "total_slots": 20, "price": 12500, "status": "Completed",
     "start_in": -40, "staff": 0,
     "description": "Lord Curzon's trail with views of Nanda Devi and Dronagiri.",
     "instructions": "Moderate fitness required."},
    {"name": "Valley of Flowers", "location": "Uttarakhand", "difficulty": "Moderate",
     "duration_days": 6, "total_slots": 20, "price": 14500, "status": "Closed",
     "start_in": 20, "staff": 1,
     "description": "A UNESCO World Heritage valley carpeted with alpine flowers.",
     "instructions": "Best during monsoon; carry a rain jacket and poncho."},
    # --- more demo treks: every status, a full trek with a waitlist, an almost-full one
    {"name": "Brahmatal", "location": "Uttarakhand", "difficulty": "Moderate",
     "duration_days": 6, "total_slots": 4, "price": 12000, "status": "Open",
     "start_in": 25, "staff": 0,
     "description": "A winter trek to a frozen lake with close views of Trishul and Nanda Ghunti.",
     "instructions": "Snow on the trail: microspikes are provided at base camp."},
    {"name": "Sandakphu", "location": "West Bengal", "difficulty": "Moderate",
     "duration_days": 6, "total_slots": 15, "price": 14000, "status": "Open",
     "start_in": 35, "staff": 2,
     "description": "Walk the Singalila ridge on the India-Nepal border, with four of the five highest peaks in view.",
     "instructions": "Carry a passport or voter ID for border checkpoints."},
    {"name": "Goechala", "location": "Sikkim", "difficulty": "Hard",
     "duration_days": 11, "total_slots": 12, "price": 24500, "status": "Open",
     "start_in": 50, "staff": 2,
     "description": "Sunrise over Kanchenjunga from Goechala viewpoint, through rhododendron forests.",
     "instructions": "High altitude (4,600 m). Fitness certificate required."},
    {"name": "Tarsar Marsar", "location": "Kashmir", "difficulty": "Moderate",
     "duration_days": 7, "total_slots": 5, "price": 16500, "status": "Open",
     "start_in": 40, "staff": 1,
     "description": "Twin alpine lakes ringed by meadows in the Aru valley.",
     "instructions": "Small group trek; register your ID with the forest department."},
    {"name": "Chadar Trek", "location": "Ladakh", "difficulty": "Hard",
     "duration_days": 9, "total_slots": 10, "price": 26000, "status": "Ongoing",
     "start_in": -2, "staff": 0,
     "description": "Walk on the frozen Zanskar river between towering canyon walls.",
     "instructions": "Temperatures reach -25 °C. Gumboots and down gear are mandatory."},
    {"name": "Har Ki Dun", "location": "Uttarakhand", "difficulty": "Easy",
     "duration_days": 7, "total_slots": 15, "price": 11000, "status": "Completed",
     "start_in": -75, "staff": 1,
     "description": "The 'Valley of Gods', with ancient villages and views of Swargarohini.",
     "instructions": "Good first Himalayan trek."},
    {"name": "Kashmir Great Lakes", "location": "Kashmir", "difficulty": "Moderate",
     "duration_days": 8, "total_slots": 20, "price": 21000, "status": "Approved",
     "start_in": 75, "staff": 2,
     "description": "Seven alpine lakes in eight days - often called India's most beautiful trek.",
     "instructions": "Long walking days (6-8 hours)."},
    {"name": "Dayara Bugyal", "location": "Uttarakhand", "difficulty": "Easy",
     "duration_days": 5, "total_slots": 25, "price": 9500, "status": "Pending",
     "start_in": 95, "staff": None,
     "description": "Rolling high-altitude meadows above Barsu village.",
     "instructions": "Suitable for families and beginners."},
]

# (trekker index, trek name, booking status, payment status[, booked how many days ago])
BOOKINGS = [
    (0, "Everest Base Camp", "Booked", "Paid"),
    (2, "Everest Base Camp", "Booked", "Paid"),
    (1, "Roopkund", "Booked", "Paid"),
    (2, "Roopkund", "Cancelled", "Refunded"),  # history: cancelled booking
    (0, "Kuari Pass", "Completed", "Paid"),     # history: completed trek
    (1, "Kuari Pass", "Completed", "Paid"),
    (2, "Kuari Pass", "Completed", "Paid"),
    # --- more demo bookings, spread over the last months so the charts have shape
    (4, "Everest Base Camp", "Booked", "Paid", 35),
    (7, "Everest Base Camp", "Booked", "Paid", 28),
    (6, "Roopkund", "Booked", "Paid", 16),
    (8, "Roopkund", "Booked", "Paid", 4),
    (3, "Roopkund", "Cancelled", "Refunded", 25),
    (3, "Brahmatal", "Booked", "Paid", 12),       # Brahmatal: 4 seats, all taken ...
    (4, "Brahmatal", "Booked", "Paid", 10),
    (5, "Brahmatal", "Booked", "Paid", 8),
    (6, "Brahmatal", "Booked", "Paid", 5),        # ... so it has a waitlist (WAITLIST below)
    (3, "Sandakphu", "Booked", "Paid", 20),
    (7, "Sandakphu", "Booked", "Paid", 15),
    (1, "Sandakphu", "Booked", "Paid", 3),
    (4, "Goechala", "Booked", "Paid", 40),
    (8, "Goechala", "Booked", "Paid", 22),
    (1, "Goechala", "Booked", "Paid", 9),
    (2, "Goechala", "Cancelled", "Refunded", 30),
    (5, "Tarsar Marsar", "Booked", "Paid", 18),   # 3 of 5 seats: "2 left" shows in red
    (6, "Tarsar Marsar", "Booked", "Paid", 14),
    (0, "Tarsar Marsar", "Booked", "Paid", 6),
    (6, "Chadar Trek", "Booked", "Paid", 50),     # ongoing right now
    (7, "Chadar Trek", "Booked", "Paid", 45),
    (3, "Chadar Trek", "Booked", "Paid", 44),
    (3, "Har Ki Dun", "Completed", "Paid", 120),  # completed, with reviews
    (4, "Har Ki Dun", "Completed", "Paid", 115),
    (0, "Har Ki Dun", "Completed", "Paid", 110),
    (5, "Har Ki Dun", "Completed", "Paid", 100),
    (8, "Har Ki Dun", "Completed", "Paid", 95),
    (6, "Har Ki Dun", "Cancelled", "Refunded", 105),
    (8, "Valley of Flowers", "Booked", "Paid", 60),
    (5, "Valley of Flowers", "Booked", "Paid", 58),
]

# Waitlist for the full Brahmatal trek, in joining order: (trekker index, trek name)
WAITLIST = [(7, "Brahmatal"), (8, "Brahmatal"), (0, "Brahmatal")]

# (trekker index, completed trek, rating, comment, hidden by admin)
REVIEWS = [
    (0, "Kuari Pass", 5, "Stunning views of Nanda Devi and a brilliant trek leader. Well organised from start to finish.", False),
    (1, "Kuari Pass", 4, "Great trek for beginners. Day 3 was tough in the snow but totally worth it.", False),
    (2, "Kuari Pass", 5, "Loved the campsites and the food. Would book with TMA again.", False),
    (3, "Har Ki Dun", 5, "Perfect first Himalayan trek. The village stays were the highlight.", False),
    (4, "Har Ki Dun", 4, "Beautiful valley, though the last day was long.", False),
    (0, "Har Ki Dun", 5, "Priya was a fantastic trek leader - safe, patient and full of stories.", False),
    (5, "Har Ki Dun", 3, "Lovely views; tents could have been warmer.", False),
    (8, "Har Ki Dun", 1, "Worst trip ever, total waste of money!!! (spam)", True),
]

# Packing checklist defaults: (item, category, needed from difficulty, essential from difficulty or None)
LEVEL = {d: i for i, d in enumerate(TREK_DIFFICULTIES)}  # Easy 0, Moderate 1, Hard 2
CHECKLIST = [
    ("Government photo ID", "Documents", "Easy", "Easy"),
    ("Trek booking confirmation", "Documents", "Easy", "Easy"),
    ("Medical fitness certificate", "Documents", "Hard", "Hard"),
    ("Travel insurance details", "Documents", "Moderate", "Hard"),
    ("Moisture-wicking T-shirts (2-3)", "Clothing", "Easy", "Easy"),
    ("Fleece jacket", "Clothing", "Easy", "Easy"),
    ("Waterproof rain jacket", "Clothing", "Easy", "Easy"),
    ("Trekking pants (2 pairs)", "Clothing", "Easy", None),
    ("Woollen socks (3 pairs)", "Clothing", "Easy", "Easy"),
    ("Woollen cap and gloves", "Clothing", "Easy", "Moderate"),
    ("Thermal innerwear", "Clothing", "Moderate", "Moderate"),
    ("Down jacket", "Clothing", "Moderate", "Moderate"),
    ("Balaclava and waterproof gloves", "Clothing", "Hard", "Hard"),
    ("Broken-in trekking shoes", "Gear", "Easy", "Easy"),
    ("Backpack (40-50 L) with rain cover", "Gear", "Easy", "Easy"),
    ("Water bottles (2 L in total)", "Gear", "Easy", "Easy"),
    ("Headlamp with spare batteries", "Gear", "Easy", "Easy"),
    ("UV-protection sunglasses", "Gear", "Easy", "Moderate"),
    ("Trekking poles", "Gear", "Moderate", "Hard"),
    ("Gaiters", "Gear", "Hard", None),
    ("Microspikes", "Gear", "Hard", "Hard"),
    ("Personal medicines", "Health", "Easy", "Easy"),
    ("Sunscreen (SPF 50) and lip balm", "Health", "Easy", "Easy"),
    ("Basic first-aid kit", "Health", "Easy", None),
    ("ORS / electrolyte sachets", "Health", "Easy", None),
    ("Hand sanitiser and wet wipes", "Health", "Easy", None),
    ("Altitude-sickness medicine (ask your doctor)", "Health", "Moderate", "Hard"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_or_create_user(email, password, role, **fields):
    """Return (user, created). Creates the user with the given role if missing."""
    datastore = security.datastore
    user = datastore.find_user(email=email)
    if user:
        return user, False
    user = datastore.create_user(
        email=email, password=hash_password(password), roles=[role], **fields
    )
    return user, True


def upgrade_schema():
    """
    db.create_all() creates NEW tables but never changes existing ones.
    Databases created before Phase 8 lack booking.certificate_no, so add it
    (and its unique index) once. Safe to run again: it checks first.
    """
    columns = [c["name"] for c in inspect(db.engine).get_columns("booking")] \
        if inspect(db.engine).has_table("booking") else None
    if columns is None or "certificate_no" in columns:
        return []
    with db.engine.begin() as conn:
        conn.execute(text("ALTER TABLE booking ADD COLUMN certificate_no VARCHAR(30)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_certificate_no ON booking (certificate_no)"))
    return ["schema   booking.certificate_no column added"]


def seed():
    created = []  # human-readable log of everything new
    datastore = security.datastore

    # 1. Tables (+ upgrade older databases)
    created += upgrade_schema()
    db.create_all()

    # 2. Roles
    roles = {
        ROLE_ADMIN: datastore.find_or_create_role(ROLE_ADMIN, description="Platform administrator"),
        ROLE_STAFF: datastore.find_or_create_role(ROLE_STAFF, description="Trek leader / staff"),
        ROLE_USER: datastore.find_or_create_role(ROLE_USER, description="Trekker"),
    }
    db.session.flush()  # give the roles their ids before users reference them

    # 3. The one and only admin (credentials come from config / env vars)
    cfg = current_app.config
    _, new = get_or_create_user(
        cfg["ADMIN_EMAIL"], cfg["ADMIN_PASSWORD"], roles[ROLE_ADMIN],
        full_name="TMA Admin", contact_number="9876500000",
    )
    if new:
        created.append(f"admin    {cfg['ADMIN_EMAIL']}")

    # 4. Staff users + their profiles
    staff_users = []
    for s in STAFF:
        user, new = get_or_create_user(
            s["email"], STAFF_PASSWORD, roles[ROLE_STAFF],
            full_name=s["full_name"], contact_number=s["contact_number"],
        )
        if not user.staff_profile:
            user.staff_profile = StaffProfile(
                experience_years=s["experience_years"], specialization=s["specialization"]
            )
        if new:
            user.is_blacklisted = s.get("blacklisted", False)
            created.append(f"staff    {s['email']}" + (" (blacklisted)" if user.is_blacklisted else ""))
        staff_users.append(user)

    # 5. Trekkers
    trekkers = []
    for t in TREKKERS:
        user, new = get_or_create_user(
            t["email"], TREKKER_PASSWORD, roles[ROLE_USER],
            full_name=t["full_name"], contact_number=t["contact_number"],
        )
        if new:
            user.is_blacklisted = t.get("blacklisted", False)
            created.append(f"trekker  {t['email']}" + (" (blacklisted)" if user.is_blacklisted else ""))
        trekkers.append(user)

    # 6. Treks (dates are relative to today so the demo never goes stale)
    today = date.today()
    treks = {}
    for t in TREKS:
        trek = Trek.query.filter_by(name=t["name"]).first()
        if not trek:
            start = today + timedelta(days=t["start_in"])
            trek = Trek(
                name=t["name"], location=t["location"], difficulty=t["difficulty"],
                duration_days=t["duration_days"], total_slots=t["total_slots"],
                available_slots=t["total_slots"], status=t["status"],
                start_date=start, end_date=start + timedelta(days=t["duration_days"] - 1),
                description=t["description"], instructions=t["instructions"],
                price=t["price"],
                staff=staff_users[t["staff"]] if t["staff"] is not None else None,
            )
            db.session.add(trek)
            created.append(f"trek     {t['name']} ({t['status']})")
        treks[t["name"]] = trek

    # 7. Bookings. A booking that holds a seat (Booked/Completed) uses up one
    #    available slot; a cancelled one gives its seat back.
    for trekker_idx, trek_name, status, payment, *days_ago in BOOKINGS:
        user, trek = trekkers[trekker_idx], treks[trek_name]
        exists = Booking.query.filter_by(user=user, trek=trek, status=status).first()
        if exists:
            continue
        booked_at = datetime.now(timezone.utc) - timedelta(days=days_ago[0] if days_ago else 0)
        booking = Booking(user=user, trek=trek, status=status, booking_date=booked_at,
                          payment_status=payment, amount=trek.price)
        if status == "Cancelled":
            booking.cancelled_at = booked_at + timedelta(days=2)
        else:
            trek.available_slots -= 1
        db.session.add(booking)
        created.append(f"booking  {user.email} -> {trek_name} [{status}/{payment}]")
    db.session.flush()

    seeded = [Booking.query.filter_by(user=trekkers[b[0]], trek=treks[b[1]], status=b[2]).first()
              for b in BOOKINGS]

    # 7b. Waitlist for full treks (positions = joining order)
    for trekker_idx, trek_name in WAITLIST:
        user, trek = trekkers[trekker_idx], treks[trek_name]
        if not Waitlist.query.filter_by(user=user, trek=trek, status="Waiting").first():
            db.session.add(Waitlist(user=user, trek=trek, status="Waiting"))
            db.session.add(Notification(user_id=user.id, title="Joined the waitlist",
                                        message=f"You're on the waitlist for {trek_name}.", type="waitlist", link="/user/bookings"))
            created.append(f"waitlist {user.email} -> {trek_name}")
    db.session.flush()
    for trek_name in {name for _, name in WAITLIST}:
        renumber_waitlist(treks[trek_name].id)

    # 8. Payments for the seeded paid/refunded bookings
    for booking in seeded:
        if booking.payments or booking.payment_status not in ("Paid", "Refunded"):
            continue
        db.session.add(Payment(booking=booking, amount=booking.amount, method="UPI", status="Success"))
        if booking.payment_status == "Refunded":
            db.session.add(Payment(booking=booking, amount=booking.amount, method="UPI", status="Refunded"))
        created.append(f"payment  booking #{booking.id} [{booking.payment_status}]")

    # 9. Reviews of completed treks (one hidden by the admin, to show moderation)
    for trekker_idx, trek_name, rating, comment, hidden in REVIEWS:
        booking = Booking.query.filter_by(user=trekkers[trekker_idx], trek=treks[trek_name], status="Completed").first()
        if booking and booking.review is None:
            db.session.add(Review(user=trekkers[trekker_idx], trek=booking.trek, booking=booking,
                                  rating=rating, comment=comment, is_hidden=hidden))
            created.append(f"review   {trekkers[trekker_idx].email} -> {trek_name} ({rating}*{', hidden' if hidden else ''})")

    # 10. A few notifications matching the seeded bookings
    for booking in seeded:
        if booking.status == "Booked" and booking.payment_status != "Paid":
            continue  # nothing to announce for an unpaid booking
        title, message, kind, link = {
            "Booked": ("Payment successful", f"Your booking for {booking.trek.name} is confirmed.", "payment", "/user/bookings"),
            "Cancelled": ("Booking cancelled", f"Your booking for {booking.trek.name} was cancelled and refunded.", "booking", "/user/history"),
            "Completed": (f"You completed {booking.trek.name}!", "Rate your trek and download your certificate from History.", "trek", "/user/history"),
        }[booking.status]
        if not Notification.query.filter_by(user_id=booking.user_id, title=title, message=message).first():
            db.session.add(Notification(user_id=booking.user_id, title=title, message=message, type=kind, link=link))
            created.append(f"notify   {booking.user.email}: {title}")

    # 11. Default packing checklist for each difficulty
    added = 0
    for difficulty in TREK_DIFFICULTIES:
        for item, category, needed_from, essential_from in CHECKLIST:
            if LEVEL[difficulty] < LEVEL[needed_from]:
                continue
            if ChecklistItem.query.filter_by(difficulty=difficulty, trek_id=None, item=item).first():
                continue
            essential = essential_from is not None and LEVEL[difficulty] >= LEVEL[essential_from]
            db.session.add(ChecklistItem(difficulty=difficulty, item=item, category=category, is_essential=essential))
            added += 1
    if added:
        created.append(f"checklist {added} default items (Easy/Moderate/Hard)")

    db.session.commit()
    clear_trek_cache()  # data was written directly: drop anything cached

    # 8. Report
    if created:
        print(f"Created {len(created)} record(s):")
        for line in created:
            print("  +", line)
    else:
        print("Nothing to create - all initial data already exists.")
    print(f"Totals: {User.query.count()} users, {Trek.query.count()} treks, "
          f"{Booking.query.count()} bookings")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed()
