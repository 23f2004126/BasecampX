import os

from flask import Flask, render_template, request
from flask_security import SQLAlchemyUserDatastore
from werkzeug.exceptions import HTTPException

from config import Config
from extensions import cache, db, mail, security
from utils.decorators import json_error


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Make sure the instance/ folder exists (the SQLite file lives there)
    os.makedirs(os.path.join(app.root_path, "instance"), exist_ok=True)

    # Attach the extensions to this app
    db.init_app(app)
    cache.init_app(app)
    mail.init_app(app)

    # ---------- Flask-Security ----------
    # Imported here (not at the top) so models load only after db exists.
    from models import Role, User

    # The datastore tells Flask-Security which models hold users and roles.
    user_datastore = SQLAlchemyUserDatastore(db, User, Role)
    # register_blueprint=False: don't add Flask-Security's built-in
    # /login, /register, /logout views. We use our own JSON API instead.
    security.init_app(app, user_datastore, register_blueprint=False)
    register_auth_error_handlers()

    # Register blueprints (imported here, inside the function, to avoid circular imports)
    from routes.admin_routes import admin_bp
    from routes.auth_routes import auth_bp
    from routes.booking_routes import booking_bp
    from routes.staff_routes import staff_bp
    from routes.trek_routes import trek_bp
    from routes.user_routes import user_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(booking_bp)
    app.register_blueprint(staff_bp)
    app.register_blueprint(trek_bp)
    app.register_blueprint(user_bp)

    register_api_error_handlers(app)

    @app.route("/")
    def index():
        return render_template("index.html")

    return app


def register_auth_error_handlers():
    """Make Flask-Security's failures return JSON instead of redirects/HTML."""

    @security.unauthn_handler
    def unauthenticated(mechanisms=None, headers=None):
        # No token, an expired token, or a token from before logout
        return json_error("Authentication required. Please log in.", 401)

    @security.unauthz_handler
    def unauthorized(func_name=None, params=None):
        # Logged in, but missing the required role
        return json_error("You do not have permission to access this resource.", 403)


def register_api_error_handlers(app):
    """Any HTTP error under /api (404, 405, 500...) is returned as JSON."""

    @app.errorhandler(HTTPException)
    def handle_http_error(err):
        if request.path.startswith("/api"):
            return json_error(err.description, err.code)
        return err

    @app.errorhandler(Exception)
    def handle_unexpected_error(err):
        app.logger.exception("Unhandled error")
        if request.path.startswith("/api"):
            return json_error("Internal server error.", 500)
        raise err


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True)
