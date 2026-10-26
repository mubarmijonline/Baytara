from datetime import datetime, timezone

from ..extensions import db


def _now():
    return datetime.now(timezone.utc)


class SonarExam(db.Model):
    """One case from the reproductive ultrasound calculator (milestone 29), kept in the
    learner's own history. The result is stored as computed, so a later change to the
    formulas never rewrites what a vet already recorded."""

    __tablename__ = "sonar_exams"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    label = db.Column(db.String(120))          # "بقرة رقم 45"; optional
    species = db.Column(db.String(20), nullable=False)
    measures = db.Column(db.JSON, nullable=False)   # {measure: mm}
    result = db.Column(db.JSON, nullable=False)     # services.sonar.estimate()
    exam_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_now, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "species": self.species,
            "measures": self.measures,
            "result": self.result,
            "exam_date": self.exam_date.isoformat() if self.exam_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
