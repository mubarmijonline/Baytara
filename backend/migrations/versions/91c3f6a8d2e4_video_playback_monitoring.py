"""add video playback monitoring

Revision ID: 91c3f6a8d2e4
Revises: 6b8c21f43d7a
"""

from alembic import op
import sqlalchemy as sa


revision = "91c3f6a8d2e4"
down_revision = "6b8c21f43d7a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "video_playback_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("video_id", sa.Integer(), nullable=True),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("video_title", sa.String(length=200), nullable=False),
        sa.Column("category_slug", sa.String(length=140), nullable=True),
        sa.Column("course_title", sa.String(length=200), nullable=True),
        sa.Column("access_type", sa.String(length=20), nullable=False),
        sa.Column("viewer_name", sa.String(length=120), nullable=True),
        sa.Column("viewer_email", sa.String(length=255), nullable=True),
        sa.Column("viewer_phone", sa.String(length=40), nullable=True),
        sa.Column("device_id", sa.String(length=80), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.String(length=80), nullable=True),
        sa.Column("current_position_seconds", sa.Integer(), nullable=False),
        sa.Column("max_position_seconds", sa.Integer(), nullable=False),
        sa.Column("watched_seconds", sa.Integer(), nullable=False),
        sa.Column("covered_seconds", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("completion_percent", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_played_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["video_id"], ["lessons.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_id"),
    )
    for column in (
        "access_type", "category_slug", "device_id", "ip_address", "last_event_at",
        "public_id", "reason", "started_at", "status", "user_id", "video_id",
        "course_id", "viewer_email",
    ):
        op.create_index(
            f"ix_video_playback_sessions_{column}",
            "video_playback_sessions",
            [column],
            unique=column == "public_id",
        )

    op.create_table(
        "video_playback_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("client_event_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("position_seconds", sa.Integer(), nullable=True),
        sa.Column("watched_seconds", sa.Integer(), nullable=True),
        sa.Column("covered_seconds", sa.Integer(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["video_playback_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_event_id"),
    )
    for column in ("client_event_id", "created_at", "event_type", "session_id"):
        op.create_index(
            f"ix_video_playback_events_{column}",
            "video_playback_events",
            [column],
            unique=column == "client_event_id",
        )


def downgrade():
    for column in ("client_event_id", "created_at", "event_type", "session_id"):
        op.drop_index(f"ix_video_playback_events_{column}", table_name="video_playback_events")
    op.drop_table("video_playback_events")

    for column in (
        "access_type", "category_slug", "device_id", "ip_address", "last_event_at",
        "public_id", "reason", "started_at", "status", "user_id", "video_id",
        "course_id", "viewer_email",
    ):
        op.drop_index(f"ix_video_playback_sessions_{column}", table_name="video_playback_sessions")
    op.drop_table("video_playback_sessions")
