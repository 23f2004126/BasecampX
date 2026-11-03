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
| GET | `/api/admin/reports` | admin | Chart data `{labels, data}`: `bookings_per_trek` (top 5), `bookings_per_month` (last 6), `treks_by_status`, `users_by_difficulty`. Cancelled bookings excluded. |

## Staff (`routes/staff_routes.py`)

Every endpoint with a trek `<id>` returns **403** unless `trek.staff_id` is the logged-in staff member.

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/staff/dashboard` | staff | Assigned-trek count, total participants, ongoing treks. |
| GET | `/api/staff/treks?page=` | staff | My assigned treks, each with `participant_count`. Paginated. |
| GET | `/api/staff/treks/<id>` | staff | Trek details + participant list (name, email, phone, booking/payment status). |
| PUT | `/api/staff/treks/<id>` | staff | Body: `available_slots` and/or `status` (`Open`/`Closed` only, trek must be Approved/Open/Closed). Slots must be 0…(total − booked). |
| PUT | `/api/staff/treks/<id>/start` | staff | Open/Closed → **Ongoing**. |
| PUT | `/api/staff/treks/<id>/complete` | staff | Ongoing → **Completed**; all its Booked bookings become Completed. |

## Treks (`routes/trek_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/treks?search=&difficulty=&location=&min_days=&max_days=&page=` | Any | Browse treks. Trekkers see **Open** only; admin/staff see all and may add `&status=`. Paginated. |
| GET | `/api/treks/locations` | Any | Distinct locations for the filter dropdown (same visibility rule). |
| GET | `/api/treks/<id>` | Any | Trek details. Trekkers get 404 for non-Open treks unless they have a booking on it. |

## Bookings (`routes/booking_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| POST | `/api/bookings` | user | Body: `{trek_id}`. Checks in order: trek exists (404) → is Open (400) → not blacklisted (403) → no active booking already (409) → seat available (409). Amount = trek price; slot decremented atomically. |
| PUT | `/api/bookings/<id>/cancel` | user | Cancel your own Booked booking before the trek starts. Restores one slot, sets `cancelled_at`, Paid → Refunded. 404 for someone else's booking. |

## User / trekker (`routes/user_routes.py`)

| Method | URL | Role | Purpose |
|---|---|---|---|
| GET | `/api/user/dashboard` | user | Upcoming bookings (with trek details) + up to 4 open treks. |
| GET | `/api/user/bookings?status=&page=` | user | My bookings with trek details. Paginated. |
| GET | `/api/user/history?page=` | user | My Completed and Cancelled bookings with trek details. Paginated. |
| GET | `/api/user/profile` | user | My profile. |
| PUT | `/api/user/profile` | user | Update `full_name`, `contact_number`; to change password send `new_password` + `current_password`. A password change logs out other devices and returns a new `token`. |
