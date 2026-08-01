"""store provider poster on canonical videos

Revision ID: 6b8c21f43d7a
Revises: 0d7e3f9a1c42
"""

from alembic import op
import sqlalchemy as sa


revision = "6b8c21f43d7a"
down_revision = "0d7e3f9a1c42"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("lessons", schema=None) as batch_op:
        batch_op.add_column(sa.Column("poster", sa.String(length=1000), nullable=True))


def downgrade():
    with op.batch_alter_table("lessons", schema=None) as batch_op:
        batch_op.drop_column("poster")
