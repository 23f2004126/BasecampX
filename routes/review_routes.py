"""
Reviews.

POST   /api/reviews                      (trekker) review your own Completed booking, once
GET    /api/treks/<id>/reviews           (anyone logged in) visible reviews + average
GET    /api/admin/reviews                (admin) all reviews, filter ?hidden=&trek_id=
PUT    /api/admin/reviews/<id>/hide      (admin) hide (author is notified)
PUT    /api/admin/reviews/<id>/unhide    (admin)
DELETE /api/admin/reviews/<id>           (admin)

Hidden reviews don't count towards a trek's avg_rating / review_count.
"""
from flask import Blueprint, abort, jsonify
from flask_security import current_user
from sqlalchemy.exc import IntegrityError

from extensions import db
from models import ROLE_ADMIN, ROLE_USER, Booking, Review, Trek
from utils.cache import clear_trek_cache
from utils.decorators import role_required, token_required
from utils.notify import notify
from utils.pagination import paginate
from utils.validators import arg_choice, arg_int, json_body, to_int, validation_error

review_bp = Blueprint("reviews", __name__, url_prefix="/api")

MAX_COMMENT = 500


@review_bp.route("/reviews", methods=["POST"])
@role_required(ROLE_USER)
def create_review():
    data = json_body()
    errors = {}
    booking_id = to_int(data.get("booking_id"))
    rating = to_int(data.get("rating"), minimum=1)
    comment = data.get("comment") if isinstance(data.get("comment"), str) else ""
    comment = comment.strip()
    if booking_id is None:
        errors["booking_id"] = "A valid booking_id is required."
    if rating is None or rating > 5:
        errors["rating"] = "Rating must be a whole number from 1 to 5."
    if len(comment) > MAX_COMMENT:
        errors["comment"] = f"Keep it under {MAX_COMMENT} characters."
    if errors:
        return validation_error(errors)

    booking = db.session.get(Booking, booking_id)
    if booking is None or booking.user_id != current_user.id:
        abort(404, description="Booking not found.")
    if booking.status != "Completed":
        abort(400, description="You can review a trek once you've completed it.")
    if booking.review:
        abort(409, description="You've already reviewed this trek.")

    review = Review(user_id=current_user.id, trek_id=booking.trek_id, booking_id=booking.id,
                    rating=rating, comment=comment or None)
    db.session.add(review)
    try:
        db.session.commit()
    except IntegrityError:  # unique booking_id: a simultaneous second submit
        db.session.rollback()
        abort(409, description="You've already reviewed this trek.")
    clear_trek_cache(booking.trek_id)  # avg_rating is part of the cached trek data
    return jsonify({"message": "Thanks for your review!", "review": review.to_dict()}), 201


@review_bp.route("/treks/<int:trek_id>/reviews", methods=["GET"])
@token_required
def trek_reviews(trek_id):
    trek = db.get_or_404(Trek, trek_id, description="Trek not found.")
    query = Review.query.filter_by(trek_id=trek.id, is_hidden=False).order_by(Review.created_at.desc())
    page = paginate(query)
    page["avg_rating"], page["review_count"] = trek.rating_summary()
    return jsonify(page)


# ---------------------------------------------------------------------------
# Admin moderation
# ---------------------------------------------------------------------------
@review_bp.route("/admin/reviews", methods=["GET"])
@role_required(ROLE_ADMIN)
def admin_reviews():
    query = Review.query
    hidden = arg_choice("hidden", ("true", "false"))
    trek_id = arg_int("trek_id")
    if hidden:
        query = query.filter(Review.is_hidden.is_(hidden == "true"))
    if trek_id:
        query = query.filter(Review.trek_id == trek_id)
    return jsonify(paginate(query.order_by(Review.created_at.desc())))


def set_hidden(review_id, hidden):
    review = db.get_or_404(Review, review_id, description="Review not found.")
    if review.is_hidden != hidden:
        review.is_hidden = hidden
        if hidden:
            notify(review.user_id, "Review hidden",
                   f"Your review of {review.trek.name} was hidden by an admin for not meeting our guidelines.",
                   "system", "/user/history")
        db.session.commit()
        clear_trek_cache(review.trek_id)
    return jsonify({"message": f"Review {'hidden' if hidden else 'visible again'}.", "review": review.to_dict()})


@review_bp.route("/admin/reviews/<int:review_id>/hide", methods=["PUT"])
@role_required(ROLE_ADMIN)
def hide_review(review_id):
    return set_hidden(review_id, True)


@review_bp.route("/admin/reviews/<int:review_id>/unhide", methods=["PUT"])
@role_required(ROLE_ADMIN)
def unhide_review(review_id):
    return set_hidden(review_id, False)


@review_bp.route("/admin/reviews/<int:review_id>", methods=["DELETE"])
@role_required(ROLE_ADMIN)
def delete_review(review_id):
    review = db.get_or_404(Review, review_id, description="Review not found.")
    trek_id = review.trek_id
    db.session.delete(review)
    db.session.commit()
    clear_trek_cache(trek_id)
    return jsonify({"message": "Review deleted."})
