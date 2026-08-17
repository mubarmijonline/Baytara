"""Veterinary student status and the document-judged verification routes

Revision ID: c1d84f2a7b93
Revises: b6547230a59d
Create Date: 2026-08-17

A veterinary student is not a veterinarian, so they get their own flag rather than
sharing the doctor's badge. Requests grow three columns recording which door the
applicant came through, what a model made of their document, and what was granted —
kept so an automatic decision can be reviewed and undone.
"""
from alembic import op
import sqlalchemy as sa

revision = "c1d84f2a7b93"
down_revision = "b6547230a59d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("is_vet_student", sa.Boolean(), nullable=False,
                                     server_default=sa.text("false")))
    op.add_column("baytarian_requests", sa.Column("route", sa.String(length=20),
                                                  nullable=False, server_default="manual"))
    op.add_column("baytarian_requests", sa.Column("ai_verdict", sa.JSON(), nullable=True))
    op.add_column("baytarian_requests", sa.Column("grant", sa.String(length=20), nullable=True))
    # Everything already approved was approved as a veterinarian, whether by the card
    # parser or by an admin; leaving grant null would make revoke guess.
    op.execute("UPDATE baytarian_requests SET grant = 'baytarian' WHERE status = 'approved'")
    op.execute("UPDATE baytarian_requests SET route = 'syndicate_card' WHERE card_front IS NOT NULL")


def downgrade():
    op.drop_column("baytarian_requests", "grant")
    op.drop_column("baytarian_requests", "ai_verdict")
    op.drop_column("baytarian_requests", "route")
    op.drop_column("users", "is_vet_student")
