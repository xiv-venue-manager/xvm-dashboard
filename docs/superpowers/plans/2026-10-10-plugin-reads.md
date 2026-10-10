# Plugin Reads From xvm-api Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once the plugin is linked, every read it makes (venues, shifts, roles, services, bans, the active event, rooms, and whether to show the inventory tab) comes straight from xvm-api, returned in the same shapes the tabs already use, so no tab changes.

**Architecture:** A new `XvmApiReads` class calls xvm-api with the plugin's own credential and hands the replies to a pure `XvmApiMapping` class that builds the plugin's existing DTOs (`ShiftsResponse`, `XIVAppVenue`, `Role`, `Room`, and so on). Both files have no Dalamud dependency, so xunit tests them directly. The existing `XIVAppVenueApi` and `XIVAppShiftApi` read methods keep their signatures and delegate to `XvmApiReads` when the account is linked. There is no fallback to the old dashboard routes (standing rule).

**Tech Stack:** C# on .NET 10, Dalamud plugin (`xvm-plugin-dev`, the local copy), xunit.

**Status:** Draft for review. Nothing here has been built. It follows the pairing plan (`2026-10-10-plugin-pairing.md`) and needs a linked plugin.

---

## Decisions

| # | Decision | State |
|---|---|---|
| D1 | The plugin calls xvm-api directly with the credential from pairing. Reads never fall back to the dashboard's `/api/plugin/*` routes. | Decided |
| D2 | Venue ids become xvm-api venue ids everywhere. The old dashboard ids stored in `selectedVenueId` and `houseToXivAppVenue` stop matching, so stale ones are cleared when the account links (Task 6). The venue auto-map plan rebuilds the house links. | Proposed |
| D3 | The plugin's writes (sales, patron visits, clock-in and out, claims, bans, room actions, inventory) still use the old routes and the old venue ids until the write plan. In the dev plugin they are broken in that gap. That is accepted because only dev builds exist and XIV-App Sync is switched off. | Proposed, confirm |
| D4 | Pending shifts (xvm `pending_approval`) map to `PENDING`, which the Shifts tab does not draw, so they stay hidden. `scheduled`, `active`, `completed` map to `SCHEDULED`, `ACTIVE`, `COMPLETED`, the only three the tab and `Plugin.cs` act on. | Proposed |
| D5 | Gil prices copy straight across: `price_minor` equals gil (the dashboard's `minorUnitsToGil` is the identity). A missing price becomes `"0"`, which the Sales tab parses. | Verified |
| D6 | The inventory tab shows when the venue's `inventory_enabled` setting is on. That setting is a new field on the venue, proposed in xvm-api #157 and returned on every `/me/venues` row, so the plugin needs no extra call. | Decided (user), needs #157 |
| D7 | Venue addresses and the user role on services are not needed. Nothing in the plugin reads `XIVAppVenue.Addresses` or `ServicesResponse.UserRole`, so they stay empty. | Verified (grep) |
| D8 | A member's own jobs come from their `/me/venues` row (`membership_id` and `position_ids`, proposed in xvm-api #158), plus the positions list for the names. The plugin never reads the roster. | Decided (user), needs #158 |

## What xvm-api returns (checked on 2026-10-10 against the dev API and its OpenAPI document)

All of these returned 200 for an owner at five venues (the three new `/me/venues` fields are in open draft PRs, not yet on the dev API). The documentation says "readable by any member" for positions, services and bans, so staff are expected to work too, but that was not tested with a staff-tier account (see Task 8).

| Plugin read | xvm-api call | Fields used |
|---|---|---|
| venues | `GET /me/venues` | `[{venue: {id, name, slug, inventory_enabled, ...}, tier, effective_tier, membership_id, position_ids}]`. `inventory_enabled`, `membership_id` and `position_ids` are new (xvm-api #157 and #158). |
| shifts | `GET /venues/{id}/shifts?from&to&mine=true` and `...&open_only=true` | `id, position_id, scheduled_start, scheduled_end, actual_start, actual_end, notes, status`. A window is at most 60 days. |
| roles | the venue's `/me/venues` row for `position_ids`, then `GET /venues/{id}/positions` | positions: `id, name` |
| services | `GET /venues/{id}/services` and `GET /venues/{id}/services/categories` | `id, name, description, price_minor, category_id, inventory{linked_item_id, linked_item_name, linked_item_icon, stock_count}`; categories `id, name` |
| bans | `GET /venues/{id}/patrons/banned` | `character_name, world, ban_reason` |
| active event | `GET /venues/{id}/events/active` | an event `{id, title}` or `null` |
| rooms | `GET /venues/{id}/rooms` | `id, name, notes, room_number, locked, disabled, status` (`available`, `reserved`, `locked`, `disabled`) |

## File structure

Plugin (`~/xvm-plugin-dev`, branch `feat/xvm-reads` from `feat/account-link`):
- Create `VenueManager/XvmApiModels.cs`: the xvm-api reply records.
- Create `VenueManager/XvmApiMapping.cs`: pure mapping to the plugin's DTOs.
- Create `VenueManager/XvmApiReads.cs`: the HTTP calls.
- Modify `VenueManager.Tests/VenueManager.Tests.csproj`: compile the three new files and `XIVAppApiModels.cs`.
- Create `VenueManager.Tests/XvmApiMappingTests.cs` and `XvmApiReadsTests.cs`.
- Modify `VenueManager/XIVAppApiClient.cs`: hold an `XvmApiReads`, widen `IsConfigured`.
- Modify `VenueManager/XIVAppVenueApi.cs` and `XIVAppShiftApi.cs`: read methods delegate when linked.
- Modify `VenueManager/Plugin.cs` and `VenueManager/UI/Tabs/SettingsTab.cs`: configure on startup and link, clear stale venue ids.

## Order

Tasks 1 to 3 are pure code with tests and need no game. Task 4 adds the HTTP layer, also tested without the game. Tasks 5 and 6 wire it in and need a build. Task 7 is the in-game check and Task 8 the staff-tier check. Confirm D3 before Task 5.

**Needs xvm-api #157 (`inventory_enabled`) and #158 (`membership_id` and `position_ids` on `/me/venues`) merged and deployed to the API the plugin points at.** Until then roles come back empty and the inventory tab stays hidden; everything else works. Both are read from fields the replies simply lack today, so the plugin code is safe against the old shape (missing fields read as empty and off).

Confirm with the user before any `dotnet` command in this repo, and before the clean build's `rm -rf` of `bin` and `obj`.

---

### Task 1: Test project compiles the new files

**Files:**
- Modify: `VenueManager.Tests/VenueManager.Tests.csproj`

- [ ] **Step 1:** In the second `<ItemGroup>`, next to the existing `XvmApiPairing.cs` line, add:

```xml
    <Compile Include="..\VenueManager\XIVAppApiModels.cs" Link="XIVAppApiModels.cs" />
    <Compile Include="..\VenueManager\XvmApiModels.cs" Link="XvmApiModels.cs" />
    <Compile Include="..\VenueManager\XvmApiMapping.cs" Link="XvmApiMapping.cs" />
    <Compile Include="..\VenueManager\XvmApiReads.cs" Link="XvmApiReads.cs" />
```

The test project will not compile until Tasks 2 to 4 create those files, so commit this together with Task 2.

---

### Task 2: Reply records, and the venue and shift mapping

**Files:**
- Create: `VenueManager/XvmApiModels.cs`
- Create: `VenueManager/XvmApiMapping.cs`
- Test: `VenueManager.Tests/XvmApiMappingTests.cs`

- [ ] **Step 1: Create the reply records** (`VenueManager/XvmApiModels.cs`)

```csharp
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace VenueManager
{
  internal sealed record XvmVenue(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("inventory_enabled")] bool InventoryEnabled);

  internal sealed record XvmMyVenue(
    [property: JsonPropertyName("venue")] XvmVenue Venue,
    [property: JsonPropertyName("effective_tier")] string EffectiveTier,
    [property: JsonPropertyName("membership_id")] int MembershipId,
    [property: JsonPropertyName("position_ids")] List<int>? PositionIds);

  internal sealed record XvmShift(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("position_id")] int? PositionId,
    [property: JsonPropertyName("scheduled_start")] string? ScheduledStart,
    [property: JsonPropertyName("scheduled_end")] string? ScheduledEnd,
    [property: JsonPropertyName("actual_start")] string? ActualStart,
    [property: JsonPropertyName("actual_end")] string? ActualEnd,
    [property: JsonPropertyName("notes")] string? Notes,
    [property: JsonPropertyName("status")] string Status);

  internal sealed record XvmPosition(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string Name);

  internal sealed record XvmInventory(
    [property: JsonPropertyName("linked_item_id")] int LinkedItemId,
    [property: JsonPropertyName("linked_item_name")] string? LinkedItemName,
    [property: JsonPropertyName("linked_item_icon")] int? LinkedItemIcon,
    [property: JsonPropertyName("stock_count")] int? StockCount);

  internal sealed record XvmService(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("price_minor")] int? PriceMinor,
    [property: JsonPropertyName("category_id")] int? CategoryId,
    [property: JsonPropertyName("inventory")] XvmInventory? Inventory);

  internal sealed record XvmCategory(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string Name);

  internal sealed record XvmBanned(
    [property: JsonPropertyName("character_name")] string CharacterName,
    [property: JsonPropertyName("world")] string World,
    [property: JsonPropertyName("ban_reason")] string? BanReason);

  internal sealed record XvmEvent(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("title")] string Title);

  internal sealed record XvmRoom(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("notes")] string? Notes,
    [property: JsonPropertyName("room_number")] int? RoomNumber,
    [property: JsonPropertyName("locked")] bool Locked,
    [property: JsonPropertyName("disabled")] bool Disabled,
    [property: JsonPropertyName("status")] string Status);
}
```

- [ ] **Step 2: Write the failing tests** (`VenueManager.Tests/XvmApiMappingTests.cs`)

```csharp
using VenueManager;
using Xunit;

public class XvmApiMappingTests
{
    [Theory]
    [InlineData("scheduled", "SCHEDULED")]
    [InlineData("active", "ACTIVE")]
    [InlineData("completed", "COMPLETED")]
    [InlineData("pending_approval", "PENDING")]
    [InlineData("missed", "MISSED")]
    [InlineData("cancelled", "CANCELLED")]
    [InlineData("something_new", "SOMETHING_NEW")]
    public void ShiftStatus_uses_the_vocabulary_the_shifts_tab_acts_on(string xvm, string expected)
    {
        Assert.Equal(expected, XvmApiMapping.ShiftStatus(xvm));
    }

    [Fact]
    public void Venues_keep_id_name_slug_and_show_the_tier_as_the_role()
    {
        var venues = XvmApiMapping.MapVenues(new[]
        {
            new XvmMyVenue(new XvmVenue("ven_1", "The Velvet Lotus", "velvet-lotus", true), "owner", 11, new List<int>()),
            new XvmMyVenue(new XvmVenue("ven_2", "Moon Bar", "moon-bar", false), "staff", 12, null),
        });

        Assert.Equal(2, venues.Count);
        Assert.Equal("ven_1", venues[0].Id);
        Assert.Equal("The Velvet Lotus", venues[0].Name);
        Assert.Equal("velvet-lotus", venues[0].Slug);
        Assert.Equal("OWNER", venues[0].Role);
        Assert.Equal("STAFF", venues[1].Role);
        Assert.Empty(venues[0].Addresses);
    }

    [Fact]
    public void Shifts_become_the_plugins_dtos_with_ids_as_strings()
    {
        var mine = new[]
        {
            new XvmShift(7, 3, "2026-10-10T19:00:00Z", "2026-10-10T23:00:00Z", null, null, "bring the shout", "scheduled"),
            new XvmShift(8, null, "2026-10-09T19:00:00Z", "2026-10-09T23:00:00Z", "2026-10-09T19:02:00Z", "2026-10-09T23:10:00Z", null, "completed"),
        };

        var result = XvmApiMapping.MapShifts(mine, new XvmShift[0], new Dictionary<int, string>());

        Assert.Equal(2, result.Shifts.Count);
        Assert.Equal("7", result.Shifts[0].Id);
        Assert.Equal("SCHEDULED", result.Shifts[0].Status);
        Assert.Equal("2026-10-10T19:00:00Z", result.Shifts[0].ScheduledStart);
        Assert.Equal("bring the shout", result.Shifts[0].Notes);
        Assert.Null(result.Shifts[0].ActualStart);
        Assert.Equal("COMPLETED", result.Shifts[1].Status);
        Assert.Equal("2026-10-09T23:10:00Z", result.Shifts[1].ActualEnd);
    }

    [Fact]
    public void A_shift_with_no_scheduled_times_gets_empty_strings_not_nulls()
    {
        var walkIn = new XvmShift(9, null, null, null, "2026-10-10T20:00:00Z", null, null, "active");
        var result = XvmApiMapping.MapShifts(new[] { walkIn }, new XvmShift[0], new Dictionary<int, string>());
        Assert.Equal("", result.Shifts[0].ScheduledStart);
        Assert.Equal("", result.Shifts[0].ScheduledEnd);
        Assert.Equal("ACTIVE", result.Shifts[0].Status);
    }

    [Fact]
    public void Open_shifts_carry_their_position_name()
    {
        var open = new[]
        {
            new XvmShift(20, 3, "2026-10-11T19:00:00Z", "2026-10-11T23:00:00Z", null, null, null, "open"),
            new XvmShift(21, null, "2026-10-12T19:00:00Z", "2026-10-12T23:00:00Z", null, null, null, "open"),
        };

        var result = XvmApiMapping.MapShifts(new XvmShift[0], open, new Dictionary<int, string> { [3] = "Shout runner" });

        Assert.Equal("20", result.OpenShifts[0].Id);
        Assert.Equal("Shout runner", result.OpenShifts[0].RoleName);
        Assert.Null(result.OpenShifts[1].RoleName);
    }
}
```

- [ ] **Step 3: Run it and confirm it fails.** Confirm with the user, then run `cd ~/xvm-plugin-dev && dotnet test VenueManager.Tests`. Expected: FAIL to compile, `XvmApiMapping` does not exist. Also create an empty `public sealed class XvmApiReads { }` in `VenueManager/XvmApiReads.cs` for now (Task 4 fills it in) so the linked file exists.

- [ ] **Step 4: Implement** (`VenueManager/XvmApiMapping.cs`)

```csharp
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace VenueManager
{
  internal static class XvmApiMapping
  {
    public static string ShiftStatus(string status) => status switch
    {
      "scheduled" => "SCHEDULED",
      "active" => "ACTIVE",
      "completed" => "COMPLETED",
      "pending_approval" => "PENDING",
      _ => status.ToUpperInvariant(),
    };

    public static List<XIVAppVenue> MapVenues(IEnumerable<XvmMyVenue> venues) =>
      venues.Select(v => new XIVAppVenue
      {
        Id = v.Venue.Id,
        Name = v.Venue.Name,
        Slug = v.Venue.Slug,
        Role = v.EffectiveTier.ToUpperInvariant(),
      }).ToList();

    public static ShiftsResponse MapShifts(IEnumerable<XvmShift> mine, IEnumerable<XvmShift> open, IReadOnlyDictionary<int, string> positionNames) =>
      new()
      {
        Shifts = mine.Select(s => new ShiftDto
        {
          Id = s.Id.ToString(CultureInfo.InvariantCulture),
          ScheduledStart = s.ScheduledStart ?? "",
          ScheduledEnd = s.ScheduledEnd ?? "",
          ActualStart = s.ActualStart,
          ActualEnd = s.ActualEnd,
          Status = ShiftStatus(s.Status),
          Notes = s.Notes,
        }).ToList(),
        OpenShifts = open.Select(s => new OpenShiftDto
        {
          Id = s.Id.ToString(CultureInfo.InvariantCulture),
          ScheduledStart = s.ScheduledStart ?? "",
          ScheduledEnd = s.ScheduledEnd ?? "",
          RoleName = s.PositionId is { } id && positionNames.TryGetValue(id, out var name) ? name : null,
        }).ToList(),
      };
  }
}
```

- [ ] **Step 5: Run it and confirm it passes.** Run: `cd ~/xvm-plugin-dev && dotnet test VenueManager.Tests`. Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: map xvm-api venues and shifts to the plugin's DTOs"
```

---

### Task 3: Roles, services, bans, active event and rooms

**Files:**
- Modify: `VenueManager/XvmApiMapping.cs`
- Modify: `VenueManager.Tests/XvmApiMappingTests.cs`

- [ ] **Step 1: Write the failing tests.** Add `using System.Linq;` at the top of the test file, then add inside `XvmApiMappingTests`:

```csharp
    [Fact]
    public void Roles_are_the_positions_the_callers_membership_holds()
    {
        var positions = new[] { new XvmPosition(3, "Bartender"), new XvmPosition(4, "Host"), new XvmPosition(5, "Shout runner") };

        var roles = XvmApiMapping.MapRoles(new List<int> { 3, 5 }, positions);

        Assert.Equal(new[] { "3", "5" }, roles.Select(r => r.Id));
        Assert.Equal(new[] { "Bartender", "Shout runner" }, roles.Select(r => r.Name));
    }

    [Fact]
    public void No_position_ids_or_an_unknown_position_gives_no_role()
    {
        Assert.Empty(XvmApiMapping.MapRoles(null, new[] { new XvmPosition(3, "Bartender") }));
        Assert.Empty(XvmApiMapping.MapRoles(new List<int> { 99 }, new[] { new XvmPosition(3, "Bartender") }));
    }

    [Fact]
    public void Services_carry_price_as_gil_text_category_name_and_linked_item()
    {
        var services = new[]
        {
            new XvmService(11, "House Cocktail", "Fruity", 1500, 2, new XvmInventory(4825, "Grilled Tuna", 21545, 12)),
            new XvmService(12, "Dance", null, null, null, null),
        };
        var categories = new[] { new XvmCategory(2, "Drinks") };

        var result = XvmApiMapping.MapServices(services, categories);

        Assert.Equal("11", result.Services[0].Id);
        Assert.Equal("1500", result.Services[0].Price);
        Assert.Equal("Drinks", result.Services[0].Category);
        Assert.Equal(4825, result.Services[0].LinkedItemId);
        Assert.Equal("Grilled Tuna", result.Services[0].LinkedItemName);
        Assert.Equal(21545, result.Services[0].LinkedItemIcon);
        Assert.Equal(12, result.Services[0].StockCount);
        Assert.Equal("0", result.Services[1].Price);
        Assert.Null(result.Services[1].Category);
        Assert.Null(result.Services[1].LinkedItemId);
    }

    [Fact]
    public void Bans_use_an_empty_reason_when_none_was_given()
    {
        var bans = XvmApiMapping.MapBanned(new[]
        {
            new XvmBanned("Some Person", "Cactuar", "harassment"),
            new XvmBanned("Other Person", "Faerie", null),
        });

        Assert.Equal("Some Person", bans[0].CharacterName);
        Assert.Equal("Cactuar", bans[0].World);
        Assert.Equal("harassment", bans[0].Reason);
        Assert.Equal("", bans[1].Reason);
    }

    [Fact]
    public void An_event_means_active_and_none_means_not_active()
    {
        var active = XvmApiMapping.MapActiveEvent(new XvmEvent(42, "Friday Night"));
        Assert.True(active.Active);
        Assert.Equal("42", active.EventId);
        Assert.Equal("Friday Night", active.Title);
        Assert.Equal("ACTIVE", active.Status);

        var none = XvmApiMapping.MapActiveEvent(null);
        Assert.False(none.Active);
        Assert.Null(none.EventId);
    }

    [Fact]
    public void Rooms_are_occupied_when_reserved_and_fall_back_to_a_number_for_their_name()
    {
        var rooms = XvmApiMapping.MapRooms(new[]
        {
            new XvmRoom(5, "Moonlit Suite", "back stairs", 2, false, false, "reserved"),
            new XvmRoom(6, null, null, 3, true, false, "locked"),
            new XvmRoom(7, "Attic", null, null, false, true, "disabled"),
        });

        Assert.True(rooms[0].IsOccupied);
        Assert.Equal("5", rooms[0].Id);
        Assert.Equal("Moonlit Suite", rooms[0].Name);
        Assert.Equal("back stairs", rooms[0].Note);
        Assert.Equal(2, rooms[0].RoomNumber);
        Assert.False(rooms[1].IsOccupied);
        Assert.True(rooms[1].Locked);
        Assert.Equal("Room 3", rooms[1].Name);
        Assert.True(rooms[2].Disabled);
        Assert.Equal(0, rooms[2].RoomNumber);
    }
```

- [ ] **Step 2: Run it and confirm it fails.** Confirm with the user, then run `dotnet test VenueManager.Tests`. Expected: FAIL to compile, `MapRoles`, `MapServices`, `MapBanned`, `MapActiveEvent` and `MapRooms` do not exist.

- [ ] **Step 3: Implement.** Add inside `XvmApiMapping`:

```csharp
    public static List<Role> MapRoles(IEnumerable<int>? positionIds, IEnumerable<XvmPosition> positions)
    {
      if (positionIds is null) return new List<Role>();
      var byId = positions.ToDictionary(p => p.Id);
      return positionIds
        .Where(byId.ContainsKey)
        .Select(id => new Role { Id = id.ToString(CultureInfo.InvariantCulture), Name = byId[id].Name })
        .ToList();
    }

    public static ServicesResponse MapServices(IEnumerable<XvmService> services, IEnumerable<XvmCategory> categories)
    {
      var names = categories.ToDictionary(c => c.Id, c => c.Name);
      return new ServicesResponse
      {
        Services = services.Select(s => new Service
        {
          Id = s.Id.ToString(CultureInfo.InvariantCulture),
          Name = s.Name,
          Description = s.Description,
          Price = (s.PriceMinor ?? 0).ToString(CultureInfo.InvariantCulture),
          Category = s.CategoryId is { } id && names.TryGetValue(id, out var name) ? name : null,
          StockCount = s.Inventory?.StockCount,
          LinkedItemId = s.Inventory?.LinkedItemId,
          LinkedItemName = s.Inventory?.LinkedItemName,
          LinkedItemIcon = s.Inventory?.LinkedItemIcon,
        }).ToList(),
      };
    }

    public static List<BannedPatron> MapBanned(IEnumerable<XvmBanned> banned) =>
      banned.Select(b => new BannedPatron { CharacterName = b.CharacterName, World = b.World, Reason = b.BanReason ?? "" }).ToList();

    public static ActiveEventResponse MapActiveEvent(XvmEvent? active) =>
      active is null
        ? new ActiveEventResponse { Active = false }
        : new ActiveEventResponse { Active = true, EventId = active.Id.ToString(CultureInfo.InvariantCulture), Title = active.Title, Status = "ACTIVE" };

    public static List<Room> MapRooms(IEnumerable<XvmRoom> rooms) =>
      rooms.Select(r => new Room
      {
        Id = r.Id.ToString(CultureInfo.InvariantCulture),
        Name = r.Name ?? $"Room {r.RoomNumber}",
        IsOccupied = r.Status == "reserved",
        Note = r.Notes,
        Locked = r.Locked,
        Disabled = r.Disabled,
        RoomNumber = r.RoomNumber ?? 0,
      }).ToList();
```

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: map xvm-api roles, services, bans, event and rooms to the plugin's DTOs"
```

---

### Task 4: The HTTP layer

**Files:**
- Modify: `VenueManager/XvmApiReads.cs`
- Test: `VenueManager.Tests/XvmApiReadsTests.cs`

- [ ] **Step 1: Write the failing tests** (`VenueManager.Tests/XvmApiReadsTests.cs`). The fake handler is keyed by path prefix so call order does not matter, and the longest matching prefix wins.

```csharp
using System.Net;
using System.Text;
using VenueManager;
using Xunit;

public class XvmApiReadsTests
{
    private sealed class RoutedHandler : HttpMessageHandler
    {
        private readonly Dictionary<string, (HttpStatusCode Status, string Json)> _routes = new();
        public List<(string PathAndQuery, string? Authorization)> Requests { get; } = new();

        public RoutedHandler On(string pathPrefix, string json, HttpStatusCode status = HttpStatusCode.OK)
        {
            _routes[pathPrefix] = (status, json);
            return this;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var pathAndQuery = request.RequestUri!.PathAndQuery;
            Requests.Add((pathAndQuery, request.Headers.Authorization?.ToString()));
            var route = _routes.Where(r => pathAndQuery.StartsWith(r.Key)).OrderByDescending(r => r.Key.Length).FirstOrDefault();
            var (status, json) = route.Key is null ? (HttpStatusCode.NotFound, "{}") : route.Value;
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
    }

    private static readonly DateTime Now = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);

    private static XvmApiReads Reads(RoutedHandler handler) => new(new HttpClient(handler), "https://api.test/", "s3cret");

    [Fact]
    public async Task Venues_come_from_me_venues_with_the_bearer_secret()
    {
        var handler = new RoutedHandler().On("/me/venues", "[{\"venue\":{\"id\":\"v1\",\"name\":\"Lotus\",\"slug\":\"lotus\"},\"tier\":\"owner\",\"effective_tier\":\"owner\"}]");

        var venues = await Reads(handler).GetVenuesAsync();

        Assert.Single(venues);
        Assert.Equal("v1", venues[0].Id);
        Assert.Equal("OWNER", venues[0].Role);
        Assert.Equal("Bearer s3cret", handler.Requests[0].Authorization);
        Assert.Equal("/me/venues", handler.Requests[0].PathAndQuery);
    }

    [Fact]
    public async Task Shifts_ask_for_mine_and_open_over_a_day_back_to_two_weeks_ahead()
    {
        var handler = new RoutedHandler()
            .On("/venues/v1/shifts?from=2026-10-09T12%3A00%3A00Z&to=2026-10-24T12%3A00%3A00Z&mine=true", "[{\"id\":7,\"position_id\":null,\"scheduled_start\":\"2026-10-10T19:00:00Z\",\"scheduled_end\":\"2026-10-10T23:00:00Z\",\"actual_start\":null,\"actual_end\":null,\"notes\":null,\"status\":\"scheduled\"}]")
            .On("/venues/v1/shifts?from=2026-10-09T12%3A00%3A00Z&to=2026-10-24T12%3A00%3A00Z&open_only=true", "[{\"id\":20,\"position_id\":3,\"scheduled_start\":\"2026-10-11T19:00:00Z\",\"scheduled_end\":\"2026-10-11T23:00:00Z\",\"actual_start\":null,\"actual_end\":null,\"notes\":null,\"status\":\"open\"}]")
            .On("/venues/v1/positions", "[{\"id\":3,\"name\":\"Shout runner\"}]");

        var shifts = await Reads(handler).GetShiftsAsync("v1", Now);

        Assert.Equal("SCHEDULED", shifts.Shifts[0].Status);
        Assert.Equal("Shout runner", shifts.OpenShifts[0].RoleName);
    }

    [Fact]
    public async Task Positions_are_only_fetched_when_there_are_open_shifts()
    {
        var handler = new RoutedHandler().On("/venues/v1/shifts", "[]");

        await Reads(handler).GetShiftsAsync("v1", Now);

        Assert.DoesNotContain(handler.Requests, r => r.PathAndQuery.Contains("/positions"));
    }

    [Fact]
    public async Task Roles_are_the_positions_listed_on_the_callers_me_venues_row()
    {
        var handler = new RoutedHandler()
            .On("/me/venues", "[{\"venue\":{\"id\":\"v1\",\"name\":\"Lotus\",\"slug\":\"lotus\",\"inventory_enabled\":false},\"tier\":\"staff\",\"effective_tier\":\"staff\",\"membership_id\":7,\"position_ids\":[4]},{\"venue\":{\"id\":\"v2\",\"name\":\"Moon\",\"slug\":\"moon\",\"inventory_enabled\":false},\"tier\":\"staff\",\"effective_tier\":\"staff\",\"membership_id\":8,\"position_ids\":[3]}]")
            .On("/venues/v1/positions", "[{\"id\":3,\"name\":\"Bartender\"},{\"id\":4,\"name\":\"Host\"}]");

        var roles = await Reads(handler).GetRolesAsync("v1");

        Assert.Equal(new[] { "Host" }, roles.Select(r => r.Name));
        Assert.DoesNotContain(handler.Requests, r => r.PathAndQuery.Contains("/memberships"));
    }

    [Fact]
    public async Task An_old_api_without_position_ids_gives_no_roles()
    {
        var handler = new RoutedHandler()
            .On("/me/venues", "[{\"venue\":{\"id\":\"v1\",\"name\":\"Lotus\",\"slug\":\"lotus\"},\"tier\":\"staff\",\"effective_tier\":\"staff\"}]")
            .On("/venues/v1/positions", "[{\"id\":3,\"name\":\"Bartender\"}]");

        Assert.Empty(await Reads(handler).GetRolesAsync("v1"));
    }

    [Fact]
    public async Task Services_join_their_category_names()
    {
        var handler = new RoutedHandler()
            .On("/venues/v1/services/categories", "[{\"id\":2,\"name\":\"Drinks\",\"sort_order\":0}]")
            .On("/venues/v1/services", "[{\"id\":11,\"name\":\"House Cocktail\",\"description\":null,\"price_minor\":1500,\"category_id\":2,\"inventory\":null}]");

        var result = await Reads(handler).GetServicesAsync("v1");

        Assert.Equal("Drinks", result.Services[0].Category);
        Assert.Equal("1500", result.Services[0].Price);
    }

    [Fact]
    public async Task Inventory_follows_the_venues_inventory_enabled_flag()
    {
        var handler = new RoutedHandler()
            .On("/me/venues", "[{\"venue\":{\"id\":\"v1\",\"name\":\"Lotus\",\"slug\":\"lotus\",\"inventory_enabled\":true},\"tier\":\"staff\",\"effective_tier\":\"staff\",\"membership_id\":7,\"position_ids\":[]},{\"venue\":{\"id\":\"v2\",\"name\":\"Moon\",\"slug\":\"moon\"},\"tier\":\"owner\",\"effective_tier\":\"owner\",\"membership_id\":8,\"position_ids\":[]}]");
        var reads = Reads(handler);

        Assert.True(await reads.GetInventoryEnabledAsync("v1"));
        Assert.False(await reads.GetInventoryEnabledAsync("v2"));
        Assert.False(await reads.GetInventoryEnabledAsync("unknown"));
    }

    [Fact]
    public async Task Bans_active_event_and_rooms_map_through()
    {
        var handler = new RoutedHandler()
            .On("/venues/v1/patrons/banned", "[{\"character_name\":\"Some Person\",\"world\":\"Cactuar\",\"ban_reason\":null}]")
            .On("/venues/v1/events/active", "{\"id\":42,\"title\":\"Friday Night\"}")
            .On("/venues/v2/events/active", "null")
            .On("/venues/v1/rooms", "[{\"id\":5,\"name\":\"Suite\",\"notes\":null,\"room_number\":1,\"locked\":false,\"disabled\":false,\"status\":\"reserved\"}]");
        var reads = Reads(handler);

        Assert.Equal("Some Person", (await reads.GetBannedPatronsAsync("v1"))[0].CharacterName);
        Assert.True((await reads.GetActiveEventAsync("v1")).Active);
        Assert.False((await reads.GetActiveEventAsync("v2")).Active);
        Assert.True((await reads.GetRoomsAsync("v1"))[0].IsOccupied);
    }

    [Fact]
    public async Task A_failed_call_throws_with_the_path_and_status()
    {
        var handler = new RoutedHandler().On("/me/venues", "{}", HttpStatusCode.Unauthorized);
        var ex = await Assert.ThrowsAsync<XIVAppApiException>(() => Reads(handler).GetVenuesAsync());
        Assert.Contains("/me/venues", ex.Message);
        Assert.Contains("401", ex.Message);
    }

    [Fact]
    public async Task Venue_ids_are_escaped_in_paths()
    {
        var handler = new RoutedHandler().On("/venues/a%20b/rooms", "[]");
        await Reads(handler).GetRoomsAsync("a b");
        Assert.Equal("/venues/a%20b/rooms", handler.Requests[0].PathAndQuery);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails.** Confirm with the user, then run `dotnet test VenueManager.Tests`. Expected: FAIL to compile, `XvmApiReads` has no constructor or methods.

- [ ] **Step 3: Implement** (replace the empty `VenueManager/XvmApiReads.cs`)

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Threading.Tasks;

namespace VenueManager
{
  public sealed class XvmApiReads
  {
    private static readonly TimeSpan LookBack = TimeSpan.FromDays(1);
    private static readonly TimeSpan LookAhead = TimeSpan.FromDays(14);

    private readonly HttpClient _http;
    private readonly string _root;
    private readonly string _secret;

    public XvmApiReads(HttpClient http, string baseUrl, string secret)
    {
      _http = http;
      _root = baseUrl.Trim().TrimEnd('/');
      _secret = secret;
    }

    private async Task<T?> GetAsync<T>(string path)
    {
      using var request = new HttpRequestMessage(HttpMethod.Get, $"{_root}{path}");
      request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _secret);
      using var response = await _http.SendAsync(request);
      if (!response.IsSuccessStatusCode)
        throw new XIVAppApiException($"{path}: {(int)response.StatusCode}");
      return await response.Content.ReadFromJsonAsync<T>();
    }

    private static string Venue(string venueId) => $"/venues/{Uri.EscapeDataString(venueId)}";

    private async Task<XvmMyVenue?> MyVenueAsync(string venueId) =>
      (await GetAsync<List<XvmMyVenue>>("/me/venues") ?? new List<XvmMyVenue>()).FirstOrDefault(v => v.Venue.Id == venueId);

    public async Task<List<XIVAppVenue>> GetVenuesAsync() =>
      XvmApiMapping.MapVenues(await GetAsync<List<XvmMyVenue>>("/me/venues") ?? new List<XvmMyVenue>());

    public async Task<ShiftsResponse> GetShiftsAsync(string venueId, DateTime now)
    {
      var window = $"from={Uri.EscapeDataString((now - LookBack).ToString("yyyy-MM-ddTHH:mm:ssZ"))}&to={Uri.EscapeDataString((now + LookAhead).ToString("yyyy-MM-ddTHH:mm:ssZ"))}";
      var mine = await GetAsync<List<XvmShift>>($"{Venue(venueId)}/shifts?{window}&mine=true") ?? new List<XvmShift>();
      var open = await GetAsync<List<XvmShift>>($"{Venue(venueId)}/shifts?{window}&open_only=true") ?? new List<XvmShift>();
      var names = new Dictionary<int, string>();
      if (open.Count > 0)
        names = (await GetAsync<List<XvmPosition>>($"{Venue(venueId)}/positions") ?? new List<XvmPosition>()).ToDictionary(p => p.Id, p => p.Name);
      return XvmApiMapping.MapShifts(mine, open, names);
    }

    public async Task<List<Role>> GetRolesAsync(string venueId)
    {
      var own = await MyVenueAsync(venueId);
      if (own?.PositionIds is not { Count: > 0 }) return new List<Role>();
      var positions = await GetAsync<List<XvmPosition>>($"{Venue(venueId)}/positions") ?? new List<XvmPosition>();
      return XvmApiMapping.MapRoles(own.PositionIds, positions);
    }

    public async Task<ServicesResponse> GetServicesAsync(string venueId)
    {
      var services = await GetAsync<List<XvmService>>($"{Venue(venueId)}/services") ?? new List<XvmService>();
      var categories = await GetAsync<List<XvmCategory>>($"{Venue(venueId)}/services/categories") ?? new List<XvmCategory>();
      return XvmApiMapping.MapServices(services, categories);
    }

    public async Task<bool> GetInventoryEnabledAsync(string venueId) =>
      (await MyVenueAsync(venueId))?.Venue.InventoryEnabled ?? false;

    public async Task<List<BannedPatron>> GetBannedPatronsAsync(string venueId) =>
      XvmApiMapping.MapBanned(await GetAsync<List<XvmBanned>>($"{Venue(venueId)}/patrons/banned") ?? new List<XvmBanned>());

    public async Task<ActiveEventResponse> GetActiveEventAsync(string venueId) =>
      XvmApiMapping.MapActiveEvent(await GetAsync<XvmEvent>($"{Venue(venueId)}/events/active"));

    public async Task<List<Room>> GetRoomsAsync(string venueId) =>
      XvmApiMapping.MapRooms(await GetAsync<List<XvmRoom>>($"{Venue(venueId)}/rooms") ?? new List<XvmRoom>());
  }
}
```

The class is `public` and the record types it uses internally are `internal`; that is fine because no public member exposes an internal type.

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: read venues, shifts, roles, services, bans, event and rooms from xvm-api"
```

---

### Task 5: Wire the reads into the existing API classes

Confirm D3 and D6 with the user before this task.

**Files:**
- Modify: `VenueManager/XIVAppApiClient.cs`
- Modify: `VenueManager/XIVAppVenueApi.cs`
- Modify: `VenueManager/XIVAppShiftApi.cs`

- [ ] **Step 1: Hold an `XvmApiReads` in the client.** In `XIVAppApiClient.cs`, add these members next to `IsConfigured`, and widen `IsConfigured` so the sixteen existing "is the client configured" gates also let a linked account through:

```csharp
    private static readonly HttpClient XvmHttp = new() { Timeout = TimeSpan.FromSeconds(10) };

    internal XvmApiReads? Xvm { get; private set; }

    public bool IsXvmLinked => Xvm is not null;

    public void ConfigureXvm(string url, string secret)
    {
      Xvm = string.IsNullOrWhiteSpace(secret) ? null : new XvmApiReads(XvmHttp, url, secret);
    }

    public void ClearXvm() => Xvm = null;

    private bool LegacyConfigured => !string.IsNullOrEmpty(_apiKey) && !string.IsNullOrEmpty(BaseUrl);

    public bool IsConfigured => LegacyConfigured || IsXvmLinked;

    internal async Task<T> SafelyAsync<T>(Func<Task<T>> call, T fallback, string errorContext)
    {
      try
      {
        return await call();
      }
      catch (Exception ex)
      {
        Plugin.Log.Warning($"Failed to {errorContext}: {ex.Message}");
        return fallback;
      }
    }
```

Replace the existing `public bool IsConfigured => ...` line with the new definition above (keep only one). In `GetAsync` and `PostForResultAsync`, change `if (!IsConfigured)` to `if (!LegacyConfigured)` so the old write routes still need the old key.

- [ ] **Step 2: Delegate the venue-side reads.** In `XIVAppVenueApi.cs`, replace these methods (leave all the write methods as they are):

```csharp
    public async Task<List<XIVAppVenue>> GetVenuesAsync()
    {
      if (_client.Xvm is { } xvm)
      {
        try
        {
          return await xvm.GetVenuesAsync();
        }
        catch (XIVAppApiException)
        {
          throw;
        }
        catch (Exception ex)
        {
          throw new XIVAppApiException($"Error fetching venues: {ex.Message}", ex);
        }
      }
      throw new XIVAppApiException("Link your account first: Settings, Account link.");
    }

    public Task<ServicesResponse?> GetServicesAsync(string venueId) =>
      _client.Xvm is { } xvm
        ? _client.SafelyAsync<ServicesResponse?>(async () => await xvm.GetServicesAsync(venueId), null, "fetch services")
        : Task.FromResult<ServicesResponse?>(null);

    public Task<List<Role>> GetRolesAsync(string venueId) =>
      _client.Xvm is { } xvm
        ? _client.SafelyAsync(() => xvm.GetRolesAsync(venueId), new List<Role>(), "get roles")
        : Task.FromResult(new List<Role>());

    public Task<List<BannedPatron>?> GetBannedPatronsAsync(string venueId) =>
      _client.Xvm is { } xvm
        ? _client.SafelyAsync<List<BannedPatron>?>(async () => await xvm.GetBannedPatronsAsync(venueId), null, "get banned patrons")
        : Task.FromResult<List<BannedPatron>?>(null);

    public Task<ActiveEventResponse?> GetActiveEventAsync(string venueId) =>
      _client.Xvm is { } xvm
        ? _client.SafelyAsync<ActiveEventResponse?>(async () => await xvm.GetActiveEventAsync(venueId), new ActiveEventResponse { Active = false }, "fetch active event")
        : Task.FromResult<ActiveEventResponse?>(new ActiveEventResponse { Active = false });

    public Task<List<Room>> GetRoomsAsync(string venueId) =>
      _client.Xvm is { } xvm
        ? _client.SafelyAsync(() => xvm.GetRoomsAsync(venueId), new List<Room>(), "get rooms")
        : Task.FromResult(new List<Room>());

    public Task<bool> GetInventoryEnabledAsync(string venueId) =>
      _client.Xvm is { } xvm
        ? _client.SafelyAsync(() => xvm.GetInventoryEnabledAsync(venueId), false, "get inventory settings")
        : Task.FromResult(false);
```

This replaces the old `GetVenuesAsync`, `GetServicesAsync`, `GetRolesAsync`, `GetBannedPatronsAsync`, `GetActiveEventAsync`, `GetRoomsAsync` and `GetInventoryEnabledAsync` bodies that called `/api/plugin/...`.

- [ ] **Step 3: Delegate the shift read.** In `XIVAppShiftApi.cs`, replace `GetShiftsResponseAsync`:

```csharp
    public Task<ShiftsResponse> GetShiftsResponseAsync(string venueId) =>
      _client.Xvm is { } xvm
        ? _client.SafelyAsync(() => xvm.GetShiftsAsync(venueId, DateTime.UtcNow), new ShiftsResponse(), "get shifts")
        : Task.FromResult(new ShiftsResponse());
```

- [ ] **Step 4: Compile.** Confirm with the user, then run: `cd ~/xvm-plugin-dev && dotnet build VenueManager.sln -c Release`. Expected: 0 errors. Fix any name mismatch before moving on.

- [ ] **Step 5: Commit**

```bash
git add VenueManager
git commit -m "feat: the plugin's reads go to xvm-api when the account is linked"
```

---

### Task 6: Configure on startup and link, and clear stale venue ids

**Files:**
- Modify: `VenueManager/Plugin.cs` (startup block near line 173)
- Modify: `VenueManager/UI/Tabs/SettingsTab.cs` (`LinkAccountAsync`, the Unlink button, and the venue fetch near line 755)

- [ ] **Step 1: Startup.** In `Plugin.cs`, change the block that configures the client so a linked account also loads its data:

```csharp
      xivAppClient = new XIVAppApiClient();
      if (!string.IsNullOrEmpty(Configuration.xvmApiSecret))
        xivAppClient.ConfigureXvm(Configuration.xvmApiUrl, Configuration.xvmApiSecret);
      if (!string.IsNullOrEmpty(Configuration.xivAppApiKey))
      {
          xivAppClient.Configure(Configuration.xivAppApiKey, Configuration.xivAppServerUrl);
          Log.Information("XIV-App API Client configured with server: {0}", Configuration.xivAppServerUrl);
      }
      if (xivAppClient.IsConfigured)
      {
          // Fire-and-forget: a server outage at launch must not block plugin init
          _ = AutoLoadXivAppDataAsync();
```

Keep the rest of the original block (the closing braces and anything after `AutoLoadXivAppDataAsync();`) exactly as it was; only the condition and the two configure calls change.

- [ ] **Step 2: Link and unlink.** In `SettingsTab.LinkAccountAsync`, after `this.configuration.Save();` in the success branch, add:

```csharp
        plugin.xivAppClient?.ConfigureXvm(url, result.Secret!);
        _ = FetchXivAppVenuesAsync();
```

In `DrawAccountLink`, inside the Unlink button handler after `this.configuration.Save();`, add `plugin.xivAppClient?.ClearXvm();`.

- [ ] **Step 3: Clear stale venue ids.** The venue ids are now xvm-api ids, so an id saved by the old dashboard route will never match. In `FetchXivAppVenuesAsync`, after the venues are loaded into `plugin.xivAppVenues`, add:

```csharp
      var known = plugin.xivAppVenues.Select(v => v.Id).ToHashSet();
      if (!string.IsNullOrEmpty(this.configuration.selectedVenueId) && !known.Contains(this.configuration.selectedVenueId))
        this.configuration.selectedVenueId = "";
      foreach (var stale in this.configuration.houseToXivAppVenue.Where(kv => !known.Contains(kv.Value)).Select(kv => kv.Key).ToList())
        this.configuration.houseToXivAppVenue.Remove(stale);
      this.configuration.Save();
```

Use the real name of the venue list field if it differs from `plugin.xivAppVenues`; read it from the lines just above the insertion point.

- [ ] **Step 4: Make the settings messages accept a link.** In `FetchXivAppVenuesAsync`, the "enter your API key first" check already reads `IsConfigured`, which now includes the link. Change its message to `"Link your account first: Account link above."`. Leave the `ReconfigureXivAppClient` self-heal as it is.

- [ ] **Step 5: Build and commit.** Confirm with the user, then run the clean build with `rm -rf VenueManager/bin VenueManager/obj` first.

```bash
git add VenueManager
git commit -m "feat: configure xvm-api reads on startup and link, and drop venue ids that no longer match"
```

---

### Task 7: Check it in the game

Needs the rebuilt DLL loaded, a linked account, and the dev URL in the plugin config (see the pairing plan, Task 10).

- [ ] **Step 1:** Open Settings. The venue list fills from your venues and the selector shows xvm-api venue names. The old selection, if it was a dashboard id, is cleared.
- [ ] **Step 2:** Pick a venue. The Shifts tab lists your shifts at that venue. A scheduled shift shows under Upcoming, an active one under Active, a finished one under Completed.
- [ ] **Step 3:** The Services list loads with names, prices and categories. A service with a linked item shows its stock.
- [ ] **Step 4:** The Rooms tab lists rooms. A reserved room shows Occupied.
- [ ] **Step 5:** Clock-in, claim, sales, patron visits, bans and room actions are expected to fail until the write plan (D3).
- [ ] **Step 6:** Record the result here.

---

### Task 8: Check access as a staff-tier member

Everything above was verified as an owner. Plain staff are most plugin users.

- [ ] **Step 1:** With an account that is only **staff** at some venue, link the plugin and run Task 7 there.
- [ ] **Step 2:** For any read that returns 403 for staff, record the endpoint here and ask Allegro whether it should be open to any member (positions, services, bans and the roster are documented as readable by any member).
- [ ] **Step 3:** Confirm a staff member sees the inventory tab exactly when the venue's `inventory_enabled` is on, and sees their own jobs on the Shifts tab.

---

## After this plan

1. **Write routes** (its own plan): clock-in, clock-out and claim (per shift, no early limit, no open or closed side effect), patron visits, sales, bans, room reserve, release and status, inventory link and restock.
2. **Venue auto-map:** `GET /me/venues` plus `GET /venues/{id}` for the address fields, matching on world, district, ward, plot or apartment plus building, and room. It depends on the required-address change (dashboard #187) and rebuilds the house links that Task 6 clears.
3. **Shift prompts:** a notification at the scheduled start and end with a Clock in and Clock out button, across every venue through `GET /me/shifts`.
4. **Retire the old path:** the `/api/plugin/keys` routes, `pluginAuthGate`, the Prisma `ApiKey` table, and the migration-day revoke of every `vm_` key.

## Self-review

**Spec coverage.** Every plugin read has a task: venues and shifts (Task 2), roles, services, bans, event and rooms (Task 3), the HTTP calls (Task 4), the wiring (Tasks 5 and 6), the in-game and staff checks (Tasks 7 and 8). D1 to D8 are each carried out or explicitly deferred, and D3 is marked to confirm with the user before Task 5.

**Placeholder scan.** No step says TBD or "add handling". Task 6 steps 1 and 3 tell the engineer to keep the surrounding original code and to use the real field name where I could not see it; both name exactly what to look at.

**Consistency.** `XvmApiReads` exposes `GetVenuesAsync`, `GetShiftsAsync(venueId, now)`, `GetRolesAsync`, `GetServicesAsync`, `GetInventoryEnabledAsync`, `GetBannedPatronsAsync`, `GetActiveEventAsync` and `GetRoomsAsync`; the facades in Task 5 call exactly those names. The `XvmApiMapping` methods used by `XvmApiReads` (`MapVenues`, `MapShifts`, `MapRoles`, `MapServices`, `MapBanned`, `MapActiveEvent`, `MapRooms`) are all defined in Tasks 2 and 3. The record names match between `XvmApiModels.cs` and the tests.
