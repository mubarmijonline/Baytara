"""self-hosted video source on lessons

Revision ID: c41d90ab7e52
Revises: 8d2f5ab71c09
Create Date: 2026-08-12 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c41d90ab7e52'
down_revision = '8d2f5ab71c09'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source', sa.String(length=20), nullable=False,
                                      server_default='vdocipher'))
        batch_op.add_column(sa.Column('local_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('local_error', sa.String(length=200), nullable=True))
        batch_op.create_index(batch_op.f('ix_lessons_source'), ['source'], unique=False)


def downgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lessons_source'))
        batch_op.drop_column('local_error')
        batch_op.drop_column('local_status')
        batch_op.drop_column('source')
