"""add local English video descriptions

Revision ID: 0d7e3f9a1c42
Revises: e7c91b4a6f20
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa


revision = "0d7e3f9a1c42"
down_revision = "e7c91b4a6f20"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("lessons", schema=None) as batch_op:
        batch_op.add_column(sa.Column("description_en", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("lessons", schema=None) as batch_op:
        batch_op.drop_column("description_en")
