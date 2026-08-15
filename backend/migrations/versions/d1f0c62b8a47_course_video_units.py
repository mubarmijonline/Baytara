"""per-course units for reusable videos

A video can be assigned to several courses, so which unit it sits in is a property of
the assignment, not of the video. Grouping by lessons.module_id would force one global
unit on every course that reuses it.

Revision ID: d1f0c62b8a47
Revises: c8d4a1b70e55
Create Date: 2026-08-15 16:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1f0c62b8a47'
down_revision = 'c8d4a1b70e55'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('course_videos', schema=None) as batch_op:
        batch_op.add_column(sa.Column('module_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_course_videos_module_id'), ['module_id'], unique=False)
        batch_op.create_foreign_key('fk_course_videos_module', 'course_modules', ['module_id'], ['id'],
                                    ondelete='SET NULL')

    # Carry over any grouping the legacy lesson-level column already expressed, but only
    # where the module actually belongs to the same course.
    op.execute("""
        UPDATE course_videos SET module_id = lessons.module_id
        FROM lessons, course_modules
        WHERE course_videos.video_id = lessons.id
          AND lessons.module_id = course_modules.id
          AND course_modules.course_id = course_videos.course_id
    """)


def downgrade():
    with op.batch_alter_table('course_videos', schema=None) as batch_op:
        batch_op.drop_constraint('fk_course_videos_module', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_course_videos_module_id'))
        batch_op.drop_column('module_id')
