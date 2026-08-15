"""course metadata

Objectives, level, certificate flag, an updated_at stamp, and the running review
counters. The course page rendered all of this from mock data before.

Revision ID: b5e2f81ac934
Revises: a1c7f4e93d20
Create Date: 2026-08-15 15:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b5e2f81ac934'
down_revision = 'a1c7f4e93d20'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('objectives', sa.JSON(), nullable=False, server_default='[]'))
        batch_op.add_column(sa.Column('objectives_en', sa.JSON(), nullable=False, server_default='[]'))
        batch_op.add_column(sa.Column('level', sa.String(length=20), nullable=False, server_default='beginner'))
        batch_op.add_column(sa.Column('has_certificate', sa.Boolean(), nullable=False, server_default='false'))
        batch_op.add_column(sa.Column('rating_sum', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('rating_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index(batch_op.f('ix_courses_level'), ['level'], unique=False)

    # Existing rows have never been edited since creation, so that is their honest stamp.
    op.execute('UPDATE courses SET updated_at = created_at WHERE updated_at IS NULL')


def downgrade():
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_courses_level'))
        batch_op.drop_column('updated_at')
        batch_op.drop_column('rating_count')
        batch_op.drop_column('rating_sum')
        batch_op.drop_column('has_certificate')
        batch_op.drop_column('level')
        batch_op.drop_column('objectives_en')
        batch_op.drop_column('objectives')
