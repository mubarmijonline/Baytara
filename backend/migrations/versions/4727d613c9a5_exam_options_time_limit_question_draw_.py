"""exam options: time limit, question draw, shown results and per-question explanations

Autogenerate again proposed dropping the same four unique constraints and reshaping the
`user_devices` index. That is the pre-existing model/schema drift already noted on the
promo-codes migration, not part of this change, and dropping uniqueness on certificate
serials would let two certificates claim one number. Removed here for the same reason.

Revision ID: 4727d613c9a5
Revises: 69888ed00e7f
"""
from alembic import op
import sqlalchemy as sa


revision = '4727d613c9a5'
down_revision = '69888ed00e7f'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('course_exams', schema=None) as batch_op:
        batch_op.add_column(sa.Column('time_limit_minutes', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('questions_per_attempt', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('show_results', sa.Boolean(),
                                      server_default='false', nullable=False))

    with op.batch_alter_table('exam_questions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('explanation', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('explanation_en', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('exam_questions', schema=None) as batch_op:
        batch_op.drop_column('explanation_en')
        batch_op.drop_column('explanation')

    with op.batch_alter_table('course_exams', schema=None) as batch_op:
        batch_op.drop_column('show_results')
        batch_op.drop_column('questions_per_attempt')
        batch_op.drop_column('time_limit_minutes')
