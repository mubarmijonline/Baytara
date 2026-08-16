"""vet card verification

Revision ID: f9c795dfdc18
Revises: 3a6f10face3f
Create Date: 2026-08-16 21:00:18.597653

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f9c795dfdc18'
down_revision = '3a6f10face3f'
branch_labels = None
depends_on = None


def upgrade():
    # The national ID is what ties a syndicate card to an account, so it is unique.
    # Nullable: almost nobody has one recorded yet, and an empty string would collide.
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("national_id", sa.String(length=14), nullable=True))
        batch_op.add_column(sa.Column("vet_registration_no", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("vet_license_no", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("vet_governorate", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("vet_card_expires_at", sa.Date(), nullable=True))
        batch_op.create_index("ix_users_national_id", ["national_id"], unique=True)

    # Evidence for a decision a machine made: both images, what Vision read, and the
    # verdict on every field, so an auto-approval can be re-examined or undone.
    with op.batch_alter_table("baytarian_requests", schema=None) as batch_op:
        batch_op.add_column(sa.Column("card_front", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("card_back", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("ocr_text", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("parsed", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("auto_approved", sa.Boolean(), nullable=False,
                                      server_default=sa.text("false")))
        batch_op.add_column(sa.Column("spot_check", sa.Boolean(), nullable=False,
                                      server_default=sa.text("false")))


def downgrade():
    with op.batch_alter_table("baytarian_requests", schema=None) as batch_op:
        for column in ("spot_check", "auto_approved", "parsed", "ocr_text", "card_back", "card_front"):
            batch_op.drop_column(column)
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_national_id")
        for column in ("vet_card_expires_at", "vet_governorate", "vet_license_no",
                       "vet_registration_no", "national_id"):
            batch_op.drop_column(column)
