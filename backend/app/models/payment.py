from datetime import datetime, timezone

from ..extensions import db

PAYMENT_STATUSES = ("pending", "approved", "rejected")


def _now():
    return datetime.now(timezone.utc)


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
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
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

    def to_dict(self, admin=False):
        d = {
            "id": self.id,
            "course_id": self.course_id,
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
