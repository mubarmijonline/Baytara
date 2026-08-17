"""course reviews

One review per learner per course, moderated publish-then-hide. The running totals
that back the average live on `courses` (added in b5e2f81ac934).

Revision ID: c8d4a1b70e55
Revises: b5e2f81ac934
Create Date: 2026-08-15 15:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8d4a1b70e55'
down_revision = 'b5e2f81ac934'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'course_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('rating', sa.SmallInteger(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='published'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'user_id', name='uq_course_review_user'),
    )
    with op.batch_alter_table('course_reviews', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_reviews_course_id'), ['course_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_reviews_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_reviews_status'), ['status'], unique=False)


def downgrade():
    with op.batch_alter_table('course_reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_reviews_status'))
        batch_op.drop_index(batch_op.f('ix_course_reviews_user_id'))
        batch_op.drop_index(batch_op.f('ix_course_reviews_course_id'))
    op.drop_table('course_reviews')
