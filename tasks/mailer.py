"""
Email sending (Flask-Mail) and email template rendering.

Locally everything goes to MailHog (SMTP localhost:1025, inbox at
http://localhost:8025). For real email, set the MAIL_* values in .env.
"""
import os

from flask_mail import Message
from jinja2 import Environment, FileSystemLoader, select_autoescape

from extensions import mail

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")

# Separate Jinja environment for email/report templates (tasks/templates/),
# with autoescaping so names/notes typed by users can't inject HTML.
_templates = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(["html"]),
)


def render(template_name, **context):
    return _templates.get_template(template_name).render(**context)


def send_email(to, subject, html, attachments=None):
    """
    to:          one address or a list of addresses
    attachments: list of (filename, content_type, data_bytes)
    """
    recipients = [to] if isinstance(to, str) else list(to)
    message = Message(subject=subject, recipients=recipients, html=html)
    for filename, content_type, data in attachments or []:
        message.attach(filename, content_type, data)
    mail.send(message)
