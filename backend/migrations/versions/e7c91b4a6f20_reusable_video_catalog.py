"""reusable video catalog and fixed taxonomy

Revision ID: e7c91b4a6f20
Revises: 49ad88f02a93
Create Date: 2026-07-31
"""
from alembic import op
import sqlalchemy as sa


revision = "e7c91b4a6f20"
down_revision = "49ad88f02a93"
branch_labels = None
depends_on = None


FIXED_CATEGORIES = (
    ("large-animals", "الحيوانات الكبيرة - الأبقار والأغنام", "Large animals - Cattle & Sheep"),
    ("equine", "الخيول", "Equine"),
    ("pet-animals", "الحيوانات الأليفة", "Pet animals"),
    ("poultry", "الدواجن والطيور", "Poultry"),
    ("fish-other-animal-sources", "الأسماك أو أي مصدر حيواني آخر", "Fish and other animal sources"),
    ("camel", "الجمال", "Camel"),
)


def _upsert_fixed_categories():
    connection = op.get_bind()
    update = sa.text(
        "UPDATE categories SET name = :name, name_en = :name_en, sort_order = :sort_order, "
        "is_fixed = :is_fixed WHERE slug = :slug"
    )
    insert = sa.text(
        "INSERT INTO categories (name, name_en, slug, sort_order, is_fixed) "
        "VALUES (:name, :name_en, :slug, :sort_order, :is_fixed)"
    )
    for sort_order, (slug, name, name_en) in enumerate(FIXED_CATEGORIES):
        values = {
            "slug": slug,
            "name": name,
            "name_en": name_en,
            "sort_order": sort_order,
            "is_fixed": True,
        }
        if connection.execute(update, values).rowcount == 0:
            connection.execute(insert, values)


def _abort_for_duplicate_vdocipher_ids():
    duplicates = op.get_bind().execute(sa.text(
        "SELECT vdocipher_video_id, COUNT(*) AS duplicate_count "
        "FROM lessons WHERE vdocipher_video_id IS NOT NULL "
        "GROUP BY vdocipher_video_id HAVING COUNT(*) > 1 "
        "ORDER BY vdocipher_video_id"
    )).all()
    if duplicates:
        details = ", ".join(f"{video_id} ({count})" for video_id, count in duplicates)
        raise RuntimeError(
            "Cannot add uq_lessons_vdocipher_video_id: duplicate VdoCipher IDs detected: "
            f"{details}. Resolve duplicate provider IDs before retrying this migration."
        )


def upgrade():
    _abort_for_duplicate_vdocipher_ids()

    with op.batch_alter_table("categories", schema=None) as batch_op:
        batch_op.add_column(sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False))
        batch_op.add_column(sa.Column("is_fixed", sa.Boolean(), server_default=sa.false(), nullable=False))

    with op.batch_alter_table("lessons", schema=None) as batch_op:
        batch_op.add_column(sa.Column("description", sa.Text(), server_default="", nullable=False))
        batch_op.add_column(sa.Column("category_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("price", sa.Numeric(10, 2), server_default=sa.text("0"), nullable=False))
        batch_op.add_column(sa.Column("currency", sa.String(length=3), server_default="EGP", nullable=False))
        batch_op.add_column(sa.Column("access_days", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("access_type", sa.String(length=20), server_default="general", nullable=False))
        batch_op.add_column(sa.Column("status", sa.String(length=20), server_default="draft", nullable=False))
        batch_op.add_column(sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index(batch_op.f("ix_lessons_category_id"), ["category_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_lessons_access_type"), ["access_type"], unique=False)
        batch_op.create_index(batch_op.f("ix_lessons_status"), ["status"], unique=False)
        batch_op.create_foreign_key("fk_lessons_category_id_categories", "categories", ["category_id"], ["id"])
        batch_op.create_unique_constraint("uq_lessons_vdocipher_video_id", ["vdocipher_video_id"])

    op.create_table(
        "course_videos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("video_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "video_id", name="uq_course_video"),
    )
    with op.batch_alter_table("course_videos", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_course_videos_course_id"), ["course_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_course_videos_video_id"), ["video_id"], unique=False)

    op.create_table(
        "bundle_videos",
        sa.Column("bundle_id", sa.Integer(), nullable=False),
        sa.Column("video_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["bundle_id"], ["bundles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("bundle_id", "video_id"),
    )

    with op.batch_alter_table("bundles", schema=None) as batch_op:
        batch_op.add_column(sa.Column("access_type", sa.String(length=20), server_default="general", nullable=False))
        batch_op.create_index(batch_op.f("ix_bundles_access_type"), ["access_type"], unique=False)

    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("video_id", sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f("ix_payments_video_id"), ["video_id"], unique=False)
        batch_op.create_foreign_key("fk_payments_video_id_lessons", "lessons", ["video_id"], ["id"])

    op.create_table(
        "video_entitlements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("video_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="purchase"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["video_id"], ["lessons.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "video_id", name="uq_video_entitlement_user_video"),
    )
    with op.batch_alter_table("video_entitlements", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_video_entitlements_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_video_entitlements_video_id"), ["video_id"], unique=False)

    _upsert_fixed_categories()
    op.execute(
        "INSERT INTO course_videos (course_id, video_id, position) "
        "SELECT course_id, id, position FROM lessons WHERE course_id IS NOT NULL"
    )


def downgrade():
    with op.batch_alter_table("video_entitlements", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_video_entitlements_video_id"))
        batch_op.drop_index(batch_op.f("ix_video_entitlements_user_id"))
    op.drop_table("video_entitlements")

    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.drop_constraint("fk_payments_video_id_lessons", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_payments_video_id"))
        batch_op.drop_column("video_id")

    with op.batch_alter_table("bundles", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_bundles_access_type"))
        batch_op.drop_column("access_type")

    op.drop_table("bundle_videos")

    with op.batch_alter_table("course_videos", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_course_videos_video_id"))
        batch_op.drop_index(batch_op.f("ix_course_videos_course_id"))
    op.drop_table("course_videos")

    with op.batch_alter_table("lessons", schema=None) as batch_op:
        batch_op.drop_constraint("uq_lessons_vdocipher_video_id", type_="unique")
        batch_op.drop_constraint("fk_lessons_category_id_categories", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_lessons_status"))
        batch_op.drop_index(batch_op.f("ix_lessons_access_type"))
        batch_op.drop_index(batch_op.f("ix_lessons_category_id"))
        batch_op.drop_column("updated_at")
        batch_op.drop_column("created_at")
        batch_op.drop_column("status")
        batch_op.drop_column("access_type")
        batch_op.drop_column("access_days")
        batch_op.drop_column("currency")
        batch_op.drop_column("price")
        batch_op.drop_column("category_id")
        batch_op.drop_column("description")

    with op.batch_alter_table("categories", schema=None) as batch_op:
        batch_op.drop_column("is_fixed")
        batch_op.drop_column("sort_order")
