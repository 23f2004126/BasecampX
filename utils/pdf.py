"""
HTML -> PDF with xhtml2pdf (pure Python, no browser needed).

xhtml2pdf understands HTML tables and basic CSS (colours, borders, padding,
fonts) but not flexbox/grid or CSS variables, so PDF templates use tables.
"""
from io import BytesIO

from xhtml2pdf import pisa


class PdfError(RuntimeError):
    pass


def html_to_pdf(html):
    """Return the PDF as bytes. Raises PdfError if the HTML could not be converted."""
    buffer = BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer, encoding="utf-8")
    if result.err:
        raise PdfError(f"PDF generation failed with {result.err} error(s).")
    return buffer.getvalue()
