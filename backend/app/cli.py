import click
from marshmallow import ValidationError, validate
from sqlalchemy import func

from .extensions import db
from .models import (
    Article,
    BaytarianRequest,
    Category,
    Course,
    Enrollment,
    InstapayPayment,
    LessonProgress,
    Notification,
    Payment,
    User,
    UserDevice,
    VideoEntitlement,
)
from .models.catalog import FIXED_CATEGORIES
from .security import hash_password
from .services import course_grants
from .services.catalog_access import PUBLISHED_STATUS, access_is_paid
from .services.phone import normalize_mobile
from .services.vet_verification import verify_directly


PROTECTED_CLEANUP_TABLES = {"users", "settings", "categories"}
CLEANUP_CONFIRMATION = "REMOVE-ALL-BUSINESS-DATA"
RETAIN_USERS_CONFIRMATION = "RETAIN-ONLY-NAMED-USERS"


def _ensure_fixed_categories():
    added = 0
    for sort_order, (slug, name, name_en) in enumerate(FIXED_CATEGORIES):
        category = Category.query.filter_by(slug=slug).first()
        if category is None:
            category = Category(name=name, name_en=name_en, slug=slug)
            db.session.add(category)
            added += 1
        category.sort_order = sort_order
        category.is_fixed = True
    return added


def register_cli(app):
    @app.cli.command("seed-categories")
    def seed_categories():
        """Seed the six fixed catalog categories without changing edited labels."""
        added = _ensure_fixed_categories()
        db.session.commit()
        click.echo(f"Seeded {added} categories ({len(FIXED_CATEGORIES) - added} already present).")

    @app.cli.command("cleanup-business-data")
    @click.option("--confirm", required=True, help="Required destructive-operation confirmation phrase.")
    def cleanup_business_data(confirm):
        """Delete business data while preserving users, settings, and fixed taxonomy."""
        if confirm != CLEANUP_CONFIRMATION:
            raise click.ClickException(f"Refusing cleanup: use --confirm {CLEANUP_CONFIRMATION}")

        deleted = {}
        try:
            for table in reversed(db.metadata.sorted_tables):
                if table.name in PROTECTED_CLEANUP_TABLES:
                    continue
                result = db.session.execute(table.delete())
                deleted[table.name] = max(result.rowcount or 0, 0)

            fixed_slugs = [slug for slug, _name, _name_en in FIXED_CATEGORIES]
            deleted["custom_categories"] = Category.query.filter(
                ~Category.slug.in_(fixed_slugs)
            ).delete(synchronize_session=False)
            _ensure_fixed_categories()
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        click.echo(
            f"Cleanup complete: removed {sum(deleted.values())} rows; "
            f"preserved {User.query.count()} users and the settings table; "
            f"restored {len(FIXED_CATEGORIES)} fixed categories."
        )

    @app.cli.command("migrate-paid-videos")
    @click.option("--apply", is_flag=True, help="Rebuild, upload to VdoCipher and switch each row.")
    @click.option("--cleanup", is_flag=True, help="Delete local packages whose VdoCipher copy is ready.")
    @click.option("--id", "ids", type=int, multiple=True, help="Limit to these video ids.")
    @click.option("--workdir", default="/tmp", show_default=True, help="Where the rebuilt MP4 is staged.")
    def migrate_paid_videos(apply, cleanup, ids, workdir):
        """Move paid videos off our own server (no DRM there) and onto VdoCipher.

        With no flag it only lists what would move. --apply keeps the local package
        until --cleanup confirms VdoCipher reports the copy ready, so a failed upload
        never costs the only copy.
        """
        from .services import video_migration
        from .services.vdocipher_admin import VdoCipherAdminError

        pending = video_migration.paid_local_lessons()
        if ids:
            pending = [l for l in pending if l.id in ids]
        if not apply and not cleanup:
            click.echo(f"{len(pending)} paid video(s) still on local storage:")
            for l in pending:
                click.echo(f"  #{l.id} [{l.access_type}] {l.title} (local_status={l.local_status})")
            click.echo("Nothing changed. Re-run with --apply to migrate, --cleanup to delete "
                       "local packages already confirmed on VdoCipher.")
            return

        if apply:
            for l in pending:
                if l.local_status != "ready":
                    click.echo(f"  #{l.id} skipped: local package is {l.local_status}, not ready")
                    continue
                try:
                    video_id = video_migration.migrate(app, l, workdir)
                    click.echo(f"  #{l.id} uploaded as {video_id}; local package kept until --cleanup")
                except (VdoCipherAdminError, RuntimeError, OSError, Exception) as e:  # noqa: BLE001
                    db.session.rollback()
                    click.echo(f"  #{l.id} FAILED: {e}")

        if cleanup:
            waiting = video_migration.awaiting_cleanup()
            if ids:
                waiting = [l for l in waiting if l.id in ids]
            for l in waiting:
                try:
                    status = video_migration.cleanup(app, l)
                except VdoCipherAdminError as e:
                    click.echo(f"  #{l.id} cleanup FAILED: {e}")
                    continue
                if status == "ready":
                    click.echo(f"  #{l.id} local package deleted; served from VdoCipher")
                else:
                    click.echo(f"  #{l.id} kept: VdoCipher status is '{status or 'unknown'}', not ready")

    @app.cli.command("retain-users")
    @click.option("--admin", "admin_email", required=True)
    @click.option("--instructor", "instructor_email", required=True)
    @click.option("--confirm", required=True, help="Required destructive-operation confirmation phrase.")
    def retain_users(admin_email, instructor_email, confirm):
        """Retain two named accounts and remove all other user identities."""
        if confirm != RETAIN_USERS_CONFIRMATION:
            raise click.ClickException(
                f"Refusing cleanup: use --confirm {RETAIN_USERS_CONFIRMATION}"
            )

        requested = [admin_email.strip().lower(), instructor_email.strip().lower()]
        if not all(requested) or requested[0] == requested[1]:
            raise click.ClickException("Admin and instructor must be two different accounts.")

        resolved = []
        for email in requested:
            matches = User.query.filter(func.lower(User.email) == email).all()
            if len(matches) != 1:
                raise click.ClickException(
                    f"Expected exactly one account for {email}; found {len(matches)}."
                )
            resolved.append(matches[0])

        admin_user, instructor_user = resolved
        retained_ids = [admin_user.id, instructor_user.id]
        removed_ids = [
            user_id for (user_id,) in db.session.query(User.id).filter(
                ~User.id.in_(retained_ids)
            ).all()
        ]

        try:
            admin_user.role = "admin"
            admin_user.is_active = True
            instructor_user.role = "instructor"
            instructor_user.is_active = True

            if removed_ids:
                Course.query.filter(Course.instructor_id.in_(removed_ids)).update(
                    {Course.instructor_id: instructor_user.id}, synchronize_session=False
                )
                Article.query.filter(Article.author_id.in_(removed_ids)).update(
                    {Article.author_id: None}, synchronize_session=False
                )
                BaytarianRequest.query.filter(
                    BaytarianRequest.reviewed_by.in_(removed_ids)
                ).update({BaytarianRequest.reviewed_by: None}, synchronize_session=False)
                InstapayPayment.query.filter(
                    InstapayPayment.reviewed_by.in_(removed_ids)
                ).update({InstapayPayment.reviewed_by: None}, synchronize_session=False)

                removed_enrollments = db.session.query(Enrollment.id).filter(
                    Enrollment.user_id.in_(removed_ids)
                )
                LessonProgress.query.filter(
                    LessonProgress.enrollment_id.in_(removed_enrollments)
                ).delete(synchronize_session=False)

                for model in (
                    Payment,
                    InstapayPayment,
                    Enrollment,
                    VideoEntitlement,
                    Notification,
                    BaytarianRequest,
                    UserDevice,
                ):
                    model.query.filter(model.user_id.in_(removed_ids)).delete(
                        synchronize_session=False
                    )
                User.query.filter(User.id.in_(removed_ids)).delete(synchronize_session=False)

            db.session.flush()
            if User.query.count() != 2:
                raise RuntimeError("Retention invariant failed: expected exactly two users.")
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            raise click.ClickException(f"Retention failed: {exc}") from exc

        click.echo(
            f"Retention complete: kept {admin_user.email} as admin and "
            f"{instructor_user.email} as instructor; removed {len(removed_ids)} users."
        )

    @app.cli.command("create-admin")
    @click.argument("email")
    @click.argument("password")
    @click.argument("name", default="Admin")
    def create_admin(email, password, name):
        """Create a new admin, or promote an existing user to admin."""
        email = email.lower()
        user = User.query.filter_by(email=email).first()
        if user:
            user.role = "admin"
            action = "promoted to admin"
        else:
            user = User(name=name, email=email, password_hash=hash_password(password), role="admin")
            db.session.add(user)
            action = "created as admin"
        db.session.commit()
        click.echo(f"{email} {action}.")

    @app.cli.command("create-review-account")
    @click.argument("email")
    @click.argument("name")
    @click.argument("phone")
    @click.option("--vet/--no-vet", default=True, show_default=True,
                  help="Verified veterinarian (vet courses) or not (general courses).")
    @click.option("--apply", is_flag=True, help="Write the changes. Without it nothing is saved.")
    def create_review_account(email, name, phone, vet, apply):
        """Create or refresh the App Store / Google Play review account.

        Dry run unless --apply. On --apply the password is asked for twice, never taken as
        an argument. The account has no device limit. Every published course the audience
        rule allows is opened for life, with no payment. Safe to re-run: it brings the
        account back to the same state.
        """
        email = email.strip().lower()
        try:
            validate.Email()(email)
        except ValidationError:
            raise click.ClickException(f"{email!r} is not an email address.")
        name = name.strip()
        if not name:
            raise click.ClickException("NAME is empty.")
        mobile = normalize_mobile(phone)
        if not mobile:
            raise click.ClickException(
                f"{phone!r} is not a mobile number Baytara accepts (e.g. +201012345678).")

        user = User.query.filter_by(email=email).first()
        # A typo must not quietly demote the owner and reset their password.
        if user and user.role != "student":
            raise click.ClickException(
                f"{email} is an existing {user.role} account; refusing to make it a review account.")

        password_hash = None
        if apply:
            password = click.prompt("Password", hide_input=True, confirmation_prompt=True)
            if not 8 <= len(password) <= 128:
                raise click.ClickException("The password must be 8 to 128 characters.")
            password_hash = hash_password(password)

        # One code path for both modes: the dry run does the work and rolls it back, so
        # what it prints is exactly what --apply would do.
        created = user is None
        try:
            if created:
                user = User(email=email)
                db.session.add(user)
            if password_hash:
                user.password_hash = password_hash
            user.name = name
            user.phone = mobile
            user.role = "student"
            user.is_active = True
            user.deleted_at = None
            user.is_review_account = True
            db.session.flush()

            if not vet:
                user.is_baytarian = user.is_vet_student = False
                verified = "no"
            elif user.is_baytarian:
                verified = "yes (already)"
            else:
                verify_directly(user, note="App Store / Google Play review account")
                verified = "yes"

            rows = []
            courses = Course.query.filter_by(status=PUBLISHED_STATUS).order_by(Course.id).all()
            for course in courses:
                source = course_grants.SOURCE if access_is_paid(course.access_type) else "free"
                granted, skipped = course_grants.grant_course(
                    course, [user.id], access="lifetime", source=source)
                reason = skipped[0]["reason"] if skipped else None
                status = ("enrolled" if granted else
                          "already enrolled" if reason == "already_enrolled" else f"skipped ({reason})")
                rows.append((course.id, course.access_type, status, course.title))
            uid = user.id

            if apply:
                db.session.commit()
            else:
                db.session.rollback()
        except Exception:
            db.session.rollback()
            raise

        if not apply:
            click.echo("DRY RUN: nothing is written. This is what --apply would do.")
        click.echo(f"User:        {email}{f' (id={uid})' if apply or not created else ''} "
                   f"{'created' if created else 'updated'}")
        click.echo(f"Verified:    {verified}")
        click.echo("Devices:     unlimited")
        click.echo(f"Courses:     {len(rows)} published")
        for course_id, access_type, status, title in rows:
            click.echo(f"  #{course_id:<5} {access_type:<10} {status:<32} {title}")
        if not apply:
            click.echo("(dry run, nothing written; pass --apply to write)")
