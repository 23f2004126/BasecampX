"""
Pagination for list endpoints:  ?page=2&per_page=10

Every paginated response has the same shape:
    {"items": [...], "page": 2, "per_page": 10, "total": 37, "pages": 4}
"""
from utils.validators import arg_int

DEFAULT_PER_PAGE = 10
MAX_PER_PAGE = 100


def paginate(query, serialize=lambda obj: obj.to_dict()):
    page = arg_int("page", minimum=1, default=1)
    per_page = min(arg_int("per_page", minimum=1, default=DEFAULT_PER_PAGE), MAX_PER_PAGE)

    # error_out=False: a page past the end returns an empty list instead of 404
    result = query.paginate(page=page, per_page=per_page, error_out=False)
    return {
        "items": [serialize(item) for item in result.items],
        "page": result.page,
        "per_page": result.per_page,
        "total": result.total,
        "pages": result.pages,
    }
