# TMA REST API

All endpoints are under `/api`, take and return JSON, and (except register/login)
need the header `Authentication-Token: <token>` from `POST /api/login`.

**Roles:** `admin`, `staff`, `user` (trekker). "Any" = any logged-in role.

## Conventions

| | |
|---|---|
| Error body | `{"message": "..."}` |
| Validation error (400) | `{"message": "Validation failed.", "errors": {"field": "problem"}}` |
| Status codes | 400 bad input or invalid state · 401 not logged in · 403 wrong role, not the assigned staff, or blacklisted · 404 not found · 409 conflict (duplicate, full, has bookings) |
| Pagination | `?page=1&per_page=10` (max 100) → `{"items": [...], "page", "per_page", "total", "pages"}` |
| Dates | `"YYYY-MM-DD"` |
| Choice values | case-insensitive (`open` = `Open`) |

**Trek statuses:** Pending → Approved → Open / Closed → Ongoing → Completed
**Booking statuses:** Booked, Cancelled, Completed · **Payment:** Pending, Paid, Refunded

---

## Auth (`routes/auth_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| POST | `/api/register` | Public | Create a trekker account. Body: `email, password, full_name, contact_number`. Any `role` sent is ignored. 409 if email exists. |
| POST | `/api/login` | Public | Body: `email, password` → `{token, role, id, full_name}`. 401 bad credentials, 403 blacklisted/inactive. |
| POST | `/api/logout` | Any | Invalidates all of the user's tokens. |
| GET | `/api/me` | Any | The logged-in user. |
| GET | `/api/profile` | Any | My account (used by Admin Settings and Staff Profile). |
| PUT | `/api/profile` | Any | Update `full_name`, `contact_number` (staff also `experience_years`, `specialization`); `new_password` + `current_password` changes the password and returns a new `token`. |

## Admin (`routes/admin_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/admin/stats` | admin | Totals (treks, trekkers, staff, bookings) + 5 most recent bookings. |
| GET | `/api/admin/treks?search=&status=&page=&per_page=` | admin | All treks, searchable by name/location. Paginated. |
| POST | `/api/admin/treks` | admin | Create a trek. Required: `name, location, difficulty, duration_days, total_slots, price, start_date, end_date`. Optional: `description, instructions, image_url, status` (default Pending). `available_slots = total_slots`. |
| PUT | `/api/admin/treks/<id>` | admin | Update any trek fields. Changing `total_slots` shifts `available_slots` by the same amount (never below 0); 409 if lower than seats already booked. |
| DELETE | `/api/admin/treks/<id>` | admin | Delete a trek. 409 if it has active bookings, or any booking history (close it instead). |
| PUT | `/api/admin/treks/<id>/assign` | admin | Body: `{staff_id}` (or `null` to unassign). 400 if the user isn't staff or is blacklisted. |
| POST | `/api/admin/staff` | admin | Create staff user + profile. Body: `full_name, email, password, contact_number, experience_years, specialization`. |
| GET | `/api/admin/staff?search=&page=` | admin | Staff list with `assigned_treks_count`. Paginated. |
| GET | `/api/admin/users?search=&page=` | admin | Trekker list with `bookings_count`. Paginated. |
| PUT | `/api/admin/users/<id>/blacklist` | admin | Blacklist a trekker or staff member (403 for the admin). Takes effect on their next request. |
| PUT | `/api/admin/users/<id>/whitelist` | admin | Remove the blacklist. |
| GET | `/api/admin/bookings?status=&trek_id=&page=` | admin | All bookings incl. cancelled/completed history. Paginated. |
| GET | `/api/admin/search?q=&type=users\|staff\|treks` | admin | Global search (max 20 per type). Omit `type` to search all three. |
| GET | `/api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | admin | Default range: last 6 months. Bad date or `from` after `to`: 400. Each range is cached separately. Chart data `{labels, data}` for the range: `bookings_per_trek` (top 5), `bookings_per_month` (months inside the range), `treks_by_status`, `users_by_difficulty`, `avg_rating_per_trek` (top 10, visible reviews), `waitlist_demand` (people waiting per trek). Cancelled bookings excluded. Cached 2 min. |
| GET | `/api/admin/reports/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD` | admin | Report as a PDF download, same range and rules as `/api/admin/reports`. `?month=YYYY-MM` gives the monthly report instead. |
| POST | `/api/admin/jobs/daily-reminder` | admin | Run the daily reminder job now → 202 `{task_id}`. |
| POST | `/api/admin/jobs/monthly-report` | admin | Body: `{month?}`. Email the monthly report now → 202 `{task_id}`. |
| POST | `/api/admin/treks/<id>/checklist` | admin | Body: `{item, category, is_essential}`. Add a trek-specific packing item. |
| DELETE | `/api/admin/checklist/<item_id>` | admin | Remove a trek-specific packing item (default items: 400). |
| GET | `/api/admin/reviews?hidden=true\|false&trek_id=&page=` | admin | All reviews for moderation. Paginated. |
| PUT | `/api/admin/reviews/<id>/hide` | admin | Hide a review (excluded from averages; author notified). |
| PUT | `/api/admin/reviews/<id>/unhide` | admin | Make a hidden review visible again. |
| DELETE | `/api/admin/reviews/<id>` | admin | Delete a review. |

## Staff (`routes/staff_routes.py`)

Every endpoint with a trek `<id>` returns **403** unless `trek.staff_id` is the logged-in staff member.

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/staff/dashboard` | staff | Assigned-trek count, total participants, ongoing treks. |
| GET | `/api/staff/treks?search=&status=&page=` | staff | My assigned treks, each with `participant_count`. Paginated. |
| GET | `/api/staff/treks/<id>` | staff | Trek details + participant list (name, email, phone, booking/payment status). |
| PUT | `/api/staff/treks/<id>` | staff | Body: `available_slots` and/or `status` (`Open`/`Closed` only, trek must be Approved/Open/Closed). Slots must be 0…(total − booked). |
| PUT | `/api/staff/treks/<id>/start` | staff | Open/Closed → **Ongoing**. |
| PUT | `/api/staff/treks/<id>/complete` | staff | Ongoing → **Completed**; all its Booked bookings become Completed. |

## Treks (`routes/trek_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/treks?search=&difficulty=&location=&min_days=&max_days=&sort=date\|rating&page=` | Any | Browse treks. Trekkers see **Open** only; admin/staff see all and may add `&status=`. `sort=rating` = best rated first. Each trek includes `avg_rating`, `review_count`. Paginated, cached 5 min. |
| GET | `/api/treks/locations` | Any | Distinct locations for the filter dropdown (same visibility rule). |
| GET | `/api/treks/<id>` | Any | Trek details. Trekkers get 404 for non-Open treks unless they have a booking on it. |
| GET | `/api/treks/<id>/checklist` | Any | Packing list: default items for the trek's difficulty + trek-specific items, grouped by category (Documents, Clothing, Gear, Health), essentials first. |
| GET | `/api/treks/<id>/reviews?page=` | Any | Visible reviews, newest first, plus `avg_rating` and `review_count`. Paginated. |

## Bookings (`routes/booking_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| POST | `/api/bookings` | user | Body: `{trek_id}`. Checks in order: trek exists (404) → is Open (400) → not blacklisted (403) → no active booking already (409) → seat available (409, "join the waitlist"). Holds the seat with `payment_status: Pending`; response includes `payment_due_at` (30 min). Unpaid bookings are auto-cancelled. |
| PUT | `/api/bookings/<id>/cancel` | user | Cancel your own Booked booking before the trek starts. Paid → Refunded (+ a Refunded payment record). The freed seat goes to waitlist position 1 in the same transaction. Emails the user. 404 for someone else's booking. |

## User / trekker (`routes/user_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/user/dashboard` | user | Upcoming bookings (with trek details) + up to 4 open treks. |
| GET | `/api/user/bookings?status=&page=` | user | My bookings with trek details. Paginated. |
| GET | `/api/user/bookings/<id>` | user | One of my bookings with trek and payment attempts (Checkout). |
| GET | `/api/user/history?page=` | user | My Completed and Cancelled bookings with trek details. Paginated. |
| GET | `/api/user/profile` | user | My profile. |
| PUT | `/api/user/profile` | user | Update `full_name`, `contact_number`; to change password send `new_password` + `current_password`. A password change logs out other devices and returns a new `token`. |
| POST | `/api/user/export` | user | Start the bookings CSV export (Celery) → 202 `{task_id}`. |
| GET | `/api/user/bookings/<id>/certificate` | user | Completion certificate PDF for your own Completed booking. `certificate_no` (TMA-YYYY-NNNNNN) is issued on first download and kept. |
| GET | `/api/user/waitlist` | user | My waitlist entries (Waiting first) with positions. |

## Payments (`routes/payment_routes.py`) – simulated

| Method | URL | Role | Purpose |
|---|---|---|---|
| POST | `/api/payments` | user | Body: `{booking_id, method: UPI\|Card\|NetBanking, card_number}` (card number only for Card). ~1 s "processing". Success → 201, Payment(Success), booking Paid, notification + email. A card ending in `0000` is declined → 402, Payment(Failed), booking stays Pending so you can retry. Paying twice → 409. After the 30-minute window → 400 and the seat is released. |

## Waitlist (`routes/waitlist_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| POST | `/api/treks/<id>/waitlist` | user | Join. Only when the trek is Open and has 0 free seats, and you have no active booking and aren't already waiting (409). Returns your `position`. |
| DELETE | `/api/treks/<id>/waitlist` | user | Leave; everyone behind you moves up. |
| GET | `/api/staff/treks/<id>/waitlist` | staff | Who is waiting, in order (assigned staff only, else 403). |

When a seat frees up (cancellation, auto-cancel, or staff/admin adding seats or reopening), position 1 gets a Booked + Pending booking with the usual 30-minute payment window, a notification and an email.

## Reviews (`routes/review_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| POST | `/api/reviews` | user | Body: `{booking_id, rating 1-5, comment ≤ 500}`. Only your own **Completed** booking (400 otherwise), one review per booking (409). |

(Listing per trek and admin moderation are in the Treks and Admin tables.)

## Notifications (`routes/notification_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/notifications?page=` | Any | My notifications, newest first, plus `unread`. Paginated. |
| GET | `/api/notifications/unread-count` | Any | `{unread}` for the bell badge. |
| PUT | `/api/notifications/<id>/read` | Any | Mark one as read (404 if not yours). |
| PUT | `/api/notifications/read-all` | Any | Mark all as read. |

Created on: seat held, payment success/failure, booking cancelled (incl. auto-cancel), waitlist joined/promoted/closed, trek status changed by staff (to everyone booked), trek completed, staff assigned to a trek, review hidden.

## Background jobs (`routes/task_routes.py`, Celery)

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/tasks/<task_id>` | Any | Job status: `PENDING` / `SUCCESS` / `FAILURE`, plus `download_url` for a finished export. Only the owner (or an admin) sees a result. |
| GET | `/api/exports/<filename>` | user | Download your own CSV export (other users: 404). Files are not reachable via `/static`. |

Scheduled (Celery beat, Asia/Kolkata): daily reminder 18:00 · auto-cancel unpaid bookings every 10 min · monthly report 1st of the month 09:00.

