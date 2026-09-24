from datetime import datetime, timezone

from ..extensions import db

PAYMENT_STATUSES = ("pending", "approved", "rejected")
PAYMENT_KINDS = ("enroll", "renewal", "bundle", "video")

# Fawaterak (gateway) payment lifecycle
FAWATERK_STATUSES = ("pending", "paid", "failed", "expired", "refunded", "partially_refunded")


def _now():
    return datetime.now(timezone.utc)


class Payment(db.Model):
    """A Fawaterak gateway payment. Created pending at checkout; confirmed by the
    verified webhook. Grant (enroll/renew/bundle) happens atomically on 'paid'."""

    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False, default="enroll")
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=True, index=True)
    bundle_id = db.Column(db.Integer, db.ForeignKey("bundles.id"), nullable=True, index=True)
    video_id = db.Column(db.Integer, db.ForeignKey("lessons.id"), nullable=True, index=True)

    amount = db.Column(db.Numeric(10, 2), nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="EGP")
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)

    gateway = db.Column(db.String(20), nullable=False, default="fawaterk")
    invoice_id = db.Column(db.String(40), index=True)     # Fawaterak invoice id
    invoice_key = db.Column(db.String(80))                # Fawaterak invoice key
    payment_method = db.Column(db.String(60))             # Visa / Fawry / wallet ...
    reference_number = db.Column(db.String(80))           # gateway reference
    pay_url = db.Column(db.String(500))                   # hosted checkout url

    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    paid_at = db.Column(db.DateTime(timezone=True))

    # Refunds are a recorded decision, not a transfer: there is no gateway refund call
    # here, so the money is returned by hand and this is the book that says how much
    # was agreed, by whom, and why.
    refunded_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")
    refunded_at = db.Column(db.DateTime(timezone=True))
    refunded_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    refund_reason = db.Column(db.Text)

    # What the buyer actually paid and what a code took off it. `amount` stays the charged
    # figure -- the one the gateway sees and the one a refund is measured against -- so the
    # list price is reconstructed as amount + discount rather than stored a third time.
    promo_code_id = db.Column(db.Integer, db.ForeignKey("promo_codes.id"), index=True)
    discount = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")

    promo = db.relationship("PromoCode")
    course = db.relationship("Course")
    bundle = db.relationship("Bundle")
    video = db.relationship("Lesson")

    def to_dict(self, admin=False):
        d = {
            "id": self.id, "kind": self.kind, "course_id": self.course_id, "bundle_id": self.bundle_id,
            "video_id": self.video_id,
            "amount": float(self.amount) if self.amount is not None else None,
            "currency": self.currency, "status": self.status,
            "payment_method": self.payment_method, "reference_number": self.reference_number,
            "invoice_id": self.invoice_id,
            "refunded_amount": float(self.refunded_amount or 0),
            "refunded_at": self.refunded_at.isoformat() if self.refunded_at else None,
            "refund_reason": self.refund_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }
        if admin:
            d.update(user_id=self.user_id, invoice_key=self.invoice_key, gateway=self.gateway)
        return d


class InstapayAccount(db.Model):
    """Whitelist of the center's own InstaPay handles/numbers (receiver validation)."""

    __tablename__ = "instapay_account"

    account_id = db.Column(db.Integer, primary_key=True)
    account_name = db.Column(db.String(160), nullable=False)
    number = db.Column(db.String(40))
    url = db.Column(db.String(200))
    active = db.Column(db.Boolean, nullable=False, default=True)

    def to_dict(self):
        return {
            "account_id": self.account_id,
            "account_name": self.account_name,
            "number": self.number,
            "url": self.url,
            "active": self.active,
        }


class InstapayPayment(db.Model):
    """A submitted InstaPay receipt awaiting admin approval. Finance = SQL only."""

    __tablename__ = "instapay_payments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    # enroll/renewal target a course; bundle purchase targets a bundle (course_id NULL).
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=True, index=True)
    bundle_id = db.Column(db.Integer, db.ForeignKey("bundles.id"), nullable=True, index=True)
    kind = db.Column(db.String(20), nullable=False, default="enroll", server_default="enroll", index=True)
    image_path = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)

    # parsed OCR fields
    reference = db.Column(db.String(40), index=True)
    transfer_amount = db.Column(db.Numeric(10, 2))
    total_amount = db.Column(db.Numeric(10, 2))
    fees = db.Column(db.Numeric(10, 2))
    currency = db.Column(db.String(3), nullable=False, default="EGP")
    tx_date_text = db.Column(db.String(60))
    note = db.Column(db.String(500))
    sender_name = db.Column(db.String(160))
    sender_account = db.Column(db.String(160))
    receiver_account = db.Column(db.String(160))
    receiver_hash = db.Column(db.String(160))
    transaction_approved = db.Column(db.String(40))
    ogs_account_found = db.Column(db.String(20))
    is_total_amount_correct = db.Column(db.Boolean)

    # admin review
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    reviewed_at = db.Column(db.DateTime(timezone=True))
    reject_reason = db.Column(db.String(300))
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    course = db.relationship("Course")
    bundle = db.relationship("Bundle")

    def to_dict(self, admin=False):
        d = {
            "id": self.id,
            "course_id": self.course_id,
            "bundle_id": self.bundle_id,
            "kind": self.kind,
            "status": self.status,
            "reference": self.reference,
            "transfer_amount": float(self.transfer_amount) if self.transfer_amount is not None else None,
            "total_amount": float(self.total_amount) if self.total_amount is not None else None,
            "fees": float(self.fees) if self.fees is not None else None,
            "currency": self.currency,
            "tx_date_text": self.tx_date_text,
            "transaction_approved": self.transaction_approved,
            "ogs_account_found": self.ogs_account_found,
            "is_total_amount_correct": self.is_total_amount_correct,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if admin:
            d.update(
                user_id=self.user_id,
                image_path=self.image_path,
                note=self.note,
                sender_name=self.sender_name,
                sender_account=self.sender_account,
                receiver_account=self.receiver_account,
                receiver_hash=self.receiver_hash,
                reject_reason=self.reject_reason,
            )
        return d


PROMO_KINDS = ("percent", "fixed")


class PromoCode(db.Model):
    """A discount code a marketing partner hands out.

    Deliberately has no redemption table. Usage is counted from the payments that actually
    succeeded, because a code should be spent when money changes hands and not when
    somebody opens a checkout page and wanders off. A separate ledger would have to be
    reconciled with `payments` on every abandoned session, every failure and every refund,
    and the two would drift.
    """

    __tablename__ = "promo_codes"

    id = db.Column(db.Integer, primary_key=True)
    # Stored upper-case and compared upper-case, so BAYTARA10 and baytara10 are one code
    # rather than two that quietly compete for the same usage cap.
    code = db.Column(db.String(40), unique=True, nullable=False, index=True)
    kind = db.Column(db.String(10), nullable=False, default="percent")
    # Percent of the price, or an amount in EGP, depending on `kind`.
    value = db.Column(db.Numeric(10, 2), nullable=False)

    # Who is handing it out. Free text on purpose: partners come and go faster than a
    # table of them would be maintained, and this only has to answer "whose code is this".
    partner = db.Column(db.String(160))
    note = db.Column(db.String(300))

    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    starts_at = db.Column(db.DateTime(timezone=True))
    expires_at = db.Column(db.DateTime(timezone=True))

    # Null means no ceiling. `per_user_limit` defaults to one: a discount meant to win a
    # new customer should not fund the same customer's whole catalogue.
    max_uses = db.Column(db.Integer)
    per_user_limit = db.Column(db.Integer, nullable=False, default=1, server_default="1")

    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def discount_for(self, amount):
        """The discount this code takes off `amount`, never more than the amount itself.

        Rounded to two decimals and floored at zero, so no arithmetic here can produce a
        negative charge or a fraction of a piastre the gateway would reject.
        """
        from decimal import Decimal, ROUND_HALF_UP

        base = Decimal(str(amount or 0))
        if base <= 0:
            return Decimal("0.00")
        raw = (base * Decimal(str(self.value)) / Decimal("100")) if self.kind == "percent" \
            else Decimal(str(self.value))
        capped = min(max(raw, Decimal("0")), base)
        return capped.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def to_dict(self, uses=None):
        d = {
            "id": self.id,
            "code": self.code,
            "kind": self.kind,
            "value": float(self.value),
            "partner": self.partner,
            "note": self.note,
            "is_active": self.is_active,
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "max_uses": self.max_uses,
            "per_user_limit": self.per_user_limit,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if uses is not None:
            d["uses"] = uses
        return d
