# Plugin Shift Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a person's shift starts, and when it ends, at any venue they work at, the plugin shows a notification with a button to clock in or out. Nothing is ever clocked automatically.

**Architecture:** One poll of `GET /me/shifts` (every venue at once) feeds a pure `ShiftPromptPlanner` that decides which shifts are due a prompt, given the time, what was already prompted, and what the person muted. `Plugin` shows each due prompt as a Dalamud notification whose action bar has the Clock in or Clock out button and a Not now button, and keeps a short memory so the same prompt is not shown twice. The buttons call the existing xvm-api writes with the shift's own venue id. The planner and the shift read have no Dalamud dependency, so xunit tests them directly.

**Tech Stack:** C# on .NET 10, Dalamud plugin (`xvm-plugin-dev`, the local copy), xunit.

**Status:** Draft for review. Nothing here has been built. It follows the plugin PRs #3 and #4 (the account link, reads, writes, and the venue auto-map) and needs a linked account.

---

## Decisions

| # | Decision | State |
|---|---|---|
| P1 | Prompts only. The plugin never clocks anyone in or out by itself. People stay over, or are offline or not working, and a shift on the schedule is not proof someone is there. | Decided (product rule) |
| P2 | A start prompt shows once for a shift that is approved, has not been clocked in, and is in progress (its start has passed and its end has not). It also shows on login if the shift is already running. There is no early prompt and no early clock-in limit. | Decided |
| P3 | An end prompt shows for a shift that is clocked in and past its scheduled end, then repeats every 15 minutes until it is clocked out or muted. That is the cadence of the chat reminder the plugin has today. It stops after 12 hours past the end, because the server's stale-shift sweep closes forgotten shifts. | Decided |
| P4 | Prompts cover every venue the person works at, through `GET /me/shifts`, not just the venue the plugin is currently showing. That needs the account-wide credential the plugin link already creates. | Decided |
| P5 | Only approved shifts prompt. A claimed shift waiting for a manager (`pending_approval`), a cancelled shift and a finished one never do. | Decided |
| P6 | A Not now button mutes all further prompts for that shift until the plugin restarts. Dismissing the notification with the cross only closes it, and the end prompt returns after 15 minutes. | Decided |
| P7 | The notification replaces the existing "Your shift just ended, type /xvm end" chat reminder, which only knew the current venue. Each prompt also prints one chat line, because a notification is easy to miss. The chat line is not repeated. | Proposed, confirm |
| P8 | A new Settings checkbox, Shift prompts, turns the whole thing off. It is on by default. | Proposed, confirm |
| P9 | The buttons act on the shift that prompted, with that shift's venue id, whichever venue the plugin is currently showing. `/xvm start` and `/xvm end` are unchanged and still act on the current venue. | Decided |
| P10 | The poll runs once a minute, independent of the status bar mode (the existing shift poll only runs for the two status bar modes that show shifts). | Decided |

## What xvm-api returns

`GET /me/shifts?from=...&to=...` returns every shift of the caller across venues, in a window of at most 60 days:

`[{id, venue_id, status, scheduled_start, scheduled_end, actual_start, actual_end, position_id, conflicts, ...}]`

`status` is one of `open`, `pending_approval`, `scheduled`, `active`, `completed` and others. Times are ISO 8601 with a `Z`. The window used here is one day back to one day ahead.

Confirm with the user before any `dotnet` command in this repo, and before any clean build's `rm -rf` of `bin` and `obj`. Build with `dotnet build VenueManager.sln -c Release` (the `.sln` gives `bin/x64/Release`).

---

### Task 1: Test project compiles the new file

**Files:**
- Modify: `VenueManager.Tests/VenueManager.Tests.csproj`

- [ ] **Step 1:** In the second `<ItemGroup>`, next to the lines the earlier plans added, add:

```xml
    <Compile Include="..\VenueManager\ShiftPromptPlanner.cs" Link="ShiftPromptPlanner.cs" />
```

The test project will not compile until Task 2 creates that file, so commit this with Task 2.

---

### Task 2: The planner

**Files:**
- Create: `VenueManager/ShiftPromptPlanner.cs`
- Test: `VenueManager.Tests/ShiftPromptPlannerTests.cs`

- [ ] **Step 1: Write the failing tests** (`VenueManager.Tests/ShiftPromptPlannerTests.cs`)

```csharp
using VenueManager;
using Xunit;

public class ShiftPromptPlannerTests
{
    private static readonly DateTime Now = new(2026, 10, 10, 20, 0, 0, DateTimeKind.Utc);

    private static MyShift Shift(int id, string status, int startMinutesAgo, int endMinutesFromNow, bool clockedIn = false, bool clockedOut = false) =>
        new(id, "v1", status,
            Now.AddMinutes(-startMinutesAgo), Now.AddMinutes(endMinutesFromNow),
            clockedIn ? Now.AddMinutes(-startMinutesAgo) : null,
            clockedOut ? Now : null);

    private static List<ShiftPrompt> Plan(IEnumerable<MyShift> shifts, Dictionary<int, PromptMemory>? memory = null, HashSet<int>? muted = null) =>
        ShiftPromptPlanner.Due(Now, shifts, memory ?? new(), muted ?? new());

    [Fact]
    public void A_running_shift_that_is_not_clocked_in_gets_one_start_prompt()
    {
        var due = Plan(new[] { Shift(1, "scheduled", 2, 120) });
        Assert.Equal(new ShiftPrompt(1, "v1", PromptKind.Start), Assert.Single(due));

        var remembered = new Dictionary<int, PromptMemory> { [1] = new(PromptKind.Start, Now) };
        Assert.Empty(Plan(new[] { Shift(1, "scheduled", 2, 120) }, remembered));
    }

    [Fact]
    public void A_shift_that_has_not_started_yet_gets_no_prompt()
    {
        Assert.Empty(Plan(new[] { Shift(1, "scheduled", -10, 120) }));
    }

    [Fact]
    public void A_shift_that_has_already_ended_unclocked_gets_no_start_prompt()
    {
        Assert.Empty(Plan(new[] { Shift(1, "scheduled", 180, -5) }));
    }

    [Theory]
    [InlineData("pending_approval")]
    [InlineData("open")]
    [InlineData("cancelled")]
    [InlineData("completed")]
    public void Only_approved_shifts_prompt(string status)
    {
        Assert.Empty(Plan(new[] { Shift(1, status, 2, 120) }));
        Assert.Empty(Plan(new[] { Shift(2, status, 200, -5, clockedIn: true) }));
    }

    [Fact]
    public void A_clocked_in_shift_past_its_end_gets_an_end_prompt_that_repeats_every_fifteen_minutes()
    {
        var shift = Shift(1, "active", 200, -5, clockedIn: true);
        Assert.Equal(new ShiftPrompt(1, "v1", PromptKind.End), Assert.Single(Plan(new[] { shift })));

        var justShown = new Dictionary<int, PromptMemory> { [1] = new(PromptKind.End, Now.AddMinutes(-10)) };
        Assert.Empty(Plan(new[] { shift }, justShown));

        var longAgo = new Dictionary<int, PromptMemory> { [1] = new(PromptKind.End, Now.AddMinutes(-16)) };
        Assert.Single(Plan(new[] { shift }, longAgo));
    }

    [Fact]
    public void A_clocked_in_shift_before_its_end_gets_no_prompt()
    {
        Assert.Empty(Plan(new[] { Shift(1, "active", 60, 30, clockedIn: true) }));
    }

    [Fact]
    public void An_end_prompt_stops_twelve_hours_after_the_end()
    {
        Assert.Single(Plan(new[] { Shift(1, "active", 800, -(11 * 60), clockedIn: true) }));
        Assert.Empty(Plan(new[] { Shift(1, "active", 1000, -(13 * 60), clockedIn: true) }));
    }

    [Fact]
    public void A_shift_clocked_out_gets_no_end_prompt()
    {
        Assert.Empty(Plan(new[] { Shift(1, "active", 200, -5, clockedIn: true, clockedOut: true) }));
    }

    [Fact]
    public void A_muted_shift_never_prompts_again()
    {
        var muted = new HashSet<int> { 1 };
        Assert.Empty(Plan(new[] { Shift(1, "scheduled", 2, 120), Shift(1, "active", 200, -5, clockedIn: true) }, muted: muted));
    }

    [Fact]
    public void Shifts_at_different_venues_each_get_their_own_prompt()
    {
        var shifts = new[]
        {
            Shift(1, "scheduled", 2, 120) with { VenueId = "v1" },
            Shift(2, "active", 200, -5, clockedIn: true) with { VenueId = "v2" },
        };
        var due = Plan(shifts);
        Assert.Contains(new ShiftPrompt(1, "v1", PromptKind.Start), due);
        Assert.Contains(new ShiftPrompt(2, "v2", PromptKind.End), due);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails.** Confirm with the user, then run `cd ~/xvm-plugin-dev && dotnet test VenueManager.Tests`. Expected: FAIL to compile, `ShiftPromptPlanner`, `MyShift`, `ShiftPrompt`, `PromptKind` and `PromptMemory` do not exist.

- [ ] **Step 3: Implement** (`VenueManager/ShiftPromptPlanner.cs`)

```csharp
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace VenueManager
{
  internal enum PromptKind { Start, End }

  internal sealed record ShiftPrompt(int ShiftId, string VenueId, PromptKind Kind);

  internal sealed record PromptMemory(PromptKind Kind, DateTime At);

  internal sealed record MyShift(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("venue_id")] string VenueId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("scheduled_start")] DateTime? ScheduledStart,
    [property: JsonPropertyName("scheduled_end")] DateTime? ScheduledEnd,
    [property: JsonPropertyName("actual_start")] DateTime? ActualStart,
    [property: JsonPropertyName("actual_end")] DateTime? ActualEnd);

  internal static class ShiftPromptPlanner
  {
    private static readonly TimeSpan EndRepeat = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan EndGiveUp = TimeSpan.FromHours(12);

    public static List<ShiftPrompt> Due(
      DateTime nowUtc, IEnumerable<MyShift> shifts, IReadOnlyDictionary<int, PromptMemory> memory, ISet<int> muted)
    {
      var due = new List<ShiftPrompt>();
      foreach (var shift in shifts)
      {
        if (muted.Contains(shift.Id)) continue;
        memory.TryGetValue(shift.Id, out var last);

        if (shift.Status == "scheduled" && shift.ActualStart is null
            && shift.ScheduledStart <= nowUtc && (shift.ScheduledEnd is null || nowUtc < shift.ScheduledEnd)
            && (last is null || last.Kind != PromptKind.Start))
        {
          due.Add(new ShiftPrompt(shift.Id, shift.VenueId, PromptKind.Start));
        }
        else if (shift.Status == "active" && shift.ActualStart is not null && shift.ActualEnd is null
            && shift.ScheduledEnd <= nowUtc && nowUtc - shift.ScheduledEnd <= EndGiveUp
            && (last is null || last.Kind != PromptKind.End || nowUtc - last.At >= EndRepeat))
        {
          due.Add(new ShiftPrompt(shift.Id, shift.VenueId, PromptKind.End));
        }
      }
      return due;
    }
  }
}
```

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all pass, including the earlier tests.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: decide which shifts are due a start or end prompt"
```

---

### Task 3: Read the person's shifts across venues

**Files:**
- Modify: `VenueManager/XvmApiReads.cs`
- Test: `VenueManager.Tests/XvmApiReadsTests.cs`

- [ ] **Step 1: Write the failing test.** Add inside `XvmApiReadsTests`:

```csharp
    [Fact]
    public async Task My_shifts_come_from_one_call_across_venues()
    {
        var handler = new RoutedHandler()
            .On("/me/shifts", "[{\"id\":1,\"venue_id\":\"v1\",\"status\":\"scheduled\",\"scheduled_start\":\"2026-10-10T19:00:00Z\",\"scheduled_end\":\"2026-10-10T22:00:00Z\",\"actual_start\":null,\"actual_end\":null,\"conflicts\":false},{\"id\":2,\"venue_id\":\"v2\",\"status\":\"active\",\"scheduled_start\":\"2026-10-10T16:00:00Z\",\"scheduled_end\":\"2026-10-10T19:00:00Z\",\"actual_start\":\"2026-10-10T16:05:00Z\",\"actual_end\":null,\"conflicts\":false}]");

        var shifts = await Reads(handler).GetMyShiftsAsync(new DateTime(2026, 10, 10, 20, 0, 0, DateTimeKind.Utc));

        Assert.Equal(new[] { "v1", "v2" }, shifts.Select(s => s.VenueId));
        Assert.Equal(new DateTime(2026, 10, 10, 16, 5, 0, DateTimeKind.Utc), shifts[1].ActualStart);
        Assert.Contains("from=2026-10-09T20%3A00%3A00Z", handler.Requests[0].PathAndQuery);
        Assert.Contains("to=2026-10-11T20%3A00%3A00Z", handler.Requests[0].PathAndQuery);
    }
```

- [ ] **Step 2: Run it and confirm it fails.** Expected: FAIL to compile, `GetMyShiftsAsync` does not exist.

- [ ] **Step 3: Implement.** Add inside `XvmApiReads`:

```csharp
    internal async Task<List<MyShift>> GetMyShiftsAsync(DateTime now)
    {
      var window = $"from={Uri.EscapeDataString((now - TimeSpan.FromDays(1)).ToString("yyyy-MM-ddTHH:mm:ssZ"))}&to={Uri.EscapeDataString((now + TimeSpan.FromDays(1)).ToString("yyyy-MM-ddTHH:mm:ssZ"))}";
      return await GetAsync<List<MyShift>>($"/me/shifts?{window}") ?? new List<MyShift>();
    }
```

- [ ] **Step 4: Run it and confirm it passes.** Run: `dotnet test VenueManager.Tests`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add VenueManager VenueManager.Tests
git commit -m "feat: read the person's shifts across venues"
```

---

### Task 4: Show the prompts

**Files:**
- Modify: `VenueManager/Plugin.cs`
- Modify: `VenueManager/Configuration.cs`
- Modify: `VenueManager/UI/Tabs/SettingsTab.cs`

- [ ] **Step 1: The setting.** In `Configuration.cs`, next to `alertBannedPatrons`, add:

```csharp
    public bool shiftPrompts { get; set; } = true;
```

In `SettingsTab.cs`, beside the Ban Alerts section, add a `DrawShiftPrompts()` method and call it from `draw()` after `DrawBanAlerts()` with a separator:

```csharp
  private void DrawShiftPrompts()
  {
    DrawSectionHeader("Shift Prompts");
    var prompts = this.configuration.shiftPrompts;
    if (ImGui.Checkbox("Remind me to clock in and out", ref prompts))
    {
      this.configuration.shiftPrompts = prompts;
      this.configuration.Save();
    }
    if (ImGui.IsItemHovered())
    {
      ImGui.SetTooltip("Shows a notification when a shift of yours starts or runs past its end, at any venue. It never clocks you in or out by itself.");
    }
  }
```

- [ ] **Step 2: The Dalamud service.** In `Plugin.cs`, with the other `[PluginService]` lines, add:

```csharp
    [PluginService] public static INotificationManager Notifications { get; private set; } = null!;
```

with `using Dalamud.Plugin.Services;` already present and `using Dalamud.Interface.ImGuiNotification;` added.

- [ ] **Step 3: Replace the old end reminder.** In `Plugin.cs`:
  - Delete `CheckShiftEndReminder` and the `_shiftReminderShiftId` and `_shiftReminderLastMs` fields, and the call `CheckShiftEndReminder(pick);` inside `PollActiveShiftAsync`. Nothing else uses them.
  - Add these fields next to `activeShift`:

```csharp
    private readonly Dictionary<int, PromptMemory> shiftPromptMemory = new();
    private readonly HashSet<int> mutedShifts = new();
    private long lastPromptPollMs = 0;
    private bool promptPollInFlight = false;
```

  - Add these methods beside `PollActiveShiftAsync`. The muted set is touched from the notification button (UI thread) and from the poll (background thread), so both take the same lock:

```csharp
    private void PollShiftPromptsAsync()
    {
      if (promptPollInFlight || !Configuration.shiftPrompts) return;
      var nowMs = Environment.TickCount64;
      if (nowMs - lastPromptPollMs < 60_000) return;
      if (xivAppClient?.Xvm is not { } xvm) return;

      lastPromptPollMs = nowMs;
      promptPollInFlight = true;
      _ = Task.Run(async () =>
      {
        try
        {
          var now = DateTime.UtcNow;
          var shifts = await xvm.GetMyShiftsAsync(now);
          List<ShiftPrompt> due;
          lock (mutedShifts) due = ShiftPromptPlanner.Due(now, shifts, shiftPromptMemory, mutedShifts);
          foreach (var prompt in due)
          {
            shiftPromptMemory[prompt.ShiftId] = new PromptMemory(prompt.Kind, now);
            ShowShiftPrompt(prompt);
          }
        }
        catch (Exception ex)
        {
          Log.Warning("Shift prompt poll failed: {0}", ex.Message);
        }
        finally
        {
          promptPollInFlight = false;
        }
      });
    }

    private void ShowShiftPrompt(ShiftPrompt prompt)
    {
      var venueName = xivAppVenues.FirstOrDefault(v => v.Id == prompt.VenueId)?.Name ?? "a venue";
      var starting = prompt.Kind == PromptKind.Start;
      var verb = starting ? "Clock in" : "Clock out";
      var text = starting ? $"Your shift at {venueName} has started." : $"Your shift at {venueName} has ended.";

      var prefix = Configuration.showPluginNameInChat ? $"[{Name}] " : "";
      Chat.Print(prefix + text + $" Use the notification or /xvm {(starting ? "start" : "end")}.");

      var notification = Notifications.AddNotification(new Notification
      {
        Title = starting ? "Shift started" : "Shift ended",
        Content = text,
        Type = NotificationType.Info,
        InitialDuration = TimeSpan.FromMinutes(2),
        UserDismissable = true,
      });
      notification.DrawActions += _ =>
      {
        if (ImGui.Button(verb))
        {
          _ = ClockFromPromptAsync(prompt, starting);
          notification.DismissNow();
        }
        ImGui.SameLine();
        if (ImGui.Button("Not now"))
        {
          lock (mutedShifts) mutedShifts.Add(prompt.ShiftId);
          notification.DismissNow();
        }
      };
    }

    private async Task ClockFromPromptAsync(ShiftPrompt prompt, bool clockIn)
    {
      var shiftId = prompt.ShiftId.ToString(CultureInfo.InvariantCulture);
      var result = clockIn
        ? await xivAppClient.Shift.ClockInAsync(prompt.VenueId, shiftId)
        : await xivAppClient.Shift.ClockOutAsync(prompt.VenueId, shiftId);
      var chatPrefix = Configuration.showPluginNameInChat ? $"[{Name}] " : "";
      if (result.Success)
      {
        Chat.Print(chatPrefix + (clockIn ? "Clocked in." : "Clocked out."));
        InvalidateShiftPollCache();
      }
      else
      {
        Chat.Print(chatPrefix + $"{(clockIn ? "Clock-in" : "Clock-out")} failed: {result.Error ?? "unknown error"}");
      }
    }
```

  - In `OnFrameworkUpdate`, right after the existing `PollBannedPatronsAsync();` call, add `PollShiftPromptsAsync();`.

If decision P7 is declined, restore `CheckShiftEndReminder` and drop the `Chat.Print` line in `ShowShiftPrompt`. Use the real name of the ImGui namespace import already in `Plugin.cs` (`Dalamud.Bindings.ImGui`); add it if the file does not have it.

- [ ] **Step 4: Build and test.** Confirm with the user, then run `dotnet test VenueManager.Tests` and `dotnet build VenueManager.sln -c Release`. Expected: all pass, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add VenueManager
git commit -m "feat: prompt to clock in and out when a shift starts or ends, across venues"
```

---

### Task 5: Check it in the game

Needs the rebuilt DLL loaded and a linked account, and a manager account on the venues used (or the API, as the seeds below).

- [ ] **Step 1: Start prompt.** Create a shift assigned to yourself that started a few minutes ago and ends in two hours. Within a minute a "Shift started" notification appears with Clock in and Not now, plus one chat line. Click Clock in. Expected: "Clocked in." in chat, and the shift is active in the dashboard.
- [ ] **Step 2: End prompt.** Create a shift that ended a couple of minutes ago and clock in on it. Expected: a "Shift ended" notification with Clock out within a minute. Close it with the cross. Expected: it returns about fifteen minutes later. Click Clock out. Expected: "Clocked out." and no more prompts.
- [ ] **Step 3: Not now.** Repeat step 1 with a new shift and click Not now. Expected: no further prompt for that shift until the plugin restarts.
- [ ] **Step 4: Another venue.** Have the plugin showing one venue, and create a started, unclocked shift at a different venue you work at. Expected: the prompt names that other venue, and its Clock in works.
- [ ] **Step 5: No false prompts.** Shifts that are pending approval, in the future, cancelled, or already finished produce nothing.
- [ ] **Step 6: Setting.** Turn off Remind me to clock in and out, create a started shift, and wait two minutes. Expected: no prompt.
- [ ] **Step 7: Login mid-shift.** With a shift already running and not clocked in, restart the plugin. Expected: the start prompt shows on login.

---

## After this plan

1. **Retire the old path:** delete `/api/plugin/*`, `pluginAuthGate`, the Prisma `ApiKey` model, and revoke every `vm_` key on migration day with the plugin release that no longer uses them.
2. **Shift status in the status bar across venues:** the status bar shift label still follows the current venue only. It could read the same cross-venue poll. That is a separate, small change.

## Self-review

**Spec coverage.** The goal's pieces each have a task: deciding who is due a prompt (Task 2), reading shifts across venues (Task 3), showing the notification with the buttons, the setting and replacing the old reminder (Task 4), and the in-game checks (Task 5). P1 to P10 are each carried out or marked for confirmation; P7 and P8 are the two to confirm.

**Placeholder scan.** No step says TBD or "add handling".

**Consistency.** `ShiftPromptPlanner.Due(DateTime, IEnumerable<MyShift>, IReadOnlyDictionary<int, PromptMemory>, ISet<int>)` is called the same way in Tasks 2 and 4. `ShiftPrompt(ShiftId, VenueId, Kind)`, `PromptMemory(Kind, At)` and `MyShift` are defined once in `ShiftPromptPlanner.cs`. `XvmApiReads.GetMyShiftsAsync(DateTime)` is the call `Plugin` makes. `ClockFromPromptAsync` uses `XIVAppShiftApi.ClockInAsync` and `ClockOutAsync` with `(venueId, shiftId)`, as built in the writes plan.
