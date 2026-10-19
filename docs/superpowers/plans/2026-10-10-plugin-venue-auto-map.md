# Plugin Venue Auto-Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a person stands in a house that matches the address of a venue they work at, the plugin links that house to the venue by itself, switches to that venue's data (shifts, services, rooms, bans), and keeps working with no manual venue picking.

**Architecture:** A pure `VenueAddressMatcher` compares the game's house address (world, district, ward, plot, or apartment room plus main or subdivision) with the address on each venue in xvm-api and answers with one venue id or nothing. A new `XvmApiReads.GetVenueAddressesAsync` fetches the addresses. `Plugin` runs the matcher after the venue list loads and when a house is entered, fills the existing `houseToXivAppVenue` link table for houses that have no link yet, and then follows the house to its venue. Manual links are never overwritten. The matcher and the address fetch have no Dalamud dependency, so xunit tests them directly.

**Tech Stack:** C# on .NET 10, Dalamud plugin (`xvm-plugin-dev`, the local copy), xunit.

**Status:** Built and verified in game (plugin PR #4, stacked on #3). It follows the pairing, reads and writes plans (dashboard #190 and #191 and the pairing plan) and needs dashboard #187 (a complete address on every venue) merged to be useful for real venues. It can be built and tested earlier against a test venue whose address is set through the API.

---

## Decisions

| # | Decision | State |
|---|---|---|
| A1 | What is compared: world, district, ward, and then either the plot (a house or an FC house) or the apartment room plus main or subdivision (an apartment). House size is never compared: the size is part of the game's territory id, and a venue's address does not record it. | Decided |
| A2 | An FC house is a plot. Standing in a chamber inside it still matches the plot venue, because the website has no chamber address kind (#187) and a venue run from an FC house is a plot. The chamber number only matters for the Rooms tab. | Decided |
| A3 | A link is only filled in when exactly one venue matches. Two venues with the same address, or none, leave the house unlinked. Nothing is guessed. | Decided |
| A4 | An existing link, manual or automatic, is never replaced. The Venues tab dropdown stays as the way to fix or clear one. | Decided |
| A5 | District and world comparison ignores case and surrounding spaces. The plugin's district names (Mist, Goblet, Lavender Beds, Empyreum, Shirogane) are the same five names #187 enforces on the website. | Verified |
| A6 | Only venues the person is a member of are considered, since the address list comes from their own `/me/venues`. | Decided |
| A7 | Following the house: when the current house is linked, the plugin's current venue becomes that venue and its data loads. The Settings venue picker stays as a manual override for now. Removing it is a separate small change. | Decided, works in game |
| A8 | A house the person has not saved yet, but that matches a venue, is saved automatically with the venue's name, so the patron list and chat alerts work with no setup. A saved house that is later deleted keeps its link and is not re-saved. | Decided, works in game |
| A9 | The plugin's apartment values: `plot` is the game's value plus one, so a main-division apartment reads -127 and a subdivision apartment reads -126. | Verified in game (Shirogane, 2026-10-10: main -127 room 18, subdivision -126 room 2) |
| A10 | An FC chamber has its own house id, so chambers are never linked or saved as venues. Entering one still switches the current venue to the FC house's venue by address. Without this each chamber became a new Venues tab entry. | Decided, found in game |
| A11 | A house that matches nothing refetches the venue addresses, at most once a minute, then tries again. Addresses are otherwise loaded with the venue list, so an address edited while the plugin runs would not link until a restart. | Decided, found in game |
| A12 | Lifestream cannot be handed an apartment address, and the existing teleport sent plot -127, which it read as plot 12. The teleport button is disabled for apartments. | Decided, found in game |

## What each side holds

| | Plugin house (`Venue` class) | xvm-api venue (`GET /venues/{id}`) |
|---|---|---|
| world | `WorldName` | `world` |
| district | `district` | `district` |
| ward | `ward` (one-based) | `ward` |
| plot | `plot` (greater than 0 for a plot) | `plot` |
| apartment | `room`, with `plot` -127 (main) or -126 (subdivision) | `room`, and `subdivision` true or false |

xvm-api's own `apartment` field is unused. The dashboard writes the apartment number to `room` (the apartment to room mapping from the profile fields cutover).

Confirm with the user before any `dotnet` command in this repo, and before any clean build's `rm -rf` of `bin` and `obj`. Build with `dotnet build VenueManager.sln -c Release` (the `.sln` gives `bin/x64/Release`).

---

### Task 1: Test project compiles the new file

**Files:**
- Modify: `VenueManager.Tests/VenueManager.Tests.csproj`

- [ ] **Step 1:** In the second `<ItemGroup>`, next to the lines the earlier plans added, add:

```xml
    <Compile Include="..\VenueManager\VenueAddressMatcher.cs" Link="VenueAddressMatcher.cs" />
```

The test project will not compile until Task 2 creates that file, so commit this with Task 2.

---

### Task 2: The matcher

**Files:**
- Create: `VenueManager/VenueAddressMatcher.cs`
- Test: `VenueManager.Tests/VenueAddressMatcherTests.cs`

- [ ] **Step 1: Write the failing tests** (`VenueManager.Tests/VenueAddressMatcherTests.cs`)

```csharp
using VenueManager;
using Xunit;

public class VenueAddressMatcherTests
{
    private static XvmVenueAddress PlotVenue(string id, string world = "Raiden", string? district = "Lavender Beds", int ward = 6, int plot = 6) =>
        new(id, world, district, ward, plot, null, null);

    private static XvmVenueAddress ApartmentVenue(string id, int room, bool subdivision, int ward = 12) =>
        new(id, "Raiden", "Mist", ward, null, room, subdivision);

    private static readonly HouseAddress FcHouse = new("Raiden", "Lavender Beds", 6, HouseKind.Plot, 6, 0);

    [Fact]
    public void A_plot_matches_on_world_district_ward_and_plot()
    {
        Assert.Equal("v1", VenueAddressMatcher.FindUnique(FcHouse, new[] { PlotVenue("v1"), PlotVenue("v2", plot: 7) }));
    }

    [Fact]
    public void Standing_in_a_chamber_still_matches_the_plot_venue()
    {
        var inChamber = FcHouse with { Room = 3 };
        Assert.Equal("v1", VenueAddressMatcher.FindUnique(inChamber, new[] { PlotVenue("v1") }));
    }

    [Theory]
    [InlineData("Twintania", "Lavender Beds", 6, 6)]
    [InlineData("Raiden", "Mist", 6, 6)]
    [InlineData("Raiden", "Lavender Beds", 7, 6)]
    [InlineData("Raiden", "Lavender Beds", 6, 7)]
    public void Any_difference_in_the_address_is_no_match(string world, string district, int ward, int plot)
    {
        var venue = PlotVenue("v1", world, district, ward, plot);
        Assert.Null(VenueAddressMatcher.FindUnique(FcHouse, new[] { venue }));
    }

    [Fact]
    public void World_and_district_ignore_case_and_spaces()
    {
        var venue = PlotVenue("v1", " raiden ", "lavender beds");
        Assert.Equal("v1", VenueAddressMatcher.FindUnique(FcHouse, new[] { venue }));
    }

    [Fact]
    public void A_legacy_venue_with_no_district_never_matches()
    {
        Assert.Null(VenueAddressMatcher.FindUnique(FcHouse, new[] { PlotVenue("v1", district: null) }));
    }

    [Fact]
    public void An_apartment_matches_on_room_and_the_main_or_subdivision_building()
    {
        var main = new HouseAddress("Raiden", "Mist", 12, HouseKind.Apartment, -127, 45);
        var sub = main with { Kind = HouseKind.ApartmentSubdivision, Plot = -126 };
        var venues = new[] { ApartmentVenue("main", 45, false), ApartmentVenue("sub", 45, true) };

        Assert.Equal("main", VenueAddressMatcher.FindUnique(main, venues));
        Assert.Equal("sub", VenueAddressMatcher.FindUnique(sub, venues));
    }

    [Fact]
    public void An_apartment_never_matches_a_plot_venue_and_the_other_way_round()
    {
        var apartment = new HouseAddress("Raiden", "Lavender Beds", 6, HouseKind.Apartment, -127, 6);
        Assert.Null(VenueAddressMatcher.FindUnique(apartment, new[] { PlotVenue("v1") }));
        Assert.Null(VenueAddressMatcher.FindUnique(FcHouse, new[] { new XvmVenueAddress("v2", "Raiden", "Lavender Beds", 6, null, 6, false) }));
    }

    [Fact]
    public void Two_venues_at_one_address_are_ambiguous_so_nothing_is_chosen()
    {
        Assert.Null(VenueAddressMatcher.FindUnique(FcHouse, new[] { PlotVenue("v1"), PlotVenue("v2") }));
    }

    [Theory]
    [InlineData(6, HouseKind.Plot)]
    [InlineData(0, HouseKind.Apartment)]
    [InlineData(-127, HouseKind.Apartment)]
    [InlineData(-126, HouseKind.ApartmentSubdivision)]
    public void The_kind_follows_the_plot_value_the_plugin_stores(int plot, HouseKind expected)
    {
        Assert.Equal(expected, VenueAddressMatcher.KindOf(plot));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails.** Confirm with the user, then run `cd ~/xvm-plugin-dev && dotnet test VenueManager.Tests`. Expected: FAIL to compile, `VenueAddressMatcher`, `HouseAddress`, `HouseKind` and `XvmVenueAddress` do not exist.

- [ ] **Step 3: Implement** (`VenueManager/VenueAddressMatcher.cs`)

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;

namespace VenueManager
{
  public enum HouseKind { Plot, Apartment, ApartmentSubdivision }

  internal sealed record HouseAddress(string World, string District, int Ward, HouseKind Kind, int Plot, int Room);

  internal sealed record XvmVenueAddress(
    [property: JsonPropertyName("id")] string VenueId,
    [property: JsonPropertyName("world")] string World,
    [property: JsonPropertyName("district")] string? District,
    [property: JsonPropertyName("ward")] int? Ward,
    [property: JsonPropertyName("plot")] int? Plot,
    [property: JsonPropertyName("room")] int? Room,
    [property: JsonPropertyName("subdivision")] bool? Subdivision);

  internal static class VenueAddressMatcher
  {
    public static HouseKind KindOf(int plot) =>
      plot > 0 ? HouseKind.Plot : plot == -126 ? HouseKind.ApartmentSubdivision : HouseKind.Apartment;

    public static string? FindUnique(HouseAddress house, IEnumerable<XvmVenueAddress> venues)
    {
      var hits = venues.Where(v => Matches(house, v)).Select(v => v.VenueId).Distinct().ToList();
      return hits.Count == 1 ? hits[0] : null;
    }

    private static bool Matches(HouseAddress house, XvmVenueAddress venue)
    {
      if (!Same(house.World, venue.World) || !Same(house.District, venue.District) || venue.Ward != house.Ward) return false;
      if (house.Kind == HouseKind.Plot) return venue.Plot == house.Plot;
      return venue.Plot is null && venue.Room == house.Room
        && (venue.Subdivision ?? false) == (house.Kind == HouseKind.ApartmentSubdivision);
    }

    private static bool Same(string? a, string? b) =>
      string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
  }
}
```

A plot house matches on the plot alone, even when a legacy venue also carries a room, so only apartments look at `Room` and `Subdivision`.

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all pass, including the earlier tests.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: match a game house to a venue by address"
```

---

### Task 3: Read the venue addresses

**Files:**
- Modify: `VenueManager/XvmApiReads.cs`
- Test: `VenueManager.Tests/XvmApiReadsTests.cs`

- [ ] **Step 1: Write the failing test.** Add inside `XvmApiReadsTests`:

```csharp
    [Fact]
    public async Task Venue_addresses_come_from_each_venues_detail()
    {
        var handler = new RoutedHandler()
            .On("/venues/v1", "{\"id\":\"v1\",\"world\":\"Raiden\",\"district\":\"Lavender Beds\",\"ward\":6,\"plot\":6,\"room\":null,\"subdivision\":null}")
            .On("/venues/v2", "{\"id\":\"v2\",\"world\":\"Raiden\",\"district\":\"Mist\",\"ward\":12,\"plot\":null,\"room\":45,\"subdivision\":true}");

        var addresses = await Reads(handler).GetVenueAddressesAsync(new[] { "v1", "v2" });

        Assert.Equal(2, addresses.Count);
        Assert.Equal(6, addresses.Single(a => a.VenueId == "v1").Plot);
        Assert.Equal(true, addresses.Single(a => a.VenueId == "v2").Subdivision);
    }
```

- [ ] **Step 2: Run it and confirm it fails.** Expected: FAIL to compile, `GetVenueAddressesAsync` does not exist.

- [ ] **Step 3: Implement.** Add inside `XvmApiReads`:

```csharp
    internal async Task<List<XvmVenueAddress>> GetVenueAddressesAsync(IEnumerable<string> venueIds)
    {
      var rows = await Task.WhenAll(venueIds.Select(id => GetAsync<XvmVenueAddress>(Venue(id))));
      return rows.Where(r => r is not null).Select(r => r!).ToList();
    }
```

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: read the address of each venue the account can use"
```

---

### Task 4: Link houses after the venue list loads

**Files:**
- Modify: `VenueManager/Plugin.cs`
- Modify: `VenueManager/UI/Tabs/SettingsTab.cs`

- [ ] **Step 1: Hold the addresses and add the linking methods.** In `Plugin.cs`, next to `public List<XIVAppVenue> xivAppVenues`, add:

```csharp
    internal List<XvmVenueAddress> xivAppVenueAddresses = new();
```

and add these methods beside `AutoLoadXivAppDataAsync`:

```csharp
    internal static HouseAddress AddressOf(Venue house) =>
      new(house.WorldName, house.district, house.ward, VenueAddressMatcher.KindOf(house.plot), house.plot, house.room);

    public async Task LoadVenueAddressesAsync()
    {
      if (xivAppClient?.Xvm is not { } xvm || xivAppVenues.Count == 0) return;
      try
      {
        xivAppVenueAddresses = await xvm.GetVenueAddressesAsync(xivAppVenues.Select(v => v.Id));
        AutoLinkSavedHouses();
      }
      catch (Exception ex)
      {
        Log.Warning("Venue address load failed, houses stay as linked: {0}", ex.Message);
      }
    }

    public void AutoLinkSavedHouses()
    {
      var changed = false;
      foreach (var house in venueList.venues.Values)
      {
        if (Configuration.houseToXivAppVenue.ContainsKey(house.houseId)) continue;
        var venueId = VenueAddressMatcher.FindUnique(AddressOf(house), xivAppVenueAddresses);
        if (venueId is null) continue;
        Configuration.houseToXivAppVenue[house.houseId] = venueId;
        Log.Information("Linked saved house {House} to venue {Venue} by address", house.name, venueId);
        changed = true;
      }
      if (changed) Configuration.Save();
    }
```

- [ ] **Step 2: Call it after each venue-list load.** In `AutoLoadXivAppDataAsync`, right after `Log.Information("Auto-loaded {Count} venue(s) on startup", ...)` add `await LoadVenueAddressesAsync();`. In `SettingsTab.FetchXivAppVenuesAsync`, right after `plugin.xivAppVenues = await plugin.xivAppClient.Venue.GetVenuesAsync();` and its log line, add `await plugin.LoadVenueAddressesAsync();`.

- [ ] **Step 3: Build and test.** Confirm with the user, then run `dotnet test VenueManager.Tests` and `dotnet build VenueManager.sln -c Release`. Expected: all pass, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add VenueManager
git commit -m "feat: link saved houses to venues by address when the venue list loads"
```

---

### Task 5: Recognise the house you walk into, and follow it

**Files:**
- Modify: `VenueManager/Plugin.cs`

- [ ] **Step 1: Pull the per-venue loading out of the startup method** so both startup and "follow the house" use it. In `AutoLoadXivAppDataAsync`, move everything from `var roles = await xivAppClient.Venue.GetRolesAsync(target.Id);` through the inventory-enabled log line into a new method, and call it:

```csharp
    public async Task LoadVenueDataAsync(string venueId)
    {
      if (xivAppClient == null) return;
      xivAppRoles = await xivAppClient.Venue.GetRolesAsync(venueId);
      var servicesResp = await xivAppClient.Venue.GetServicesAsync(venueId);
      availableServices = servicesResp?.Services ?? new List<Service>();
      var bannedPatrons = await xivAppClient.Venue.GetBannedPatronsAsync(venueId);
      xivAppBannedPatrons = bannedPatrons ?? new List<BannedPatron>();
      xivAppBannedPatronsUnavailable = bannedPatrons == null;
      xivAppInventoryEnabled = await xivAppClient.Venue.GetInventoryEnabledAsync(venueId);
      Log.Information("Loaded venue {VenueId}: {Roles} roles, {Services} services, {Banned} banned", venueId, xivAppRoles.Count, availableServices.Count, xivAppBannedPatrons.Count);
    }
```

In `AutoLoadXivAppDataAsync` keep the lines that choose `target` and set `currentXivAppVenueId`, then replace the moved block with `await LoadVenueDataAsync(target.Id);`.

- [ ] **Step 2: Recognise and follow on entering a house.** In the block that runs when `pluginState.currentHouse.houseId != computedHouseId.Value`, after `pluginState.currentHouse.worldId = currentWorldId;`, replace any earlier call with:

```csharp
                var follow = FollowHouseToVenueAsync();
```

and change the chamber block that follows it (the one that opens the Rooms tab) so it only runs for plot houses and builds its chat line from the venue's rooms after the venue switch:

```csharp
                if (pluginState.currentHouse.room > 0 && pluginState.currentHouse.plot > 0 && previousRoom != pluginState.currentHouse.room)
                {
                  MainWindow.OpenTab("Rooms");
                  if (!MainWindow.IsOpen)
                    MainWindow.IsOpen = true;
                  else
                    _ = AnnounceChamberAsync(pluginState.currentHouse.room, follow);
                }
```

Then add the two methods beside the others. Each FC chamber has its own house id, so chambers are never linked or saved (decision A10); they only switch the current venue. A house that matches nothing refetches the addresses once a minute at most (A11).

```csharp
    private async Task AnnounceChamberAsync(int roomNumber, Task follow)
    {
      try
      {
        await follow;
        var venueId = currentXivAppVenueId;
        if (xivAppClient == null || string.IsNullOrEmpty(venueId)) return;
        var room = (await xivAppClient.Venue.GetRoomsAsync(venueId)).FirstOrDefault(r => r.RoomNumber == roomNumber);
        var status = room switch
        {
          null => "not set up for this venue",
          { Disabled: true } => "Disabled",
          { Locked: true } => "Locked",
          { IsOccupied: true } => "Occupied",
          _ => "Free - open plugin to reserve",
        };
        Chat.Print($"[{Name}] Room {roomNumber}: {status}");
      }
      catch (Exception ex)
      {
        Log.Warning("Announcing the chamber failed: {0}", ex.Message);
      }
    }

    private async Task FollowHouseToVenueAsync()
    {
      try
      {
        var house = pluginState.currentHouse;
        Log.Information("Entered house: world {World} district {District} ward {Ward} plot {Plot} room {Room} type {Type}", house.WorldName, house.district, house.ward, house.plot, house.room, house.type);
        if (!Configuration.houseToXivAppVenue.TryGetValue(house.houseId, out var venueId) || string.IsNullOrEmpty(venueId))
        {
          venueId = VenueAddressMatcher.FindUnique(AddressOf(house), xivAppVenueAddresses);
          if (venueId is null && DateTime.UtcNow - venueAddressesLoadedAt > TimeSpan.FromSeconds(60))
          {
            await LoadVenueAddressesAsync();
            venueId = VenueAddressMatcher.FindUnique(AddressOf(house), xivAppVenueAddresses);
          }
          if (venueId is null) return;
          if (house.room == 0 || house.plot <= 0)
          {
            Configuration.houseToXivAppVenue[house.houseId] = venueId;
            if (!venueList.venues.ContainsKey(house.houseId))
            {
              var saved = new Venue(house) { name = xivAppVenues.FirstOrDefault(v => v.Id == venueId)?.Name ?? house.name };
              venueList.venues.Add(saved.houseId, saved);
              venueList.save();
            }
            Configuration.Save();
            Log.Information("Recognised house {House} as venue {Venue} by address", house.houseId, venueId);
          }
        }

        if (venueId == currentXivAppVenueId) return;
        currentXivAppVenueId = venueId;
        Configuration.selectedVenueId = venueId;
        Configuration.Save();
        await LoadVenueDataAsync(venueId);
      }
      catch (Exception ex)
      {
        Log.Warning("Following the house to its venue failed: {0}", ex.Message);
      }
    }
```

Delete the old room-status helpers the chamber block used (`RoomsTab.GetRoomStatus` and `MainWindow.GetRoomStatus`), because nothing calls them any more. If decision A8 is declined, delete the `if (!venueList.venues.ContainsKey(...))` block. If A7 is declined, delete the last four lines after the early return and keep only the linking.

- [ ] **Step 3: Build and test.** Confirm with the user, then run `dotnet test VenueManager.Tests` and the `.sln` Release build. Expected: all pass, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add VenueManager
git commit -m "feat: recognise a house by its address and follow it to its venue"
```

---

### Task 6: Check it in the game

Needs the rebuilt DLL loaded and a linked account. Every step below was run on 2026-10-10 against the dev API and passed.

- [ ] **Step 1: Read the house values.** Walk into a house, an FC chamber, a main-division apartment and a subdivision apartment and read the `Entered house` log line. Expected: a house gives plot 1 to 60 and room 0, a chamber gives the plot and a room number, a main apartment gives plot -127 and its number, a subdivision apartment gives plot -126.
- [ ] **Step 2: Set a test address.** Set a test venue's address through the dashboard settings or `PATCH /venues/{id}` to the house (world, district, ward, plot) or the apartment (world, district, ward, room, and `subdivision`, with plot left empty).
- [ ] **Step 3: Recognise by address.** With the house not saved, walk in from outside the plot or inside. Expected: the log shows `Recognised house ... as venue ...`, the Venues tab lists the house under the venue's name, and the Settings venue and tab data are that venue's.
- [ ] **Step 4: Nothing is overwritten.** Link the house to a different venue by hand, restart, and walk in again. Expected: the manual link stays.
- [ ] **Step 5: No guess on a clash.** Give a second venue the same address through the API. Expected: the house stays unlinked, with no error.
- [ ] **Step 6: Two apartments stay apart.** Set one venue to a main-division apartment and another to a subdivision apartment in the same ward. Expected: each apartment links to its own venue only.
- [ ] **Step 7: Chambers.** Walk into an FC chamber. Expected: no new Venues tab entry, the current venue stays the FC house's venue, and a chat line says Free, Occupied, Locked, Disabled or "not set up for this venue".
- [ ] **Step 8: Address edits while running.** Change a venue's address through the API with the plugin running, then walk into the matching house at least a minute after the last load. Expected: it links without a restart.
- [ ] **Step 9: Teleport.** The Venues tab teleport button works for plot houses and is disabled for apartments.

---

## After this plan

1. **Retire the Settings venue picker** once following the house is proven (decision A7).
2. **Shift prompts** at the scheduled start and end, across every venue through `GET /me/shifts`.
3. **Retire the old path:** delete `/api/plugin/*`, `pluginAuthGate`, the Prisma `ApiKey` model, and revoke every `vm_` key on migration day with the plugin release that no longer uses them.

## Self-review

**Spec coverage.** The goal's four parts each have a task: matching (Task 2), reading the addresses (Task 3), linking saved houses (Task 4), recognising and following the current house (Task 5), and the in-game checks for plot, apartment, override and clash (Task 6). A1 to A12 are carried out; A7 and A8 were confirmed in game.

**Placeholder scan.** No step says TBD or "add handling". 

**Consistency.** `VenueAddressMatcher.FindUnique(HouseAddress, IEnumerable<XvmVenueAddress>)` and `KindOf(int)` are used the same way in Tasks 2, 4 and 5. `HouseAddress` is built in one place, `Plugin.AddressOf`. `XvmVenueAddress` lives in `VenueAddressMatcher.cs` and is the type `XvmApiReads.GetVenueAddressesAsync` returns and `Plugin.xivAppVenueAddresses` holds. `LoadVenueDataAsync` is defined in Task 5 step 1 and used in step 2.
