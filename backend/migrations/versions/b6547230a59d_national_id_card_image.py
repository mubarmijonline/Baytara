"""national id card image

Revision ID: b6547230a59d
Revises: f9c795dfdc18
Create Date: 2026-08-16 22:22:13.656398

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b6547230a59d'
down_revision = 'f9c795dfdc18'
branch_labels = None
depends_on = None


def upgrade():
    # Its own revision rather than an edit to f9c795dfdc18: that one had already run
    # against production, so a column added to it would never have been applied.
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("national_id_image", sa.String(length=500), nullable=True))


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("national_id_image")
