# Meet the team: xvm-api Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `team_members` table and the public, member and admin endpoints behind the dashboard's Meet the team page.

**Architecture:** One new table, one new service (`TeamService`), one new router file (`routers/team.py`, auto-registered), and one public route added to `routers/public.py`. Photos go through the existing `store_upload` / `forget_upload` helpers. Account deletion and person merge each get a one-line hook so the new table is classified, as their guard tests require.

**Tech Stack:** Python, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic, pytest (SQLite in-memory by default).

**Spec:** `docs/superpowers/specs/2026-10-29-meet-the-team-design.md` in xvm-dashboard.

**Spec deviations, decided while reading the code:**
- The public read is `GET /public/team`, not `GET /team`. Every unauthenticated route lives under the `/public` prefix in `routers/public.py` behind `public_limiter`.
- The admin "add member" screen needs to find people by name and xvm-api has no such lookup, so this plan adds `GET /admin/team/candidates?q=`.

**Conventions this plan follows (verified in the code):**
- Routers are discovered by scanning `api/routers/`, so a new file needs no registration.
- Each router defines its own `_person_or_403` / `_admin_or_403` helpers; they are not shared.
- A 409 without a code must come from a route whose `responses[409]` has no `x-codes` (enforced by `Tests/conftest.py::_hold_409s_to_their_docs`).
- `contract/openapi.json` is committed and `Tests/test_openapi_contract.py` fails if it is stale.
- `Tests/test_account_deletion.py` and `Tests/test_person_merge.py` have guard tests that fail until every new person FK is classified.

---

## Task 0: Workspace

The live `~/xvm-api` checkout is on a stale branch with a staged file. Do not use it.

- [ ] **Step 1: Create a worktree off `origin/dev`**

```bash
git -C ~/xvm-api fetch origin
git -C ~/xvm-api worktree add ~/xvm-api-team -b feat/team-page origin/dev
cd ~/xvm-api-team && uv sync
```

Expected: `~/xvm-api-team` exists on branch `feat/team-page`; `uv sync` finishes without error.

- [ ] **Step 2: Confirm the baseline is green**

Run (from `~/xvm-api-team`): `uv run pytest Tests/test_platform.py -q`
Expected: all pass. If anything fails here, stop and report; do not build on a red base.

- [ ] **Step 3: Confirm the single alembic head**

Run: `uv run alembic heads`
Expected: exactly one line, `664964b244a6 (head)`. If a different single head prints, use that id as `down_revision` in Task 1. If two heads print, stop and report.

---

## Task 1: Table, constants and migration

**Files:**
- Modify: `src/api/constants.py` (append in the media/limits area near `MAX_UPLOAD_BYTES`, line ~103)
- Create: `src/api/models/team.py`
- Create: `alembic/versions/7c3a9e41d2b8_team_members.py`
- Create: `Tests/test_team.py`

- [ ] **Step 1: Write the failing test**

Create `Tests/test_team.py`:

```python
"""The Meet the team page: who is on it, what they write about themselves, and who may change what.

Three people recur: an admin (the platform_admin scope), a member (already on the team, no
scope), and an outsider (neither). Anything a member does must be invisible to the outsider.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.constants import SCOPE_PLATFORM_ADMIN
from api.enums import ClientKind, TokenKind
from api.models.base import _now
from api.models.people import PersonModel
from api.models.team import TeamMemberModel
from api.services.credentials import CredentialService


@dataclass(frozen=True)
class Person:
    person_id: int
    headers: dict[str, str]


@dataclass(frozen=True)
class TeamContext:
    admin: Person
    member: Person
    outsider: Person


async def _person(session: AsyncSession, name: str, *, scopes: tuple[str, ...] = ()) -> Person:
    person = PersonModel(display_name=name)
    session.add(person)
    await session.flush()
    key = await CredentialService(session).issue(
        kind=TokenKind.API_KEY, client=ClientKind.Plugin, name=name, person_id=person.id, scopes=scopes
    )
    return Person(person_id=person.id, headers={"Authorization": f"Bearer {key.secret}"})


def _png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(buffer, format="PNG")
    return buffer.getvalue()


async def _row(session: AsyncSession, person_id: int) -> TeamMemberModel:
    row = (
        await session.execute(
            select(TeamMemberModel).where(TeamMemberModel.person_id == person_id).execution_options(populate_existing=True)
        )
    ).scalar_one()
    return row


@pytest_asyncio.fixture
async def ctx(session: AsyncSession) -> TeamContext:
    admin = await _person(session, "Admin", scopes=(SCOPE_PLATFORM_ADMIN,))
    member = await _person(session, "Memberella")
    outsider = await _person(session, "Outsider")
    session.add(TeamMemberModel(person_id=member.person_id, role_title="Developer", group_label="Builders", sort_order=1))
    await session.flush()
    return TeamContext(admin=admin, member=member, outsider=outsider)


# ── The table ───────────────────────────────────────────────────────────────────────

async def test_a_person_has_at_most_one_team_card(session: AsyncSession, ctx: TeamContext) -> None:
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(TeamMemberModel(person_id=ctx.member.person_id, role_title="Again"))
            await session.flush()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run pytest Tests/test_team.py -v`
Expected: collection ERROR, `ModuleNotFoundError: No module named 'api.models.team'`.

- [ ] **Step 3: Add the constants**

In `src/api/constants.py`, directly after the `MAX_UPLOAD_BYTES = 8 * 1024 * 1024` line:

```python
MAX_TEAM_ROLE_LENGTH = 80
MAX_TEAM_GROUP_LENGTH = 40
MAX_TEAM_BIO_LENGTH = 1000
TEAM_CANDIDATES_MAX = 20
TEAM_CANDIDATE_QUERY_MIN = 2
TEAM_CANDIDATE_QUERY_MAX = 100
```

- [ ] **Step 4: Add the model**

Create `src/api/models/team.py`:

```python
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from api.constants import MAX_TEAM_GROUP_LENGTH, MAX_TEAM_ROLE_LENGTH
from api.models.base import Identifiable


class TeamMemberModel(Identifiable):
    """A person on the XVM team page. One card each; everything else about them lives in `people`."""

    person_id: Mapped[int] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), nullable=False, unique=True)
    role_title: Mapped[str] = mapped_column(String(MAX_TEAM_ROLE_LENGTH), nullable=False)
    group_label: Mapped[str | None] = mapped_column(String(MAX_TEAM_GROUP_LENGTH), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    listed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
```

The table name comes out as `team_members` from the class name via `BaseModel.__tablename__`. `models/__init__.py` imports every sibling module, so no registration is needed.

- [ ] **Step 5: Add the migration**

Create `alembic/versions/7c3a9e41d2b8_team_members.py`:

```python
"""team members

Revision ID: 7c3a9e41d2b8
Revises: 664964b244a6
Create Date: 2026-10-29 13:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7c3a9e41d2b8'
down_revision: str | Sequence[str] | None = '664964b244a6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """The Meet the team page: one card per person an admin has added."""
    op.create_table(
        "team_members",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("role_title", sa.String(length=80), nullable=False),
        sa.Column("group_label", sa.String(length=40), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("photo_key", sa.String(length=255), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("listed", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], name="fk_team_members_person_id_people", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_team_members"),
        sa.UniqueConstraint("person_id", name="uq_team_members_person_id"),
    )


def downgrade() -> None:
    """Every card goes. The people and their uploaded photos stay."""
    op.drop_table("team_members")
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `uv run pytest Tests/test_team.py -v`
Expected: `test_a_person_has_at_most_one_team_card` PASSED.

- [ ] **Step 7: Verify the migration applies and reverses**

Run: `uv run alembic heads`
Expected: one line, `7c3a9e41d2b8 (head)`.

If a local Postgres is available (`APIV2_DATABASE_URL` set), also run `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`. Expected: no errors. If no database is available, say so in the commit body; CI covers it.

- [ ] **Step 8: Commit**

```bash
git add src/api/constants.py src/api/models/team.py alembic/versions/7c3a9e41d2b8_team_members.py Tests/test_team.py
git commit -m "feat(team): add the team_members table"
```

The full suite will fail the two guard tests (`test_every_row_a_person_owns_is_deleted_or_kept_on_purpose` and `test_every_conflict_bearing_person_column_has_a_merge_policy`) until Task 5. That is expected; do not run the full suite yet.

---

## Task 2: Schemas, service and the public read

**Files:**
- Create: `src/api/schemas/team.py`
- Create: `src/api/services/team.py`
- Modify: `src/api/routers/public.py` (imports, then one route at the end of the file)
- Modify: `Tests/test_team.py`

- [ ] **Step 1: Write the failing tests**

Append to `Tests/test_team.py`:

```python
# ── The public page ─────────────────────────────────────────────────────────────────

async def test_the_public_team_lists_listed_members_in_order(client: AsyncClient, session: AsyncSession, ctx: TeamContext) -> None:
    first = await _person(session, "Zed")
    hidden = await _person(session, "Hidden")
    session.add_all([
        TeamMemberModel(person_id=first.person_id, role_title="Tester", group_label="Testers", sort_order=0),
        TeamMemberModel(person_id=hidden.person_id, role_title="Tester", sort_order=2, listed=False),
    ])
    await session.flush()

    response = await client.get("/public/team")
    assert response.status_code == 200, response.text
    members = response.json()["members"]
    assert [m["name"] for m in members] == ["Zed", "Memberella"], "ordered by sort_order, and the unlisted one is absent"
    assert members[1] == {
        "name": "Memberella",
        "role_title": "Developer",
        "group_label": "Builders",
        "bio": None,
        "photo_url": None,
    }


async def test_the_public_team_is_empty_when_nobody_is_on_it(client: AsyncClient) -> None:
    response = await client.get("/public/team")
    assert response.status_code == 200, response.text
    assert response.json() == {"members": []}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest Tests/test_team.py -k public -v`
Expected: FAIL, `404 != 200` (the route does not exist).

- [ ] **Step 3: Add the schemas**

Create `src/api/schemas/team.py`:

```python
from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from api.constants import (
    MAX_INTEGER,
    MAX_TEAM_BIO_LENGTH,
    MAX_TEAM_GROUP_LENGTH,
    MAX_TEAM_ROLE_LENGTH,
    MIN,
)
from api.schemas.base import BaseSchema, IdIn, PartialUpdateSchema


class PublicTeamMember(BaseSchema):

    name: str
    role_title: str
    group_label: str | None
    bio: str | None
    photo_url: str | None


class PublicTeam(BaseSchema):

    members: list[PublicTeamMember]


class TeamProfile(BaseSchema):
    """A member's own card."""

    name: str
    role_title: str
    group_label: str | None
    bio: str | None
    photo_url: str | None
    listed: bool


class TeamProfileUpdate(PartialUpdateSchema):
    """All a member may change. The role, group and order are an admin's to set, and extra="forbid"
    turns an attempt to send them into a 422."""

    bio: str | None = Field(default=None, max_length=MAX_TEAM_BIO_LENGTH)
    listed: bool | None = None

    _REQUIRED_COLUMNS: ClassVar[tuple[str, ...]] = ("listed",)


class AdminTeamMember(BaseSchema):

    person_id: int
    name: str
    role_title: str
    group_label: str | None
    bio: str | None
    photo_url: str | None
    sort_order: int
    listed: bool


class TeamMemberCreate(BaseSchema):

    person_id: IdIn
    role_title: str = Field(min_length=MIN, max_length=MAX_TEAM_ROLE_LENGTH)
    group_label: str | None = Field(default=None, min_length=MIN, max_length=MAX_TEAM_GROUP_LENGTH)
    sort_order: int = Field(default=0, ge=0, le=MAX_INTEGER)


class TeamMemberUpdate(PartialUpdateSchema):

    role_title: str | None = Field(default=None, min_length=MIN, max_length=MAX_TEAM_ROLE_LENGTH)
    group_label: str | None = Field(default=None, min_length=MIN, max_length=MAX_TEAM_GROUP_LENGTH)
    sort_order: int | None = Field(default=None, ge=0, le=MAX_INTEGER)

    _REQUIRED_COLUMNS: ClassVar[tuple[str, ...]] = ("role_title", "sort_order")


class TeamCandidate(BaseSchema):
    """Someone an admin could add."""

    person_id: int
    name: str
```

- [ ] **Step 4: Add the service**

Create `src/api/services/team.py`:

```python
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from api.constants import TEAM_CANDIDATES_MAX
from api.models.people import PersonModel
from api.models.team import TeamMemberModel
from api.schemas.team import TeamMemberCreate
from api.services.base import Service
from api.storage import get_storage


def photo_url(key: str | None) -> str | None:
    """Keys are stored and URLs computed, so a storage move is one setting."""
    return None if key is None else get_storage().url_for(key)


class TeamService(Service[TeamMemberModel]):

    model = TeamMemberModel

    async def roster(self, *, listed_only: bool) -> list[tuple[TeamMemberModel, str]]:
        """Cards with their owner's display name, in page order."""
        query = (
            select(TeamMemberModel, PersonModel.display_name)
            .join(PersonModel, PersonModel.id == TeamMemberModel.person_id)
            .order_by(TeamMemberModel.sort_order, TeamMemberModel.id)
        )
        if listed_only:
            query = query.where(TeamMemberModel.listed.is_(True))
        return [(member, name) for member, name in (await self.session.execute(query)).all()]

    async def for_person(self, person_id: int) -> tuple[TeamMemberModel, str] | None:
        row = (
            await self.session.execute(
                select(TeamMemberModel, PersonModel.display_name)
                .join(PersonModel, PersonModel.id == TeamMemberModel.person_id)
                .where(TeamMemberModel.person_id == person_id)
            )
        ).first()
        return None if row is None else (row[0], row[1])

    async def enrol(self, payload: TeamMemberCreate) -> TeamMemberModel:
        """Put a person on the team. The unique index on person_id is the arbiter of a double add."""
        person = await self.session.get(PersonModel, payload.person_id)
        if person is None or person.archived_at is not None:
            raise HTTPException(404, "No such person.")
        try:
            async with self.session.begin_nested():
                return await self.add(TeamMemberModel(**payload.model_dump()))
        except IntegrityError:
            raise HTTPException(409, "That person is already on the team.") from None

    async def set_photo(self, member: TeamMemberModel, key: str) -> str | None:
        """Returns the key it replaced, for the caller to forget once the row has moved."""
        replaced = member.photo_key
        member.photo_key = key
        await self.session.flush()
        return replaced

    async def remove(self, member: TeamMemberModel) -> str | None:
        """Returns the photo key the card held. The person is untouched."""
        key = member.photo_key
        await self.delete(member)
        return key

    async def candidates(self, query: str) -> list[PersonModel]:
        """Live accounts matching a name fragment who are not on the team yet."""
        on_team = select(TeamMemberModel.person_id)
        return list(
            (
                await self.session.execute(
                    select(PersonModel)
                    .where(
                        PersonModel.archived_at.is_(None),
                        PersonModel.id.not_in(on_team),
                        func.lower(PersonModel.display_name).contains(query.lower(), autoescape=True),
                    )
                    .order_by(PersonModel.display_name, PersonModel.id)
                    .limit(TEAM_CANDIDATES_MAX)
                )
            ).scalars().all()
        )
```

- [ ] **Step 5: Add the public route**

In `src/api/routers/public.py`, add these imports in their alphabetical places among the existing `api.schemas...` and `api.services...` imports:

```python
from api.schemas.team import PublicTeam, PublicTeamMember
```

```python
from api.services.team import TeamService, photo_url
```

Then append at the end of the file:

```python
@router.get("/team", dependencies=[Depends(public_limiter)], responses={
    429: {"model": ErrorDetail, "description": "Too many requests."},
})
async def public_team(session: Annotated[AsyncSession, Depends(get_session, scope="function")]) -> PublicTeam:
    """The Meet the team page. Listed members only, in page order."""
    rows = await TeamService(session).roster(listed_only=True)
    return PublicTeam(
        members=[
            PublicTeamMember(
                name=name,
                role_title=member.role_title,
                group_label=member.group_label,
                bio=member.bio,
                photo_url=photo_url(member.photo_key),
            )
            for member, name in rows
        ]
    )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `uv run pytest Tests/test_team.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/schemas/team.py src/api/services/team.py src/api/routers/public.py Tests/test_team.py
git commit -m "feat(team): public read of the Meet the team page"
```

---

## Task 3: A member's own card

**Files:**
- Create: `src/api/routers/team.py`
- Modify: `Tests/test_team.py`

- [ ] **Step 1: Write the failing tests**

Append to `Tests/test_team.py`:

```python
# ── A member's own card ─────────────────────────────────────────────────────────────

async def test_a_member_reads_their_own_card(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.get("/me/team-profile", headers=ctx.member.headers)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "name": "Memberella",
        "role_title": "Developer",
        "group_label": "Builders",
        "bio": None,
        "photo_url": None,
        "listed": True,
    }


async def test_someone_off_the_team_has_no_card(client: AsyncClient, ctx: TeamContext) -> None:
    assert (await client.get("/me/team-profile", headers=ctx.outsider.headers)).status_code == 404
    assert (await client.patch("/me/team-profile", headers=ctx.outsider.headers, json={"bio": "hi"})).status_code == 404


async def test_a_card_needs_a_person_credential(client: AsyncClient, ctx: TeamContext) -> None:
    assert (await client.get("/me/team-profile")).status_code == 401


async def test_a_member_edits_their_bio_and_listing(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.patch("/me/team-profile", headers=ctx.member.headers, json={"bio": "I build things.", "listed": False})
    assert response.status_code == 200, response.text
    assert response.json()["bio"] == "I build things."
    assert response.json()["listed"] is False

    assert (await client.get("/public/team")).json() == {"members": []}, "unlisted, so the page loses them"


async def test_a_member_can_clear_their_bio(client: AsyncClient, ctx: TeamContext) -> None:
    await client.patch("/me/team-profile", headers=ctx.member.headers, json={"bio": "something"})
    response = await client.patch("/me/team-profile", headers=ctx.member.headers, json={"bio": None})
    assert response.status_code == 200, response.text
    assert response.json()["bio"] is None


async def test_a_member_cannot_set_their_own_role_group_or_order(client: AsyncClient, ctx: TeamContext) -> None:
    for field, value in (("role_title", "Lead Developer"), ("group_label", "Founders"), ("sort_order", 0)):
        response = await client.patch("/me/team-profile", headers=ctx.member.headers, json={field: value})
        assert response.status_code == 422, (field, response.text)


async def test_a_bio_has_a_ceiling_and_listing_cannot_be_null(client: AsyncClient, ctx: TeamContext) -> None:
    assert (await client.patch("/me/team-profile", headers=ctx.member.headers, json={"bio": "x" * 1001})).status_code == 422
    assert (await client.patch("/me/team-profile", headers=ctx.member.headers, json={"listed": None})).status_code == 422
    assert (await client.patch("/me/team-profile", headers=ctx.member.headers, json={"bio": "x" * 1000})).status_code == 200


async def test_a_photo_is_stored_and_replaced(client: AsyncClient, session: AsyncSession, ctx: TeamContext) -> None:
    media = Path(os.environ["APIV2_MEDIA_DISK_ROOT"])

    first = await client.put("/me/team-profile/photo", headers=ctx.member.headers, files={"file": ("me.png", _png(), "image/png")})
    assert first.status_code == 200, first.text
    assert first.json()["photo_url"] is not None
    first_key = (await _row(session, ctx.member.person_id)).photo_key
    assert first_key is not None and first_key.startswith(f"team/{ctx.member.person_id}/")
    assert (media / first_key).exists()

    second = await client.put("/me/team-profile/photo", headers=ctx.member.headers, files={"file": ("me.png", _png(), "image/png")})
    assert second.status_code == 200, second.text
    second_key = (await _row(session, ctx.member.person_id)).photo_key
    assert second_key != first_key
    assert (media / second_key).exists()
    assert not (media / first_key).exists(), "the replaced photo is forgotten"


async def test_a_photo_must_be_an_image(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.put(
        "/me/team-profile/photo", headers=ctx.member.headers, files={"file": ("me.png", b"not an image", "image/png")}
    )
    assert response.status_code == 400, response.text


async def test_someone_off_the_team_cannot_upload_a_photo(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.put("/me/team-profile/photo", headers=ctx.outsider.headers, files={"file": ("me.png", _png(), "image/png")})
    assert response.status_code == 404, response.text
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest Tests/test_team.py -k "card or bio or photo or role" -v`
Expected: FAIL, `404 != 200` on the first (no route yet).

- [ ] **Step 3: Add the router with the member routes**

Create `src/api/routers/team.py`:

```python
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal, get_principal
from api.constants import SCOPE_PLATFORM_ADMIN
from api.database import get_session
from api.models.team import TeamMemberModel
from api.routers.common import forget_upload, store_upload
from api.schemas.errors import ErrorDetail
from api.schemas.team import TeamProfile, TeamProfileUpdate
from api.services.team import TeamService, photo_url

router = APIRouter(tags=["Team"])

SessionDep = Annotated[AsyncSession, Depends(get_session, scope="function")]
PrincipalDep = Annotated[Principal, Depends(get_principal)]

_401 = {"model": ErrorDetail, "description": "Missing, unknown, revoked, or expired credential."}
_403_PERSON = {"model": ErrorDetail, "description": "Requires a person credential."}
_403_ADMIN = {"model": ErrorDetail, "description": "Requires a person credential carrying the platform_admin scope."}
_404_CARD = {"model": ErrorDetail, "description": "You are not on the team."}


def _person_or_403(principal: Principal) -> int:
    if principal.person_id is None:
        raise HTTPException(403, "This action requires a person credential.")
    return principal.person_id


def _admin_or_403(principal: Principal) -> int:
    person_id = _person_or_403(principal)
    if SCOPE_PLATFORM_ADMIN not in principal.scopes:
        raise HTTPException(403, "This action requires the platform_admin scope.")
    return person_id


def _profile(member: TeamMemberModel, name: str) -> TeamProfile:
    return TeamProfile(
        name=name,
        role_title=member.role_title,
        group_label=member.group_label,
        bio=member.bio,
        photo_url=photo_url(member.photo_key),
        listed=member.listed,
    )


async def _own_card(service: TeamService, person_id: int) -> tuple[TeamMemberModel, str]:
    found = await service.for_person(person_id)
    if found is None:
        raise HTTPException(404, "You are not on the team.")
    return found


# ── /me/team-profile ────────────────────────────────────────────────────────────────

@router.get("/me/team-profile", responses={401: _401, 403: _403_PERSON, 404: _404_CARD})
async def my_team_profile(session: SessionDep, principal: PrincipalDep) -> TeamProfile:
    """My card, or 404 when I am not on the team. The dashboard reads this to show or hide "Edit my card"."""
    member, name = await _own_card(TeamService(session), _person_or_403(principal))
    return _profile(member, name)


@router.patch("/me/team-profile", responses={
    401: _401, 403: _403_PERSON, 404: _404_CARD,
    422: {"model": ErrorDetail, "description": "A field a member may not set, or a bio past the ceiling."},
})
async def update_my_team_profile(session: SessionDep, principal: PrincipalDep, payload: TeamProfileUpdate) -> TeamProfile:
    """Bio and listing only. The role, group and order belong to an admin."""
    service = TeamService(session)
    member, name = await _own_card(service, _person_or_403(principal))
    await service.apply_update(member, payload)
    return _profile(member, name)


@router.put("/me/team-profile/photo", responses={
    400: {"model": ErrorDetail, "description": "Not an image type we accept."},
    401: _401, 403: _403_PERSON, 404: _404_CARD,
    413: {"model": ErrorDetail, "description": "File exceeds the upload cap."},
})
async def set_my_team_photo(session: SessionDep, principal: PrincipalDep, file: UploadFile) -> TeamProfile:
    """Multipart. Membership is checked before the upload is read, and replacing a photo drops the object it replaced."""
    person_id = _person_or_403(principal)
    service = TeamService(session)
    member, name = await _own_card(service, person_id)
    key = await store_upload(file, prefix=f"team/{person_id}")
    await forget_upload(await service.set_photo(member, key))
    return _profile(member, name)
```

`_403_ADMIN` and `_admin_or_403` are used by Task 4; they sit here now so Task 4 only appends routes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest Tests/test_team.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/routers/team.py Tests/test_team.py
git commit -m "feat(team): members edit their own bio, listing and photo"
```

---

## Task 4: Admin management

**Files:**
- Modify: `src/api/routers/team.py`
- Modify: `Tests/test_team.py`

- [ ] **Step 1: Write the failing tests**

Append to `Tests/test_team.py`:

```python
# ── Admin ───────────────────────────────────────────────────────────────────────────

async def test_admin_routes_refuse_everyone_but_an_admin(client: AsyncClient, ctx: TeamContext) -> None:
    person = ctx.member.person_id
    calls = (
        ("get", "/admin/team", None),
        ("get", "/admin/team/candidates?q=ab", None),
        ("post", "/admin/team", {"person_id": ctx.outsider.person_id, "role_title": "Tester"}),
        ("patch", f"/admin/team/{person}", {"role_title": "Boss"}),
        ("delete", f"/admin/team/{person}", None),
    )
    for method, path, body in calls:
        assert (await client.request(method, path, json=body)).status_code == 401, (method, path)
        assert (await client.request(method, path, headers=ctx.member.headers, json=body)).status_code == 403, (method, path)


async def test_an_admin_sees_unlisted_members_too(client: AsyncClient, ctx: TeamContext) -> None:
    await client.patch("/me/team-profile", headers=ctx.member.headers, json={"listed": False})
    response = await client.get("/admin/team", headers=ctx.admin.headers)
    assert response.status_code == 200, response.text
    assert [(m["person_id"], m["listed"]) for m in response.json()] == [(ctx.member.person_id, False)]


async def test_an_admin_adds_someone(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.post(
        "/admin/team",
        headers=ctx.admin.headers,
        json={"person_id": ctx.outsider.person_id, "role_title": "Tester", "group_label": "Testers", "sort_order": 5},
    )
    assert response.status_code == 201, response.text
    assert response.json() == {
        "person_id": ctx.outsider.person_id,
        "name": "Outsider",
        "role_title": "Tester",
        "group_label": "Testers",
        "bio": None,
        "photo_url": None,
        "sort_order": 5,
        "listed": True,
    }
    assert (await client.get("/me/team-profile", headers=ctx.outsider.headers)).status_code == 200, "and they can now edit their card"


async def test_adding_the_same_person_twice_is_refused(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.post("/admin/team", headers=ctx.admin.headers, json={"person_id": ctx.member.person_id, "role_title": "Again"})
    assert response.status_code == 409, response.text


async def test_adding_nobody_or_a_deleted_account_is_a_404(client: AsyncClient, session: AsyncSession, ctx: TeamContext) -> None:
    gone = await _person(session, "Gone")
    person = await session.get(PersonModel, gone.person_id)
    assert person is not None
    person.archived_at = _now()
    await session.flush()

    for person_id in (999_999, gone.person_id):
        response = await client.post("/admin/team", headers=ctx.admin.headers, json={"person_id": person_id, "role_title": "Tester"})
        assert response.status_code == 404, (person_id, response.text)


async def test_an_admin_retitles_regroups_and_reorders(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.patch(
        f"/admin/team/{ctx.member.person_id}",
        headers=ctx.admin.headers,
        json={"role_title": "Lead Developer", "group_label": "Founders", "sort_order": 0},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["role_title"], body["group_label"], body["sort_order"]) == ("Lead Developer", "Founders", 0)

    cleared = await client.patch(f"/admin/team/{ctx.member.person_id}", headers=ctx.admin.headers, json={"group_label": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["group_label"] is None


async def test_a_role_title_cannot_be_blanked_or_nulled(client: AsyncClient, ctx: TeamContext) -> None:
    for value in (None, ""):
        response = await client.patch(f"/admin/team/{ctx.member.person_id}", headers=ctx.admin.headers, json={"role_title": value})
        assert response.status_code == 422, (value, response.text)


async def test_editing_someone_off_the_team_is_a_404(client: AsyncClient, ctx: TeamContext) -> None:
    patch = await client.patch(f"/admin/team/{ctx.outsider.person_id}", headers=ctx.admin.headers, json={"role_title": "X"})
    assert patch.status_code == 404, patch.text
    delete = await client.delete(f"/admin/team/{ctx.outsider.person_id}", headers=ctx.admin.headers)
    assert delete.status_code == 404, delete.text


async def test_removing_someone_drops_the_card_and_the_photo_but_not_the_person(
    client: AsyncClient, session: AsyncSession, ctx: TeamContext
) -> None:
    media = Path(os.environ["APIV2_MEDIA_DISK_ROOT"])
    await client.put("/me/team-profile/photo", headers=ctx.member.headers, files={"file": ("me.png", _png(), "image/png")})
    key = (await _row(session, ctx.member.person_id)).photo_key
    assert key is not None and (media / key).exists()

    response = await client.delete(f"/admin/team/{ctx.member.person_id}", headers=ctx.admin.headers)
    assert response.status_code == 204, response.text

    assert not (media / key).exists()
    assert (await client.get("/me/team-profile", headers=ctx.member.headers)).status_code == 404
    assert (await client.get("/public/team")).json() == {"members": []}
    assert await session.get(PersonModel, ctx.member.person_id) is not None


async def test_candidates_are_live_people_not_yet_on_the_team(client: AsyncClient, session: AsyncSession, ctx: TeamContext) -> None:
    gone = await _person(session, "Outgoing")
    person = await session.get(PersonModel, gone.person_id)
    assert person is not None
    person.archived_at = _now()
    await session.flush()

    found = await client.get("/admin/team/candidates", headers=ctx.admin.headers, params={"q": "OUT"})
    assert found.status_code == 200, found.text
    assert found.json() == [{"person_id": ctx.outsider.person_id, "name": "Outsider"}], "case-insensitive, and not the deleted account"

    on_team = await client.get("/admin/team/candidates", headers=ctx.admin.headers, params={"q": "memberella"})
    assert on_team.json() == [], "someone already on the team is not offered again"


async def test_a_candidate_search_needs_two_characters(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.get("/admin/team/candidates", headers=ctx.admin.headers, params={"q": "o"})
    assert response.status_code == 422, response.text


async def test_a_percent_in_a_search_is_not_a_wildcard(client: AsyncClient, ctx: TeamContext) -> None:
    response = await client.get("/admin/team/candidates", headers=ctx.admin.headers, params={"q": "%%"})
    assert response.status_code == 200, response.text
    assert response.json() == []
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest Tests/test_team.py -k "admin or candidate or removing or adding or retitles or role_title or percent or editing" -v`
Expected: FAIL (the first assertion in each: 404 or 405 where a route is missing).

- [ ] **Step 3: Add the admin routes**

In `src/api/routers/team.py`, extend the imports:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
```

```python
from api.constants import (
    SCOPE_PLATFORM_ADMIN,
    TEAM_CANDIDATE_QUERY_MAX,
    TEAM_CANDIDATE_QUERY_MIN,
)
```

```python
from api.schemas.base import IdIn
from api.schemas.team import (
    AdminTeamMember,
    TeamCandidate,
    TeamMemberCreate,
    TeamMemberUpdate,
    TeamProfile,
    TeamProfileUpdate,
)
```

Add the row builder next to `_profile`:

```python
def _admin_row(member: TeamMemberModel, name: str) -> AdminTeamMember:
    return AdminTeamMember(
        person_id=member.person_id,
        name=name,
        role_title=member.role_title,
        group_label=member.group_label,
        bio=member.bio,
        photo_url=photo_url(member.photo_key),
        sort_order=member.sort_order,
        listed=member.listed,
    )
```

Append the routes at the end of the file. `/admin/team/candidates` is declared before the `{person_id}` routes on purpose:

```python
# ── /admin/team ─────────────────────────────────────────────────────────────────────

@router.get("/admin/team", responses={401: _401, 403: _403_ADMIN})
async def list_team(session: SessionDep, principal: PrincipalDep) -> list[AdminTeamMember]:
    """Everyone on the team, unlisted included - those are what an admin is here to see."""
    _admin_or_403(principal)
    return [_admin_row(member, name) for member, name in await TeamService(session).roster(listed_only=False)]


@router.get("/admin/team/candidates", responses={
    401: _401, 403: _403_ADMIN,
    422: {"model": ErrorDetail, "description": "The search is shorter than two characters."},
})
async def team_candidates(
    session: SessionDep,
    principal: PrincipalDep,
    q: Annotated[str, Query(min_length=TEAM_CANDIDATE_QUERY_MIN, max_length=TEAM_CANDIDATE_QUERY_MAX)],
) -> list[TeamCandidate]:
    """People matching a name fragment who could be added: live accounts not already on the team."""
    _admin_or_403(principal)
    return [TeamCandidate(person_id=p.id, name=p.display_name) for p in await TeamService(session).candidates(q)]


@router.post("/admin/team", status_code=201, responses={
    401: _401, 403: _403_ADMIN,
    404: {"model": ErrorDetail, "description": "No such person, or their account was deleted."},
    409: {"model": ErrorDetail, "description": "That person is already on the team."},
})
async def add_team_member(session: SessionDep, principal: PrincipalDep, payload: TeamMemberCreate) -> AdminTeamMember:
    _admin_or_403(principal)
    service = TeamService(session)
    await service.enrol(payload)
    found = await service.for_person(payload.person_id)
    assert found is not None  # just inserted
    return _admin_row(*found)


@router.patch("/admin/team/{person_id}", responses={
    401: _401, 403: _403_ADMIN,
    404: {"model": ErrorDetail, "description": "That person is not on the team."},
})
async def update_team_member(session: SessionDep, principal: PrincipalDep, person_id: IdIn, payload: TeamMemberUpdate) -> AdminTeamMember:
    _admin_or_403(principal)
    service = TeamService(session)
    found = await service.for_person(person_id)
    if found is None:
        raise HTTPException(404, "That person is not on the team.")
    member, name = found
    await service.apply_update(member, payload)
    return _admin_row(member, name)


@router.delete("/admin/team/{person_id}", status_code=204, responses={
    401: _401, 403: _403_ADMIN,
    404: {"model": ErrorDetail, "description": "That person is not on the team."},
})
async def remove_team_member(session: SessionDep, principal: PrincipalDep, person_id: IdIn) -> None:
    """The card and its photo go. The person, and anything else they own, stay."""
    _admin_or_403(principal)
    service = TeamService(session)
    found = await service.for_person(person_id)
    if found is None:
        raise HTTPException(404, "That person is not on the team.")
    await forget_upload(await service.remove(found[0]))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest Tests/test_team.py -v`
Expected: all PASS. If `test_adding_the_same_person_twice_is_refused` fails with an assertion about 409 docs, check that the route's `409` entry has no `x-codes` key (it must not use the `conflict()` helper).

- [ ] **Step 5: Commit**

```bash
git add src/api/routers/team.py Tests/test_team.py
git commit -m "feat(team): admins add, retitle, order and remove team members"
```

---

## Task 5: Account deletion and person merge

Two existing guard tests fail until the new person FK is classified. This task fixes them and adds behaviour tests.

**Files:**
- Modify: `src/api/services/account_deletion.py`
- Modify: `src/api/services/person_merge.py`
- Modify: `Tests/test_team.py`

- [ ] **Step 1: Confirm the two guard tests fail**

Run: `uv run pytest Tests/test_account_deletion.py::test_every_row_a_person_owns_is_deleted_or_kept_on_purpose Tests/test_person_merge.py::test_every_conflict_bearing_person_column_has_a_merge_policy -v`
Expected: both FAIL, naming `team_members.person_id`.

- [ ] **Step 2: Write the failing behaviour tests**

Append to `Tests/test_team.py`:

```python
# ── Account deletion and merging ────────────────────────────────────────────────────

async def test_deleting_an_account_takes_their_card_and_hands_back_the_photo(session: AsyncSession, ctx: TeamContext) -> None:
    from datetime import timedelta

    from api.constants import ACCOUNT_DELETION_GRACE
    from api.services.account_deletion import AccountDeletionService

    row = await _row(session, ctx.member.person_id)
    row.photo_key = f"team/{ctx.member.person_id}/abc.webp"
    person = await session.get(PersonModel, ctx.member.person_id)
    assert person is not None
    person.deletion_requested_at = _now() - ACCOUNT_DELETION_GRACE - timedelta(minutes=1)
    await session.flush()

    keys = await AccountDeletionService(session).anonymise(ctx.member.person_id)

    assert keys is not None and f"team/{ctx.member.person_id}/abc.webp" in keys
    remaining = (await session.execute(select(TeamMemberModel).where(TeamMemberModel.person_id == ctx.member.person_id))).scalars().all()
    assert remaining == []


async def test_merging_two_people_who_both_have_cards_keeps_the_keepers(session: AsyncSession, ctx: TeamContext) -> None:
    from api.services.person_merge import _resolve_team_members

    session.add(TeamMemberModel(person_id=ctx.outsider.person_id, role_title="Tester"))
    await session.flush()

    touched = await _resolve_team_members(session, keeper=ctx.member.person_id, loser=ctx.outsider.person_id)

    assert touched == 1
    kept = (await session.execute(select(TeamMemberModel.person_id))).scalars().all()
    assert kept == [ctx.member.person_id]


async def test_merging_leaves_a_lone_loser_card_to_be_repointed(session: AsyncSession, ctx: TeamContext) -> None:
    from api.services.person_merge import _resolve_team_members

    touched = await _resolve_team_members(session, keeper=ctx.outsider.person_id, loser=ctx.member.person_id)

    assert touched == 0, "the keeper has no card, so the loser's moves across like any other row"
```

- [ ] **Step 3: Run them to verify they fail**

Run: `uv run pytest Tests/test_team.py -k "deleting_an_account or merging" -v`
Expected: FAIL (`ImportError: cannot import name '_resolve_team_members'`, and the deletion test leaves the card behind).

- [ ] **Step 4: Classify the column in account deletion**

In `src/api/services/account_deletion.py`:

Add `"team_members.person_id",` to `DELETED_ROWS`, between `"shout_templates.person_id",` and `"venue_follows.person_id",`.

Add the import beside the other model imports:

```python
from api.models.team import TeamMemberModel
```

In `anonymise`, directly after the `drafts = (...)` line, add:

```python
        team_photos = (await self.session.execute(select(TeamMemberModel.photo_key).where(TeamMemberModel.person_id == person_id))).scalars().all()
```

and change the `keys = ...` line to:

```python
        keys = [key for pair in covers for key in pair if key is not None] + list(gallery) + list(drafts) + [k for k in team_photos if k is not None]
```

The existing `delete(table).where(column == person_id)` loop already removes the row, because the column is now in `DELETED_ROWS`.

- [ ] **Step 5: Add the merge policy**

In `src/api/services/person_merge.py`, add this resolver directly above the `Resolver = Callable[...]` line:

```python
async def _resolve_team_members(session: AsyncSession, keeper: int, loser: int) -> int:
    """One card per person. When both held one, the keeper's stays and the loser's goes; when only the
    loser held one it is returned untouched and the generic repoint moves it across. The loser's photo
    object is left in storage, unreferenced and sweepable."""
    team = _TABLES["team_members"]
    if (await session.execute(select(team.c.id).where(team.c.person_id == keeper))).first() is None:
        return 0
    return await _execute(session, delete(team).where(team.c.person_id == loser))
```

and add this line to `_POLICIES`, between the `shout_templates` and `venue_follows` entries:

```python
    ("team_members", "person_id"): _resolve_team_members,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `uv run pytest Tests/test_team.py Tests/test_account_deletion.py Tests/test_person_merge.py -v`
Expected: all PASS, including the two guard tests.

- [ ] **Step 7: Commit**

```bash
git add src/api/services/account_deletion.py src/api/services/person_merge.py Tests/test_team.py
git commit -m "feat(team): classify team cards for account deletion and person merge"
```

---

## Task 6: Contract, full suite and PR

**Files:**
- Modify: `contract/openapi.json` (generated)

- [ ] **Step 1: Regenerate the committed OpenAPI document**

Run: `uv run python -m api.scripts.export_openapi`
Expected: `contract/openapi.json` changes, and the diff contains the new `/public/team`, `/me/team-profile`, `/me/team-profile/photo`, `/admin/team`, `/admin/team/candidates` and `/admin/team/{person_id}` paths.

- [ ] **Step 2: Run the full suite and the linters**

Run: `uv run pytest -q`
Expected: all pass, none skipped except the existing Postgres-only race tests.

Run: `uv run ruff check src Tests` and, if the project configures it, `uv run mypy src`
Expected: clean. Fix anything the new files introduced; do not touch unrelated findings.

- [ ] **Step 3: Commit**

```bash
git add contract/openapi.json
git commit -m "chore(contract): regenerate openapi for the team endpoints"
```

- [ ] **Step 4: Stop and confirm before pushing**

Pushing and opening a PR are outward-facing. Ask the user to confirm, then:

```bash
git push -u origin feat/team-page
gh pr create --base dev --title "Meet the team: team_members table and endpoints" --body-file <(printf '%s\n' \
  "Adds the xvm-api half of the Meet the team page." \
  "" \
  "- \`team_members\` table (one card per person) and migration \`7c3a9e41d2b8\`" \
  "- Public \`GET /public/team\`; member \`GET/PATCH /me/team-profile\` and \`PUT /me/team-profile/photo\`" \
  "- Admin \`GET/POST /admin/team\`, \`PATCH/DELETE /admin/team/{person_id}\`, \`GET /admin/team/candidates\`" \
  "- Members edit bio and listing only; role title, group and order are admin-only" \
  "- Account deletion removes the card and hands back the photo; person merge keeps the keeper's card" \
  "" \
  "Design: xvm-dashboard \`docs/superpowers/specs/2026-10-29-meet-the-team-design.md\`" \
  "" \
  "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```

Per the standing rule, always pass `--base dev`. The dashboard plan builds against this PR's contract; it can start once the endpoints are merged or the branch is deployed to the shared dev API.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| `team_members` table, unique `person_id`, cascade | 1 |
| `role_title`, `group_label`, `bio` (1000), `photo_key`, `sort_order`, `listed` | 1, 2 |
| Name from `display_name` | 2 (`roster`, `for_person` join) |
| Public listed read, ordered by `sort_order` then id | 2 |
| `GET/PATCH /me/team-profile`, 404 off the team | 3 |
| Members edit `bio` and `listed` only | 3 (`extra="forbid"` test) |
| Photo upload under `team/<person_id>/`, old photo deleted | 3 |
| Admin list incl. unlisted, add, edit role/group/order, remove | 4 |
| Removing deletes the card and photo, not the person | 4 |
| Admin person search (open item) | 4 (`/admin/team/candidates`) |
| Account deletion and person merge stay correct | 5 |
| Contract file stays current | 6 |

Type names are consistent across tasks: `TeamService` (`roster`, `for_person`, `enrol`, `set_photo`, `remove`, `candidates`), `photo_url`, `TeamProfile`, `AdminTeamMember`, `TeamCandidate`, `_resolve_team_members`.
