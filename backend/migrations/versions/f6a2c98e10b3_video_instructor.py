"""video instructor

Every video now credits a presenter. Nullable in the schema because existing rows
predate the column; the admin API requires it on create and update from here on.

Revision ID: f6a2c98e10b3
Revises: e3b9d70c41f8
Create Date: 2026-08-15 20:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6a2c98e10b3'
down_revision = 'e3b9d70c41f8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('instructor_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_lessons_instructor_id'), ['instructor_id'], unique=False)
        batch_op.create_foreign_key('fk_lessons_instructor', 'users', ['instructor_id'], ['id'])

    # Videos already attached to a course inherit that course's instructor, so the
    # existing library is not left uncredited.
    op.execute("""
        UPDATE lessons SET instructor_id = courses.instructor_id
        FROM course_videos, courses
        WHERE course_videos.video_id = lessons.id
          AND course_videos.course_id = courses.id
          AND lessons.instructor_id IS NULL
    """)


def downgrade():
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.drop_constraint('fk_lessons_instructor', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_lessons_instructor_id'))
        batch_op.drop_column('instructor_id')
