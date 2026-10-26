"""sonar_exams: the reproductive ultrasound calculator's saved cases

Written by hand: autogenerate is clean since d8f2a4c6e1b9, but every migration in this
project is read before it ships.

Revision ID: e5a1c9d3b7f2
Revises: d8f2a4c6e1b9
"""
from alembic import op
import sqlalchemy as sa


revision = 'e5a1c9d3b7f2'
down_revision = 'd8f2a4c6e1b9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sonar_exams',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(length=120), nullable=True),
        sa.Column('species', sa.String(length=20), nullable=False),
        sa.Column('measures', sa.JSON(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=False),
        sa.Column('exam_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('sonar_exams', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sonar_exams_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_sonar_exams_created_at'), ['created_at'], unique=False)


def downgrade():
    with op.batch_alter_table('sonar_exams', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sonar_exams_created_at'))
        batch_op.drop_index(batch_op.f('ix_sonar_exams_user_id'))
    op.drop_table('sonar_exams')
