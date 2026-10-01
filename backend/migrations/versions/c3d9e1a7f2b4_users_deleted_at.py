"""users.deleted_at: a learner can close their own account

Written by hand: autogenerate on this schema still proposes dropping unique constraints
(see the schema drift note in MILESTONES.md), which must not ride along here.

Revision ID: c3d9e1a7f2b4
Revises: b148cdf18f16
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3d9e1a7f2b4'
down_revision = 'b148cdf18f16'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('deleted_at')
