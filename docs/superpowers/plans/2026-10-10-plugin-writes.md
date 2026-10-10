# Plugin Writes To xvm-api Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once the plugin is linked, everything it writes (claim, clock in, clock out, patron visits, sales and tips, bans, room reserve, release, lock and disable, inventory link and stock count) goes straight to xvm-api, with the same method signatures the tabs already call, so no tab changes beyond passing the venue id to the three shift calls.

**Architecture:** A new `XvmApiWrites` class sends the requests with the plugin's own credential and returns the plugin's existing result types (`ClockResult`, `LogTransactionResult`, `bool`). A pure `XvmApiErrors` helper turns an API error body into one readable sentence for the chat line or status text. Both have no Dalamud dependency, so xunit tests them directly. `XIVAppShiftApi`, `XIVAppPatronApi` and `XIVAppVenueApi` keep their write methods and delegate to `XvmApiWrites` when the account is linked. There is no fallback to the old dashboard routes (standing rule).

**Tech Stack:** C# on .NET 10, Dalamud plugin (`xvm-plugin-dev`, the local copy), xunit.

**Status:** Draft for review. Nothing here has been built. It follows the reads plan (`2026-10-10-plugin-reads.md`, dashboard PR #190) and reuses its `XvmApiModels.cs` and `XvmApiMapping.ShiftStatus`. Build the reads plan first.

---

## Decisions

| # | Decision | State |
|---|---|---|
| W1 | Clock in and out follow the product rules already agreed: no early clock-in limit, and a clock-in or clock-out never changes whether the venue shows as open. The plugin only sends the request; xvm-api owns the rules and answers 409 with a sentence when it refuses (pending approval, already on the clock elsewhere, cancelled). | Decided |
| W2 | The three shift calls gain a `venueId` parameter. xvm-api shift routes live under `/venues/{id}/shifts/...`, and the old routes took only the shift id. The callers (`Plugin.cs` twice, `ShiftsTab.cs` once) already have `currentXivAppVenueId` in hand. | Decided (forced by the API) |
| W3 | Sales and tips send an `idempotency_key` (a fresh GUID per button press) and the active event's id. A retry after a timeout then returns the first row instead of logging twice. The event id comes from one extra `GET /venues/{id}/events/active` per sale; if that call fails the sale still goes through with no event. | Decided |
| W4 | A sale of a service whose stock is zero is refused by xvm-api with 409 "<service> is out of stock." That sentence is shown as is. After a successful sale of a stocked service the plugin re-reads that service's count so the dropdown and Inventory tab stay right (the old route returned it; xvm-api's row does not). | Decided |
| W5 | Bans need manager tier in xvm-api (intended). A staff member gets 403, and the chat line says so in plain words rather than "forbidden". Lock, disable and inventory link or stock count are also manager tier. | Decided |
| W6 | The room reserve button sends `source: "plugin_manual"`, `reserved_person_id` set to the caller, `start_at` now and `end_at` now plus the chosen minutes. The caller's person id comes from `GET /me`, read once and kept. The note field on a reservation is xvm-api #159 and is not needed for this plan. | Decided |
| W7 | Not ported, because nothing calls them: `LogServiceAsync` (`/api/plugin/services`) and `SetRoomStatusAsync` (`/api/plugin/rooms/status`). They are deleted in the retire-the-old-path plan, not here. | Verified (grep) |
| W8 | The old `Restock` button sets the count to a number the user types, so it maps to the stock count route (`PUT .../inventory/stock`), not to a signed movement. | Decided |
| W9 | Pending claims: a claim answers with the shift row, whose status is `pending_approval`. The Shifts tab already shows "Waiting for manager approval" from the claim result, and the reads plan maps that status for the list. Nothing extra here. | Decided |
| W10 | Patron visits keep the existing `"enter"` and `"leave"` strings, which are valid `PatronAction` values. A 200 (duplicate suppressed) counts as success. | Verified |

## What xvm-api takes

All paths are under the venue: `/venues/{venueId}`. All need the plugin's bearer secret.

| Plugin call | Request | Body | Reply used |
|---|---|---|---|
| `ClaimShiftAsync` | `POST /shifts/{id}/claim` | none | `status` |
| `ClockInAsync` | `POST /shifts/{id}/clock-in` | none | (success is enough) |
| `ClockOutAsync` | `POST /shifts/{id}/clock-out` | none | `worked_minutes` |
| `LogPatronVisitAsync` | `POST /patrons/visits` | `{character_name, world, action, ts}` | 200 or 201 |
| `LogTransactionAsync` | `POST /finance/transactions` | `{kind, amount, service_id, event_id, customer_name, notes, idempotency_key}` | `service_id` |
| `BanPatronAsync` | `POST /patrons/bans` | `{character_name, world, reason}` | 201 |
| `ReserveRoomAsync` | `POST /rooms/{id}/reservations` | `{reserved_person_id, start_at, end_at, source}` | 201 |
| `ReleaseRoomAsync` | `POST /rooms/{id}/release` | none | 200 |
| `UpdateRoomAsync` | `PATCH /rooms/{id}` | `{locked?, disabled?}` | 200 |
| `LinkItemAsync` | `PUT /services/{id}/inventory` | `{linked_item_id, linked_item_name, linked_item_icon}` | 200 |
| `RestockAsync` | `PUT /services/{id}/inventory/stock` | `{stock_count}` | 200 |
| person id | `GET /me` | none | `person.id` |
| stock re-read | `GET /services/{id}/inventory` | none | `stock_count` |

Errors come back as `{"detail": "<sentence>"}`, or for a rejected body as a list of `{loc, msg, type}`. `kind` is `sale` or `tip`. The old route took a decimal gil amount; xvm-api takes whole gil as an integer, which is what every sale already is (`SalesTab` passes an `int`).

Confirm with the user before any `dotnet` command in this repo, and before the clean build's `rm -rf` of `bin` and `obj`.

---

### Task 1: Test project compiles the new files

**Files:**
- Modify: `VenueManager.Tests/VenueManager.Tests.csproj`

- [ ] **Step 1:** In the second `<ItemGroup>`, next to the lines the reads plan added, add:

```xml
    <Compile Include="..\VenueManager\XvmApiWriteModels.cs" Link="XvmApiWriteModels.cs" />
    <Compile Include="..\VenueManager\XvmApiErrors.cs" Link="XvmApiErrors.cs" />
    <Compile Include="..\VenueManager\XvmApiWrites.cs" Link="XvmApiWrites.cs" />
```

The test project will not compile until Tasks 2 to 4 create those files, so commit this together with Task 2.

---

### Task 2: Turn an API error into a sentence

**Files:**
- Create: `VenueManager/XvmApiErrors.cs`
- Test: `VenueManager.Tests/XvmApiErrorsTests.cs`

- [ ] **Step 1: Write the failing tests** (`VenueManager.Tests/XvmApiErrorsTests.cs`)

```csharp
using VenueManager;
using Xunit;

public class XvmApiErrorsTests
{
    [Fact]
    public void A_detail_sentence_is_shown_as_is()
    {
        Assert.Equal("House Cocktail is out of stock.", XvmApiErrors.Describe(409, "{\"detail\":\"House Cocktail is out of stock.\"}"));
    }

    [Fact]
    public void A_rejected_body_shows_the_first_message()
    {
        var body = "{\"detail\":[{\"loc\":[\"body\",\"amount\"],\"msg\":\"Input should be greater than 0\",\"type\":\"greater_than\"}]}";
        Assert.Equal("Input should be greater than 0", XvmApiErrors.Describe(422, body));
    }

    [Fact]
    public void A_rejected_link_says_to_link_again()
    {
        Assert.Contains("Link", XvmApiErrors.Describe(401, "{\"detail\":\"Invalid credential\"}"));
    }

    [Fact]
    public void A_manager_only_refusal_is_said_plainly()
    {
        Assert.Equal("You need to be a manager at this venue to do that.", XvmApiErrors.Describe(403, "{\"detail\":\"Insufficient role for this action.\"}"));
    }

    [Fact]
    public void A_member_only_refusal_keeps_its_own_sentence()
    {
        Assert.Equal("This action requires a venue member.", XvmApiErrors.Describe(403, "{\"detail\":\"This action requires a venue member.\"}"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("{}")]
    public void An_unreadable_body_falls_back_to_the_status(string body)
    {
        Assert.Equal("The server answered 500.", XvmApiErrors.Describe(500, body));
    }
}
```

The manager sentence matches the exact 403 `detail` that `deps.require_tier` raises in xvm-api (`src/api/dependencies.py`). The other 403, "This action requires a venue member.", is passed through unchanged.

- [ ] **Step 2: Run it and confirm it fails.** Confirm with the user, then run `cd ~/xvm-plugin-dev && dotnet test VenueManager.Tests`. Expected: FAIL to compile, `XvmApiErrors` does not exist. Also create an empty `internal sealed class XvmApiWrites { }` in `VenueManager/XvmApiWrites.cs` and an empty `XvmApiWriteModels.cs` (`namespace VenueManager { }`) so the linked files exist.

- [ ] **Step 3: Implement** (`VenueManager/XvmApiErrors.cs`)

```csharp
using System.Text.Json;

namespace VenueManager
{
  internal static class XvmApiErrors
  {
    public static string Describe(int status, string body)
    {
      var detail = ReadDetail(body);
      if (status == 401) return "Your account link was rejected. Link your account again in settings.";
      if (status == 403 && detail is not null && detail == "Insufficient role for this action.") return "You need to be a manager at this venue to do that.";
      return detail ?? $"The server answered {status}.";
    }

    private static string? ReadDetail(string body)
    {
      try
      {
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("detail", out var detail)) return null;
        if (detail.ValueKind == JsonValueKind.String) return detail.GetString();
        if (detail.ValueKind == JsonValueKind.Array && detail.GetArrayLength() > 0
            && detail[0].TryGetProperty("msg", out var msg) && msg.ValueKind == JsonValueKind.String)
          return msg.GetString();
        return null;
      }
      catch (JsonException)
      {
        return null;
      }
    }
  }
}
```

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: turn xvm-api error bodies into readable sentences"
```

---

### Task 3: Request records

**Files:**
- Create: `VenueManager/XvmApiWriteModels.cs` (replace the empty stub)

- [ ] **Step 1: Write the records.** Optional fields are left out of the JSON when null, so the API sees them as absent.

```csharp
using System.Text.Json.Serialization;

namespace VenueManager
{
  internal sealed record XvmVisitBody(
    [property: JsonPropertyName("character_name")] string CharacterName,
    [property: JsonPropertyName("world")] string World,
    [property: JsonPropertyName("action")] string Action,
    [property: JsonPropertyName("ts")] string Ts);

  internal sealed record XvmTransactionBody(
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("amount")] int Amount,
    [property: JsonPropertyName("idempotency_key")] string IdempotencyKey,
    [property: JsonPropertyName("service_id"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? ServiceId,
    [property: JsonPropertyName("event_id"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? EventId,
    [property: JsonPropertyName("customer_name"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? CustomerName,
    [property: JsonPropertyName("notes"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Notes);

  internal sealed record XvmBanBody(
    [property: JsonPropertyName("character_name")] string CharacterName,
    [property: JsonPropertyName("world")] string World,
    [property: JsonPropertyName("reason")] string Reason);

  internal sealed record XvmReservationBody(
    [property: JsonPropertyName("reserved_person_id")] int ReservedPersonId,
    [property: JsonPropertyName("start_at")] string StartAt,
    [property: JsonPropertyName("end_at")] string EndAt,
    [property: JsonPropertyName("source")] string Source);

  internal sealed record XvmRoomPatchBody(
    [property: JsonPropertyName("locked"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Locked,
    [property: JsonPropertyName("disabled"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Disabled);

  internal sealed record XvmLinkBody(
    [property: JsonPropertyName("linked_item_id")] int LinkedItemId,
    [property: JsonPropertyName("linked_item_name")] string? LinkedItemName,
    [property: JsonPropertyName("linked_item_icon")] int? LinkedItemIcon);

  internal sealed record XvmStockBody(
    [property: JsonPropertyName("stock_count")] int StockCount);

  internal sealed record XvmShiftReply(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("worked_minutes")] int? WorkedMinutes);

  internal sealed record XvmMeReply(
    [property: JsonPropertyName("person")] XvmMePerson Person);

  internal sealed record XvmMePerson(
    [property: JsonPropertyName("id")] int Id);

  internal sealed record XvmStockReply(
    [property: JsonPropertyName("stock_count")] int? StockCount);
}
```

- [ ] **Step 2: Commit** with Task 4 (nothing runs against the records alone).

---

### Task 4: The write calls

**Files:**
- Modify: `VenueManager/XvmApiWrites.cs`
- Test: `VenueManager.Tests/XvmApiWritesTests.cs`

- [ ] **Step 1: Write the failing tests** (`VenueManager.Tests/XvmApiWritesTests.cs`). The fake records every request with its body and answers from a route table, longest prefix first, matching the method too.

```csharp
using System.Net;
using System.Text;
using System.Text.Json;
using VenueManager;
using Xunit;

public class XvmApiWritesTests
{
    private sealed class Handler : HttpMessageHandler
    {
        private readonly List<(string Method, string Prefix, HttpStatusCode Status, string Json)> _routes = new();
        public List<(string Method, string Path, string Body, string? Auth)> Requests { get; } = new();

        public Handler On(string method, string prefix, string json, HttpStatusCode status = HttpStatusCode.OK)
        {
            _routes.Add((method, prefix, status, json));
            return this;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.PathAndQuery;
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request.Method.Method, path, body, request.Headers.Authorization?.ToString()));
            var hit = _routes.Where(r => r.Method == request.Method.Method && path.StartsWith(r.Prefix)).OrderByDescending(r => r.Prefix.Length).FirstOrDefault();
            if (hit.Prefix is null) return new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("{}") };
            return new HttpResponseMessage(hit.Status) { Content = new StringContent(hit.Json, Encoding.UTF8, "application/json") };
        }
    }

    private static XvmApiWrites Writes(Handler handler) => new(new HttpClient(handler), "https://api.test/", "s3cret");

    private static JsonElement Json(string body) => JsonDocument.Parse(body).RootElement;

    [Fact]
    public async Task Claim_posts_to_the_shift_and_reports_the_pending_status()
    {
        var handler = new Handler().On("POST", "/venues/v1/shifts/42/claim", "{\"status\":\"pending_approval\",\"worked_minutes\":null}");

        var result = await Writes(handler).ClaimShiftAsync("v1", "42");

        Assert.True(result.Success);
        Assert.Equal("PENDING", result.Status);
        Assert.Equal("Bearer s3cret", handler.Requests[0].Auth);
    }

    [Fact]
    public async Task A_refused_clock_in_carries_the_servers_sentence()
    {
        var handler = new Handler().On("POST", "/venues/v1/shifts/42/clock-in", "{\"detail\":\"Pending approval.\"}", HttpStatusCode.Conflict);

        var result = await Writes(handler).ClockInAsync("v1", "42");

        Assert.False(result.Success);
        Assert.Equal("Pending approval.", result.Error);
    }

    [Fact]
    public async Task Clock_out_reports_hours_from_worked_minutes()
    {
        var handler = new Handler().On("POST", "/venues/v1/shifts/42/clock-out", "{\"status\":\"completed\",\"worked_minutes\":135}");

        var result = await Writes(handler).ClockOutAsync("v1", "42");

        Assert.True(result.Success);
        Assert.Equal(2.25, result.HoursWorked);
        Assert.Equal("COMPLETED", result.Status);
    }

    [Fact]
    public async Task A_visit_posts_the_door_fields_and_a_duplicate_still_counts()
    {
        var handler = new Handler().On("POST", "/venues/v1/patrons/visits", "{\"id\":1,\"deduped\":true}", HttpStatusCode.OK);

        var ok = await Writes(handler).LogPatronVisitAsync("v1", "Ehno Cure", "Twintania", "enter", new DateTime(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc));

        Assert.True(ok);
        var body = Json(handler.Requests[0].Body);
        Assert.Equal("Ehno Cure", body.GetProperty("character_name").GetString());
        Assert.Equal("enter", body.GetProperty("action").GetString());
        Assert.Equal("2026-10-10T12:00:00Z", body.GetProperty("ts").GetString());
    }

    [Fact]
    public async Task A_sale_sends_the_event_a_key_and_whole_gil()
    {
        var handler = new Handler()
            .On("GET", "/venues/v1/events/active", "{\"id\":9,\"title\":\"Friday\"}")
            .On("POST", "/venues/v1/finance/transactions", "{\"id\":5,\"service_id\":11}", HttpStatusCode.Created)
            .On("GET", "/venues/v1/services/11/inventory", "{\"stock_count\":7}");

        var result = await Writes(handler).LogTransactionAsync("v1", "11", 1500, "Guest", null, null);

        Assert.True(result.Success);
        Assert.Equal("11", result.ServiceId);
        Assert.Equal(7, result.ServiceStockCount);
        var body = Json(handler.Requests.Single(r => r.Method == "POST").Body);
        Assert.Equal("sale", body.GetProperty("kind").GetString());
        Assert.Equal(1500, body.GetProperty("amount").GetInt32());
        Assert.Equal(11, body.GetProperty("service_id").GetInt32());
        Assert.Equal(9, body.GetProperty("event_id").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("idempotency_key").GetString()));
        Assert.False(body.TryGetProperty("notes", out _));
    }

    [Fact]
    public async Task A_tip_with_no_service_skips_the_stock_read()
    {
        var handler = new Handler()
            .On("GET", "/venues/v1/events/active", "{}", HttpStatusCode.NotFound)
            .On("POST", "/venues/v1/finance/transactions", "{\"id\":5,\"service_id\":null}", HttpStatusCode.Created);

        var result = await Writes(handler).LogTransactionAsync("v1", null, 200, null, null, "TIP");

        Assert.True(result.Success);
        Assert.Null(result.ServiceStockCount);
        var body = Json(handler.Requests.Single(r => r.Method == "POST").Body);
        Assert.Equal("tip", body.GetProperty("kind").GetString());
        Assert.False(body.TryGetProperty("event_id", out _));
        Assert.DoesNotContain(handler.Requests, r => r.Path.Contains("/inventory"));
    }

    [Fact]
    public async Task Out_of_stock_shows_the_servers_sentence()
    {
        var handler = new Handler()
            .On("GET", "/venues/v1/events/active", "{}", HttpStatusCode.NotFound)
            .On("POST", "/venues/v1/finance/transactions", "{\"detail\":\"House Cocktail is out of stock.\"}", HttpStatusCode.Conflict);

        var result = await Writes(handler).LogTransactionAsync("v1", "11", 1500, null, null, null);

        Assert.False(result.Success);
        Assert.Equal("House Cocktail is out of stock.", result.Error);
    }

    [Fact]
    public async Task A_ban_posts_name_world_and_reason()
    {
        var handler = new Handler().On("POST", "/venues/v1/patrons/bans", "{\"id\":3}", HttpStatusCode.Created);

        var result = await Writes(handler).BanPatronAsync("v1", "Trouble Maker", "Twintania", "Harassment");

        Assert.True(result.Success);
        Assert.Equal("Harassment", Json(handler.Requests[0].Body).GetProperty("reason").GetString());
    }

    [Fact]
    public async Task A_staff_ban_says_manager_needed()
    {
        var handler = new Handler().On("POST", "/venues/v1/patrons/bans", "{\"detail\":\"Insufficient role for this action.\"}", HttpStatusCode.Forbidden);

        var result = await Writes(handler).BanPatronAsync("v1", "Trouble Maker", "Twintania", "Harassment");

        Assert.False(result.Success);
        Assert.Equal("You need to be a manager at this venue to do that.", result.Error);
    }

    [Fact]
    public async Task Reserve_holds_the_room_for_the_caller_for_the_chosen_minutes_and_reads_me_once()
    {
        var handler = new Handler()
            .On("GET", "/me", "{\"person\":{\"id\":2}}")
            .On("POST", "/venues/v1/rooms/4/reservations", "{\"id\":8}", HttpStatusCode.Created);
        var writes = Writes(handler);
        var now = new DateTime(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);

        Assert.True((await writes.ReserveRoomAsync("v1", "4", 90, now)).Success);
        Assert.True((await writes.ReserveRoomAsync("v1", "4", 30, now)).Success);

        var first = Json(handler.Requests.First(r => r.Method == "POST").Body);
        Assert.Equal(2, first.GetProperty("reserved_person_id").GetInt32());
        Assert.Equal("2026-10-10T12:00:00Z", first.GetProperty("start_at").GetString());
        Assert.Equal("2026-10-10T13:30:00Z", first.GetProperty("end_at").GetString());
        Assert.Equal("plugin_manual", first.GetProperty("source").GetString());
        Assert.Equal(1, handler.Requests.Count(r => r.Path == "/me"));
    }

    [Fact]
    public async Task A_taken_room_shows_the_servers_sentence()
    {
        var handler = new Handler()
            .On("GET", "/me", "{\"person\":{\"id\":2}}")
            .On("POST", "/venues/v1/rooms/4/reservations", "{\"detail\":\"That time overlaps an existing reservation for this room.\"}", HttpStatusCode.Conflict);

        var result = await Writes(handler).ReserveRoomAsync("v1", "4", 60, DateTime.UtcNow);

        Assert.False(result.Success);
        Assert.Equal("That time overlaps an existing reservation for this room.", result.Error);
    }

    [Fact]
    public async Task Release_and_lock_and_disable_hit_their_routes()
    {
        var handler = new Handler()
            .On("POST", "/venues/v1/rooms/4/release", "{\"id\":8}")
            .On("PATCH", "/venues/v1/rooms/4", "{\"id\":4}");
        var writes = Writes(handler);

        Assert.True((await writes.ReleaseRoomAsync("v1", "4")).Success);
        Assert.True((await writes.UpdateRoomAsync("v1", "4", locked: true, disabled: null)).Success);

        var patch = Json(handler.Requests.Single(r => r.Method == "PATCH").Body);
        Assert.True(patch.GetProperty("locked").GetBoolean());
        Assert.False(patch.TryGetProperty("disabled", out _));
    }

    [Fact]
    public async Task Link_and_stock_count_hit_the_inventory_routes()
    {
        var handler = new Handler()
            .On("PUT", "/venues/v1/services/11/inventory/stock", "{\"stock_count\":12}")
            .On("PUT", "/venues/v1/services/11/inventory", "{\"service_id\":11}");
        var writes = Writes(handler);

        Assert.True((await writes.LinkItemAsync("v1", "11", 4825, "Grilled Tuna", 21545)).Success);
        Assert.True((await writes.RestockAsync("v1", "11", 12)).Success);

        Assert.Equal(4825, Json(handler.Requests.First(r => r.Path == "/venues/v1/services/11/inventory").Body).GetProperty("linked_item_id").GetInt32());
        Assert.Equal(12, Json(handler.Requests.First(r => r.Path.EndsWith("/stock")).Body).GetProperty("stock_count").GetInt32());
    }

    [Fact]
    public async Task A_dropped_connection_becomes_a_failed_result_not_an_exception()
    {
        var handler = new ThrowingHandler();
        var writes = new XvmApiWrites(new HttpClient(handler), "https://api.test/", "s3cret");

        var result = await writes.ClockInAsync("v1", "42");

        Assert.False(result.Success);
        Assert.Contains("connection", result.Error!, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new HttpRequestException("boom");
    }
}
```

- [ ] **Step 2: Run it and confirm it fails.** Confirm with the user, then run `dotnet test VenueManager.Tests`. Expected: FAIL to compile, `XvmApiWrites` has no members.

- [ ] **Step 3: Implement** (`VenueManager/XvmApiWrites.cs`)

```csharp
using System;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;

namespace VenueManager
{
  internal sealed class XvmApiWrites
  {
    private readonly HttpClient _http;
    private readonly string _root;
    private readonly string _secret;
    private int? _personId;

    public XvmApiWrites(HttpClient http, string baseUrl, string secret)
    {
      _http = http;
      _root = baseUrl.Trim().TrimEnd('/');
      _secret = secret;
    }

    private readonly record struct Reply(bool Ok, int Status, string Body)
    {
      public string Error => Status == 0 ? Body : XvmApiErrors.Describe(Status, Body);
    }

    private async Task<Reply> SendAsync(HttpMethod method, string path, object? body = null)
    {
      try
      {
        using var request = new HttpRequestMessage(method, $"{_root}{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _secret);
        if (body is not null) request.Content = JsonContent.Create(body, body.GetType());
        using var response = await _http.SendAsync(request);
        return new Reply(response.IsSuccessStatusCode, (int)response.StatusCode, await response.Content.ReadAsStringAsync());
      }
      catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
      {
        return new Reply(false, 0, "Could not reach the server. Check your connection and try again.");
      }
    }

    private static T? Read<T>(string body)
    {
      try { return JsonSerializer.Deserialize<T>(body); }
      catch (JsonException) { return default; }
    }

    private static string Venue(string venueId) => $"/venues/{Uri.EscapeDataString(venueId)}";

    private static string Iso(DateTime utc) => utc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);

    private static LogTransactionResult Result(Reply reply) =>
      reply.Ok ? new LogTransactionResult { Success = true } : new LogTransactionResult { Success = false, Error = reply.Error };

    private async Task<int?> PersonIdAsync()
    {
      if (_personId is null)
      {
        var reply = await SendAsync(HttpMethod.Get, "/me");
        if (reply.Ok) _personId = Read<XvmMeReply>(reply.Body)?.Person.Id;
      }
      return _personId;
    }

    public async Task<ClockResult> ClaimShiftAsync(string venueId, string shiftId)
    {
      var reply = await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/shifts/{shiftId}/claim");
      if (!reply.Ok) return new ClockResult { Success = false, Error = reply.Error };
      var status = Read<XvmShiftReply>(reply.Body)?.Status;
      return new ClockResult { Success = true, Status = status is null ? "PENDING" : XvmApiMapping.ShiftStatus(status) };
    }

    public async Task<ClockResult> ClockInAsync(string venueId, string shiftId)
    {
      var reply = await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/shifts/{shiftId}/clock-in");
      return reply.Ok ? new ClockResult { Success = true, Status = "ACTIVE" } : new ClockResult { Success = false, Error = reply.Error };
    }

    public async Task<ClockResult> ClockOutAsync(string venueId, string shiftId)
    {
      var reply = await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/shifts/{shiftId}/clock-out");
      if (!reply.Ok) return new ClockResult { Success = false, Error = reply.Error };
      var minutes = Read<XvmShiftReply>(reply.Body)?.WorkedMinutes;
      return new ClockResult { Success = true, Status = "COMPLETED", HoursWorked = minutes / 60.0 };
    }

    public async Task<bool> LogPatronVisitAsync(string venueId, string characterName, string world, string action, DateTime nowUtc) =>
      (await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/patrons/visits", new XvmVisitBody(characterName, world, action, Iso(nowUtc)))).Ok;

    public async Task<LogTransactionResult> LogTransactionAsync(
      string venueId, string? serviceId, int amount, string? customerName, string? notes, string? type)
    {
      int? serviceKey = int.TryParse(serviceId, NumberStyles.None, CultureInfo.InvariantCulture, out var s) ? s : null;
      int? eventId = null;
      var active = await SendAsync(HttpMethod.Get, $"{Venue(venueId)}/events/active");
      if (active.Ok) eventId = Read<XvmEvent>(active.Body)?.Id;

      var kind = string.Equals(type, "TIP", StringComparison.OrdinalIgnoreCase) ? "tip" : "sale";
      var body = new XvmTransactionBody(kind, amount, Guid.NewGuid().ToString("N"), serviceKey, eventId, customerName, notes);
      var reply = await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/finance/transactions", body);
      if (!reply.Ok) return Result(reply);

      var result = new LogTransactionResult { Success = true, ServiceId = serviceId };
      if (serviceKey is not null && kind == "sale")
      {
        var stock = await SendAsync(HttpMethod.Get, $"{Venue(venueId)}/services/{serviceKey}/inventory");
        if (stock.Ok) result.ServiceStockCount = Read<XvmStockReply>(stock.Body)?.StockCount;
      }
      return result;
    }

    public async Task<LogTransactionResult> BanPatronAsync(string venueId, string characterName, string world, string reason) =>
      Result(await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/patrons/bans", new XvmBanBody(characterName, world, reason)));

    public async Task<LogTransactionResult> ReserveRoomAsync(string venueId, string roomId, int durationMinutes, DateTime nowUtc)
    {
      var personId = await PersonIdAsync();
      if (personId is null) return new LogTransactionResult { Success = false, Error = "Could not read your account. Link your account again in settings." };
      var body = new XvmReservationBody(personId.Value, Iso(nowUtc), Iso(nowUtc.AddMinutes(durationMinutes)), "plugin_manual");
      return Result(await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/rooms/{roomId}/reservations", body));
    }

    public async Task<LogTransactionResult> ReleaseRoomAsync(string venueId, string roomId) =>
      Result(await SendAsync(HttpMethod.Post, $"{Venue(venueId)}/rooms/{roomId}/release"));

    public async Task<LogTransactionResult> UpdateRoomAsync(string venueId, string roomId, bool? locked, bool? disabled) =>
      Result(await SendAsync(HttpMethod.Patch, $"{Venue(venueId)}/rooms/{roomId}", new XvmRoomPatchBody(locked, disabled)));

    public async Task<LogTransactionResult> LinkItemAsync(string venueId, string serviceId, int itemId, string itemName, int? iconId) =>
      Result(await SendAsync(HttpMethod.Put, $"{Venue(venueId)}/services/{serviceId}/inventory", new XvmLinkBody(itemId, itemName, iconId)));

    public async Task<LogTransactionResult> RestockAsync(string venueId, string serviceId, int stockCount) =>
      Result(await SendAsync(HttpMethod.Put, $"{Venue(venueId)}/services/{serviceId}/inventory/stock", new XvmStockBody(stockCount)));
  }
}
```

`XvmEvent` and `XvmApiMapping.ShiftStatus` come from the reads plan (Tasks 2 and 3). `HttpMethod.Patch` exists in .NET 10.

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all pass, including the reads tests.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: write shifts, visits, sales, bans, rooms and inventory to xvm-api"
```

---

### Task 5: Wire the writes into the existing API classes

Confirm D3 from the reads plan is settled before this task: after it, a linked plugin no longer uses any old route.

**Files:**
- Modify: `VenueManager/XIVAppApiClient.cs`
- Modify: `VenueManager/XIVAppShiftApi.cs`
- Modify: `VenueManager/XIVAppPatronApi.cs`
- Modify: `VenueManager/XIVAppVenueApi.cs`
- Modify: `VenueManager/Plugin.cs` (two shift call sites, one visit)
- Modify: `VenueManager/UI/Tabs/ShiftsTab.cs` (one call site)

- [ ] **Step 1: Hold an `XvmApiWrites` beside the reads.** In `XIVAppApiClient.cs`, next to the `Xvm` member the reads plan added, add and extend `ConfigureXvm` and `ClearXvm` so the same secret feeds both:

```csharp
    internal XvmApiWrites? XvmWrites { get; private set; }
```

In `ConfigureXvm`, after `Xvm` is set: `XvmWrites = Xvm is null ? null : new XvmApiWrites(XvmHttp, url, secret);`. In `ClearXvm`, also set `XvmWrites = null;`.

- [ ] **Step 2: Shift writes.** Replace the three method bodies in `XIVAppShiftApi.cs` and add the venue id:

```csharp
    private static readonly ClockResult NotLinked = new() { Success = false, Error = "Link your account in settings first." };

    public Task<ClockResult> ClaimShiftAsync(string venueId, string shiftId) =>
      _client.XvmWrites is { } xvm ? xvm.ClaimShiftAsync(venueId, shiftId) : Task.FromResult(NotLinked);

    public Task<ClockResult> ClockInAsync(string venueId, string shiftId) =>
      _client.XvmWrites is { } xvm ? xvm.ClockInAsync(venueId, shiftId) : Task.FromResult(NotLinked);

    public Task<ClockResult> ClockOutAsync(string venueId, string shiftId) =>
      _client.XvmWrites is { } xvm ? xvm.ClockOutAsync(venueId, shiftId) : Task.FromResult(NotLinked);
```

Update the three call sites: `Plugin.cs` `ClockInAsync(scheduled.Id)` becomes `ClockInAsync(currentXivAppVenueId, scheduled.Id)`, `ClockOutAsync(active.Id)` becomes `ClockOutAsync(currentXivAppVenueId, active.Id)`, and in `ShiftsTab.cs` `ClaimShiftAsync(shiftId)` becomes `ClaimShiftAsync(plugin.currentXivAppVenueId, shiftId)`.

- [ ] **Step 3: Patron, sale and ban writes.** Replace the bodies in `XIVAppPatronApi.cs`. `LogTransactionAsync` keeps its `decimal amount` parameter and converts, so `SalesTab` and `Plugin.cs` do not change:

```csharp
    private static readonly LogTransactionResult NotLinked = new() { Success = false, Error = "Link your account in settings first." };

    public Task<bool> LogPatronVisitAsync(string venueId, string characterName, string world, string action) =>
      _client.XvmWrites is { } xvm ? xvm.LogPatronVisitAsync(venueId, characterName, world, action, DateTime.UtcNow) : Task.FromResult(false);

    public Task<LogTransactionResult> LogTransactionAsync(
      string venueId, string? serviceId, decimal amount, string? customerName = null, string? notes = null, string? type = null) =>
      _client.XvmWrites is { } xvm
        ? xvm.LogTransactionAsync(venueId, serviceId, (int)decimal.Round(amount), customerName, notes, type)
        : Task.FromResult(NotLinked);

    public Task<LogTransactionResult> BanPatronAsync(string venueId, string characterName, string world, string reason) =>
      _client.XvmWrites is { } xvm ? xvm.BanPatronAsync(venueId, characterName, world, reason) : Task.FromResult(NotLinked);
```

Delete `LogServiceAsync` (no callers, W7) together with the request classes only it used, if nothing else references them (grep `XIVAppServiceRequest` first and leave it if anything does).

- [ ] **Step 4: Room and inventory writes.** In `XIVAppVenueApi.cs`, replace `ReserveRoomAsync`, `ReleaseRoomAsync`, `UpdateRoomAsync`, `LinkItemAsync` and `RestockAsync` with delegations of the same shape (a private `NotLinked` result, `_client.XvmWrites is { } xvm ? xvm.X(...) : Task.FromResult(NotLinked)`). `ReserveRoomAsync` passes `DateTime.UtcNow`. `UpdateRoomAsync` becomes non-`async`.

- [ ] **Step 5: Build.** Confirm with the user, then run the clean build from the plugin repo: `cd ~/xvm-plugin-dev && rm -rf VenueManager/bin VenueManager/obj && dotnet build VenueManager -c Release`. Expected: 0 errors. Then `dotnet test VenueManager.Tests`, expected all pass.

- [ ] **Step 6: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: send the plugin's writes to xvm-api when the account is linked"
```

---

### Task 6: Check it in the game

Needs the rebuilt DLL loaded, a linked account, and a test venue where you are an owner or manager.

- [ ] **Step 1: Shifts.** Claim an open shift: expect "Shift claimed! Waiting for manager approval." Approve it from the dashboard, then `/xvm start`: expect "Clocked in", and the dashboard shows you on the clock. `/xvm end`: expect the hours worked.
- [ ] **Step 2: Sales.** `/xvm sale! 500` and a tip. Both appear in the dashboard books with the right kind and the running event. Press the Sales tab's button twice quickly on one service: two lines, not one. Sell a service with stock 0: the chat line reads "<name> is out of stock."
- [ ] **Step 3: Patrons and bans.** Walk a second character through the door with Sync on: one enter, one leave in the dashboard patron log. `/xvm ban! Name World reason`: the ban shows on the dashboard.
- [ ] **Step 4: Rooms.** Reserve a room for 30 minutes from the Rooms tab and see it held in the dashboard. Release it. Lock it and unlock it. Try to reserve a locked room: the status line says it is locked.
- [ ] **Step 5: Inventory.** On a venue with `inventory_enabled` on, link an item to a service and set a count. Both show in the dashboard.

---

### Task 7: Check access as a staff-tier member

- [ ] **Step 1:** With an account that is only **staff** at some venue, link the plugin and repeat Task 6 steps 1 to 3.
- [ ] **Step 2:** Confirm bans, lock, disable and inventory changes answer with "You need to be a manager at this venue to do that." and nothing else changes.
- [ ] **Step 3:** If sales, visits or room reserve and release answer 403 for staff, record the endpoint here and ask Allegro whether it should be open to any member.

---

## After this plan

1. **Venue auto-map** (own plan, needs dashboard #187).
2. **Shift prompts** at the scheduled start and end, across every venue through `GET /me/shifts`.
3. **Retire the old path:** delete `/api/plugin/*` routes, `pluginAuthGate`, the Prisma `ApiKey` model, `LogServiceAsync`'s route, `SetRoomStatusAsync`, and revoke every `vm_` key on migration day with the plugin release that no longer uses them.

## Self-review

**Spec coverage.** Every write in the plugin has a task: shifts (claim, clock in, clock out), visits, sales and tips, bans, room reserve, release, lock and disable, inventory link and stock count (Tasks 3 to 5), with the game and staff checks in Tasks 6 and 7. The two writes with no callers are listed in W7. The product rules (no early limit, no open or closed side effect) are API behavior and are checked in Task 6 rather than coded.

**Placeholder scan.** No step says TBD or "add handling".

**Consistency.** `XvmApiWrites` exposes `ClaimShiftAsync`, `ClockInAsync`, `ClockOutAsync` (venue id first), `LogPatronVisitAsync`, `LogTransactionAsync`, `BanPatronAsync`, `ReserveRoomAsync`, `ReleaseRoomAsync`, `UpdateRoomAsync`, `LinkItemAsync` and `RestockAsync`; the facades in Task 5 call exactly those names with those parameters. The record names match between `XvmApiWriteModels.cs`, the implementation and the tests. `XvmEvent` and `ShiftStatus` are the reads plan's.
