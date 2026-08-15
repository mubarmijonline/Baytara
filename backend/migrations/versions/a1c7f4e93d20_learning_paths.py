"""learning paths

An ordered shelf of courses, shown as «مسارات» on the home page. A path has no price
and no access tier; the courses it points at keep their own gating.

Revision ID: a1c7f4e93d20
Revises: f7a3c8e21b40
Create Date: 2026-08-15 14:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1c7f4e93d20'
down_revision = 'f7a3c8e21b40'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'learning_paths',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('title_en', sa.String(length=200), nullable=True),
        sa.Column('slug', sa.String(length=220), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('description_en', sa.Text(), nullable=True),
        sa.Column('level', sa.String(length=20), nullable=False, server_default='beginner'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    with op.batch_alter_table('learning_paths', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_learning_paths_slug'), ['slug'], unique=True)
        batch_op.create_index(batch_op.f('ix_learning_paths_level'), ['level'], unique=False)
        batch_op.create_index(batch_op.f('ix_learning_paths_status'), ['status'], unique=False)

    op.create_table(
        'path_courses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('path_id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['path_id'], ['learning_paths.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('path_id', 'course_id', name='uq_path_course'),
    )
    with op.batch_alter_table('path_courses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_path_courses_path_id'), ['path_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_path_courses_course_id'), ['course_id'], unique=False)


def downgrade():
    with op.batch_alter_table('path_courses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_path_courses_course_id'))
        batch_op.drop_index(batch_op.f('ix_path_courses_path_id'))
    op.drop_table('path_courses')

    with op.batch_alter_table('learning_paths', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_learning_paths_status'))
        batch_op.drop_index(batch_op.f('ix_learning_paths_level'))
        batch_op.drop_index(batch_op.f('ix_learning_paths_slug'))
    op.drop_table('learning_paths')
