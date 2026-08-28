# Meta RTS — Product Requirements Document

## 1. Product Overview

Meta RTS is a browser-based real-time strategy game about territorial control of the United States. The player chooses a starting location on a stylized map, then competes against twenty automated opponents to control eighty percent of the continent. A complete match lasts five to ten minutes and requires no account, no install, and no persistence — the game is designed for immediate play in a single browser tab.

The experience is a single continuous session with no page reloads. All rendering, map interaction, simulation, and opponent decision-making occur entirely in the browser. The interface remains responsive at sixty frames per second even when every opponent is active and territory is changing on every tick. Map data and game state are loaded client-side; there is no backend dependency during play.

The product presents one primary route at `/` that contains the full game loop from entry through victory. The viewport is full-bleed, with a fixed control bar docked to the bottom edge and overlays that appear above the map without navigating away from the route.

Design viewport is `1440×900` for desktop and `390×844` for mobile. The root font size is the browser default `16px`.

## 2. Audience and Core Experience

- Primary audience:
  - Players who want a quick, self-contained strategy session in a browser tab during a break.
  - Players who enjoy territory control and light economic decisions without learning a deep ruleset.

- User goals:
  - Choose a starting position that balances expansion room and defensibility.
  - Expand into unclaimed land and attack opponents to grow territory.
  - Manage troops and gold to build structures that increase power or defense.
  - Reach eighty percent map ownership to win.

- Core loop:
  1. Enter a name and start the session.
  2. Choose a starting location on land.
  3. Expand into unclaimed territory.
  4. Attack opponent territory, with support for several simultaneous attacks.
  5. Spend gold to place Cities that raise troop capacity and Forts that raise the cost for enemies to attack nearby.
  6. Reach eighty percent ownership to trigger the victory state and offer a replay.

- Emotional and usability qualities:
  - Immediate and readable — the player understands ownership, strength, and progress at a glance.
  - Responsive and continuous — panning, zooming, and attacks feel direct with no reloads or interruptions.
  - Suggestive rather than noisy — the interface guides first-time players with short contextual hints, then stays quiet during focused play.

- Core flows:
  - Entry → location selection → active play → victory or defeat.
  - Tutorial path that overlays the active game and advances step by step on player action.

## 3. Global Design System

### Typography

| Role | Font | Size | Weight | Transform |
|------|------|------|--------|-----------|
| Display | System sans-serif | `clamp(2rem, 5vw, 4rem)` | `700` | uppercase |
| HUD Heading | System sans-serif | `14px` | `600` | uppercase |
| HUD Body | System sans-serif | `12px` | `400` | — |
| HUD Label | System sans-serif | `10px` | `500` | uppercase |

System stack is SF Pro on macOS, Segoe UI on Windows, Roboto on Android, with a `sans-serif` fallback. No additional web font is loaded. Line height follows the system default for each role; tracking is tight for the display title at `-2px` and normal for HUD text.

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-dark` | `#0d1117` | Page background, overlay backdrop |
| `--bg-panel` | `rgba(31, 41, 55, 0.92)` | Control bar, leaderboard, tooltip surfaces |
| `--text-primary` | `#e6edf3` | Primary text, headings, player names |
| `--text-secondary` | `#c9d1d9` | Secondary metadata, descriptions |
| `--text-muted` | `#8b949e` | Hints, helper text |
| `--accent-red` | `#ff4444` | Low troops, attack state, outbound indicator |
| `--accent-green` | `#44bb44` | Optimal troops, success |
| `--accent-yellow` | `#ccaa22` | Near capacity |
| `--accent-gold` | `#ffd700` | Gold currency, city icon, tutorial emphasis |
| `--accent-blue` | `#4488ff` | Player color, selection ring, placement ring |
| `--border` | `rgba(255,255,255,0.1)` | Panel borders and dividers |
| `--player-colors` | 21 distinct hues | One per player; each territory uses a four-stop gradient for depth |

Theme is dark only. Territory fills use a four-stop radial gradient from border through mid and interior to highlight to give depth without flat blocks.

### Spacing, Layout, and Elevation

- Page uses full viewport width and height with hidden overflow; no scrolling container.
- Panels use `8px` to `12px` corner radius and a subtle border at `1px` with low-opacity white.
- Overlay backdrops use a translucent dark fill with `backdrop-filter: blur(2px)` to `blur(10px)` where the map should remain hinted underneath.
- Shadows are soft and diffuse; elevation is conveyed with border opacity and a faint glow on the display title at `0 2px 20px rgba(68, 136, 255, 0.3)`.

### Shared Visual Patterns

- Buttons:
  - Primary action uses solid `#4488ff` fill with white text, `18px` size, `700` weight, `8px` radius, and a subtle lift on hover at `translateY(-1px)`.
  - Secondary action uses transparent fill with a `2px` solid `#4488ff` outline and blue text, same radius and lift.
- Panels:
  - Control bar, leaderboard, and tooltips share the same panel fill and border, with `8px` radius and compact padding.
- Iconography:
  - Hand-authored vector icons for city, fort, troop, and gold appear in the control bar and as world overlays above the map.

### Motion Language

| Trigger | Behavior | Duration | Easing |
|---------|----------|----------|--------|
| Select `Play` | Cloud cover drifts outward from center and fades while the camera eases from a wider view to the playable zoom | `3s` | ease-out |
| Choose starting location | Camera eases to the chosen tile with a short zoom and pan | `0.6s` | ease-out |
| Open or hover a panel button | Tooltip appears above the control | `0.2s` | ease-out |
| Troop bar update | Fill width and gradient position animate | `0.3s` | ease-out |
| Appear of victory state | Dialog scales in from small to full | `0.4s` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` |

Cloud intro uses sixty or more procedurally placed radial puffs that drift outward and fade; each puff is a soft gradient disc. All nonessential motion respects the user's reduced-motion preference.

### Responsive System

| Breakpoint | Layout and Interaction |
|------------|------------------------|
| `> 768px` | Desktop layout: bottom control bar centered `440px` wide and `60px` tall with side-mounted build buttons; leaderboard open by default; mouse wheel to zoom, drag or `W`, `A`, `S`, `D` to pan. |
| `≤ 768px` | Tablet and small desktop: touch controls replace hover — single-finger drag to pan, tap to select or attack, two-finger pinch to zoom. Build buttons move to a vertical stack at the map edge. Minimum touch target is `44px`. |
| `≤ 700px` | Leaderboard collapsed by default; help control remains reachable. |
| `≤ 480px` | Control bar condenses; detail text collapses to essential numbers with tooltips carrying the explanation. |

General rules:
- Camera clamps at every zoom level so no empty area beyond the map is visible.
- Zoom range is continuous from a fitted minimum that shows the full map width or height to a maximum of `8x`.
- Horizontal overflow never appears; content reflows or collapses rather than scrolling sideways.

### Image and Media Treatment

- Territory and terrain are rendered as a pixel grid at the map size and then scaled by the viewport zoom; terrain uses distinct land and water palettes with precomputed variation.
- City and fort icons are crisp vector assets drawn above the map and keep their size in world space regardless of zoom.
- Decorative imagery is not used beyond the cloud intro and map itself; the product is data-driven and icon-driven.

## 4. Global Accessibility Requirements

- All interactive controls must be reachable and operable by keyboard, including:
  - Name field entry, `Play`, and `Tutorial` on the entry screen.
  - Bottom control bar buttons for city and fort placement with hotkeys `1` and `2`.
  - Leaderboard toggle and help control.
  - Dismissal of prompts and overlays with `Escape`.
- Visible focus states appear on every focusable element with a contrast ratio sufficient against the dark panel fill. Focus order follows visual order from entry to map to control bar to overlays.
- Heading structure exposes one primary heading for the product title and secondary headings for each overlay title such as `Welcome to Meta RTS!` or `Victory!`.
- Landmark expectations:
  - Entry and game controls use `button` elements.
  - The name prompt uses a text input with a visible placeholder `Enter your name` and an accessible name tied to the field.
  - The game canvas is the primary interactive surface and exposes an accessible name that conveys the map interaction.
- Icon-only buttons carry an accessible name that matches their visible tooltip, such as `City` and `Fort`.
- Meaningful imagery carries alternative text, while decorative map texture and cloud puffs are hidden from assistive technology.
- Text and control contrast meets `4.5:1` for normal text and `3:1` for large text against the dark backgrounds on which it appears.
- When the user prefers reduced motion, nonessential animations such as the cloud drift and the victory scale are reduced to a crossfade or removed.
- State and feedback announcements:
  - Territory expansion and attack launches provide a visible status change in the control bar and an accompanying accessible status update.
  - Troop count, gold, and ownership percentage changes are perceivable without relying on color alone.
  - When an overlay appears, focus moves to the overlay and returns to the triggering context on dismiss.

## 5. Global Content and Data

- Product name spelling is `Meta RTS`.
- Voice and tone is concise, supportive, and game-neutral; hints are short imperatives rather than lore paragraphs.
- Root asset references use `/public` paths. The product uses the following public assets:
  - `/public/icons/city.svg` — city building icon.
  - `/public/icons/defense_post.svg` — fort icon.
  - `/public/icons/gold.svg` — gold currency icon.
  - `/public/icons/troop.svg` — troop strength icon.
  - `/public/maps/usa/map.bin` and `/public/maps/usa/manifest.json` — map geometry and metadata for the United States map.

### Building Catalog

| Key | Label | Cost Behavior | Effect | Hotkey |
|-----|-------|---------------|--------|--------|
| `city` | `City` | Starts at `50g` and doubles per city owned, capped at `500g` | Adds `500` to maximum troop capacity | `1` |
| `defense_post` | `Fort` | Starts at `25g` and rises `25g` per fort owned, capped at `150g` | Enemy attacks against tiles within radius cost `4x` | `2` |

Placement for both buildings is restricted to the player's own territory. Cost is shown in the control bar and tooltip before placement and is affordable only when current gold meets or exceeds the displayed cost.

### Player Roster and Map

| Field | Value |
|-------|-------|
| Player count | 21 total — `You` plus 20 opponents |
| Opponent names | `Washington`, `California`, `Montana`, `Colorado`, `Texas`, `Minnesota`, `Illinois`, `Georgia`, `New York`, `Mexico`, `Oregon`, `Idaho`, `Arizona`, `Kansas`, `Ohio`, `Virginia`, `Maine`, `Nebraska`, `Nevada`, `Florida` |
| Map | United States at `1440×810` with `844940` land tiles |
| Starting arrangement | Each opponent begins with a circular cluster radius `10` around its assigned coordinate; the player chooses an unclaimed land tile to seed the same radius |

Troop and gold presentation:
- Troop values are whole numbers formatted as `0` to `999` plain, `1.0K` to `9.9K` with one decimal, and `10K` and above with no decimal followed by `K`.
- Gold is whole `g` with a per-minute income suffix such as `+12/m`.
- Maximum troops for a player equals `150` plus `12` times owned tiles raised to the power `0.6`, plus `500` per city.

### Reusable Labels and Messages

- Entry actions: `Play`, `Tutorial`.
- Entry placeholder: `Enter your name`.
- Status values in the control bar: `IDLE`, `TAKING WILDERNESS`, `ATTACKING {opponentName}`.
- Outbound indicator: `Outbound: {value}`.
- Placement banners: `PLACING CITY — click to place, Esc to cancel` and `PLACING FORT — click to place, Esc to cancel`.
- Victory heading: `Victory!`.

## 6. Product Surfaces

### Landing Entry (`/`)

- Purpose:
  - Let the player identify themselves and enter the game or enter the guided tour.
  - Provide the first brand impression before the map is revealed.

#### Entry Overlay

- Content:
  - Heading `Meta RTS`.
  - Text field with placeholder `Enter your name` and a limit of `20` characters.
  - Primary button `Play`.
  - Secondary button `Tutorial`.
- Structure, components, and assets:
  - Centered column with title at the top, field below it, and the two actions beneath the field in vertical order.
  - Overlay fills the full viewport with a translucent dark backdrop and sits above the background map preview.
- Behavior / states:
  - The field accepts typing on entry and has visible focus treatment. When empty, starting uses the name `Player`.
  - Selecting `Play` hides the overlay and starts the standard session at the location selection step.
  - Selecting `Tutorial` starts the same session but enables guided hints from the first step.
  - Pressing `Enter` inside the field triggers `Play`.
  - The background map behind the overlay shows a slow passive preview of an ongoing simulated game so the page never appears empty while the player decides.
- Accessibility notes:
  - The heading is the page's primary heading.
  - The name field has an accessible name derived from its placeholder and is the first focused element on load.

### Active Game Session (`/`)

- Purpose:
  - Provide the continuous interactive territory-control session where all play occurs.
  - Keep map, ownership, economy, and controls synchronized without leaving the route.

#### Map World Viewport

- Content:
  - United States terrain rendered as distinct land and water tiles, with ownership shown as a colored gradient field per player.
  - City and fort markers drawn in place on owned tiles.
  - Transient attack indicators where movement is in progress.
- Structure, components, and assets:
  - Full-viewport canvas as the primary surface. World elements such as city icons use `/public/icons/city.svg` and equivalent fort, troop, and gold icons where they appear as map markers.
  - Overhead panels such as leaderboard and control bar are drawn as screen-space layers above the world, not as part of the world zoom.
- Behavior / states:
  - Panning via drag or `W` / `A` / `S` / `D` moves the camera; zooming via wheel or pinch scales the view. The camera always clamps so map edges remain at the viewport edge.
  - The introduction clears procedurally generated cloud cover over `3s` while the camera eases to the fitted zoom; during the early portion the location prompt fades in rather than appearing abruptly.
  - When a starting tile is chosen, the camera eases to that tile at the playable zoom.
- Responsive behavior:
  - On touch viewports, drag, tap, and pinch replace hover and wheel interactions with the same camera clamping.
- Accessibility notes:
  - The canvas exposes a landmark role and an accessible name describing map interaction.
  - Keyboard panning uses the same clamped bounds as pointer interaction.

#### Location Selection Prompt

- Content:
  - Title `Tap to choose your start` on touch or `Click anywhere to choose your start` on desktop.
  - Supporting line `Conquer 80% of the map to win. Good luck!` on desktop or split into two lines `Conquer 80% of the map to win.` and `Good luck!` on small viewports.
  - Helper line `Pick your starting location wisely`.
- Structure, components, and assets:
  - Centered card `560px` wide (`130px` tall on mobile, `110px` on desktop) with rounded corners `12px`, translucent dark fill, and a soft gold outline.
  - Card floats above the map center during the selection phase.
- Behavior / states:
  - Prompt appears after the cloud intro has progressed past sixty percent and remains until the player selects a valid unclaimed land tile.
  - Hovering a valid land tile while the prompt is active shows a soft circular preview of radius `10` centered on the cursor with a blue outline, indicating the area that will be claimed on click.
  - Clicking or tapping a valid land tile claims the circle around that tile and advances the game out of the selection state.
  - Clicks on water or on already owned tiles while in this state do not advance.

#### Bottom Control Bar

- Content:
  - Top row shows current status such as `IDLE`, `TAKING WILDERNESS`, or `ATTACKING {name}`, a compact outbound troop pill `Outbound: {value}`, and a territory progress area with percentage text.
  - Bottom row shows troop capacity as `current / max` with color mapped to the fill ratio and a gold pill showing `gold + goldPerMinute`.
- Structure, components, and assets:
  - Fixed bar centered at the bottom edge, `440px` by `60px` on desktop and `80px` tall edge-to-edge on touch. Background is the panel token with `10px` radius and a subtle border.
  - Left side holds the status text; center or right holds the territory progress; bottom row splits troop fill on the left and gold on the right.
  - Build buttons sit immediately adjacent to the bar as paired tiles outside the bar on desktop or stacked vertically at the viewport edge on touch.
  - Icons for troop and gold inside the bar use `/public/icons/troop.svg` and `/public/icons/gold.svg`.
- Behavior / states:
  - Territory percentage is owned land divided by total land; fill color shifts from blue below fifty percent to gold at fifty to eighty percent to green at or above eighty percent, with a thin vertical tick at the `80%` mark.
  - Troop bar fill maps owned ratio from red at low troops through green at mid to gold near capacity, with width proportional to `troops / maxTroops`.
  - Status text and pill colors follow the current action: neutral green for idle, yellow for wilderness, red for attacks.
  - Updates occur every simulation tick and remain smooth at sixty frames per second.
- Responsive behavior:
  - On small viewports the outbound pill is hidden and the bar widens to `canvas width - 16px`; detail that was in the pills is available through tooltips instead.

#### Build Controls

- Content:
  - Two adjacent buttons:
    - `City` with `City` label text and current cost such as `50g`.
    - `Fort` with `Fort` label text and current cost such as `25g`.
  - Each button shows its icon from `/public/icons/city.svg` or `/public/icons/defense_post.svg`.
- Structure, components, and assets:
  - Buttons are `54px` by `60px` on desktop and `56px` by `56px` on touch, with `8px` radius and a subtle border that brightens on hover or selection.
- Behavior / states:
  - Button is fully opaque when affordable and at `0.35` opacity when unaffordable.
  - Hover shows a compact tooltip listing effect, placement constraint, and hotkey: for city `+500 max troop capacity`, `Place inside your territory`, `Hotkey: 1`; for fort `4x attack cost for enemies in range`, `Place on your border to defend`, `Hotkey: 2`.
  - Selecting a button enters placement mode and shows a top-center banner with `PLACING CITY — click to place, Esc to cancel` or the fort equivalent. A later click on a valid tile places the structure, deducts gold at the displayed cost, and exits placement; `Escape` cancels placement without cost.
  - Hotkeys `1` and `2` toggle the matching placement mode with the same banner and cancel behavior.
- Accessibility notes:
  - Buttons have accessible names `City` and `Fort` and expose disabled state when unaffordable.
  - Hotkeys are an enhancement and do not replace pointer operation.

#### Leaderboard Panel

- Content:
  - Heading `Leaderboard  [▲]` when open or `Leaderboard [▼]` when collapsed.
  - Column headings `Player`, `Owned %`, `Max Troops`.
  - One row per living player sorted by owned tiles descending, each showing rank, color swatch, player name, ownership percentage, and formatted maximum troops.
  - The current player row is highlighted with a blue outline; when the player is off-screen in the top ten view, the player row is pinned as a sticky row beneath a divider.
- Structure, components, and assets:
  - Panel anchored at `10px` from the top and left edges, `320px` wide when open and `160px` by `24px` when collapsed, with `8px` radius.
  - Rows are `22px` tall; up to ten rows are visible before scrolling; a thin scrollbar track and thumb appear when there are more than ten living players.
- Behavior / states:
  - Open by default on viewports `≥ 700px` wide and collapsed by default on smaller viewports; the heading is the toggle.
  - Scrolling is confined to the leaderboard list and does not move the underlying map.
  - Data refreshes every tick and resorting is stable between updates.
- Responsive behavior:
  - When collapsed, only the heading is visible and no map area is obscured.
- Accessibility notes:
  - The toggle is a keyboard-reachable control with an accessible name reflecting the collapsed or expanded state.

### Tutorial Guidance Mode

- Purpose:
  - Teach first-time players the minimum actions needed to understand expansion, attacking, and building without requiring separate documentation.

#### Tutorial Overlay

- Content:
  - Sequence of nine steps in order:
    - `Welcome to Meta RTS!` with `Let's learn the basics. Click to continue.`
    - `Camera Controls` with `Use WASD to pan and scroll to zoom.`
    - `Expand Your Territory` with `Click unclaimed land near your border to expand.`
    - `Attack Enemies` with `Click enemy territory to attack!`
    - `Build a City` with `Click the City button or press 1.`
    - `Place Your City` with `Click inside your territory to place it. Cities increase max troops.`
    - `Build a Defense Post` with `Click the Def Post button or press 2.`
    - `Place Your Defense Post` with `Click on your border to place it. They protect your territory.`
    - `Tutorial Complete!` with `You're ready! Good luck. Click to dismiss.`
  - Step counter in the corner showing `1/9` through `9/9`.
- Structure, components, and assets:
  - Guidance card `420px` by `100px` centered `60px` from the top, with a dark translucent fill, `8px` radius, and `2px` gold outline.
  - When a step has a highlight target, the page dims with a semi-transparent black veil except for the target card and the highlighted region, with a short dashed arrow connecting the two.
- Behavior / states:
  - Tutorial is entered only by selecting `Tutorial` on the entry screen; standard `Play` starts without it.
  - Each step advances on a concrete player action that matches its completion condition:
    - `Welcome` and `Complete` advance on any click.
    - `Camera` advances after both `W` / `A` / `S` / `D` and zoom have been used.
    - `Expand` advances on clicking unclaimed land at the player's border.
    - `Attack` advances on clicking opponent-owned territory.
    - `City` and `Def Post` selection advance when the corresponding placement mode becomes active.
    - `Place` steps advance when a city or fort owned by the player appears on the map.
  - The two building selection steps grant `200g` so the required purchase is reachable during the tour.
  - If the session ends via victory while the tutorial is active, the tutorial closes.
  - Highlight targets include player border, enemy border, city build button, and fort build button, each shown with a pulsing gold rectangle at the target.
- Accessibility notes:
  - The guidance card is the focused region while the tutorial is active; `Escape` does not bypass a required action but a standard replay can restart the tour.

### Victory State

- Purpose:
  - Confirm success and let the player replay without navigating away.

#### Victory Dialog

- Content:
  - Heading `Victory!`
  - Supporting stats summarizing final ownership and a primary action `Play Again`.
- Structure, components, and assets:
  - Centered dialog above the map with the same panel treatment as other overlays and a stronger scale presence so it reads as an end state.
- Behavior / states:
  - Appears only when the player's owned percentage reaches `80%`. Enters with a short spring scale over `0.4s`.
  - Selecting `Play Again` returns the player to the entry state so a new location can be chosen.
  - While visible, map interaction is paused and only the dialog's primary action is intended.
- Accessibility notes:
  - The dialog moves focus to its heading and primary action on appear and restores the previous context when dismissed via replay.

### Help Overlay

- Purpose:
  - Provide quick reference without blocking the core loop for long.

#### Help Surface

- Content:
  - Concise reminders of camera controls, attack behaviour, and the win condition at `80%`.
- Structure, components, and assets:
  - Trigger is the circular `?` control fixed near the top-right at `30px` from the top edge with a `14px` radius dark fill.
  - Overlay appears as a compact panel near the trigger.
- Behavior / states:
  - Selecting the `?` toggle shows the panel; selecting it again or pressing `Escape` hides it.
  - Presence of the help panel does not pause simulation; the game continues underneath.
- Accessibility notes:
  - The `?` trigger exposes an accessible name such as `Help` or `Open help`.

### Hover Tooltips and Transient Feedback

- Purpose:
  - Explain the numbers and progress shown in the compact bar without crowding the bar itself.

#### Tooltip Collection

- Content:
  - Gold tooltip:
    - Heading `Gold income` and line `Territory: +{value}/min` plus helper `Spend on Cities and Forts.`
  - Troop tooltip:
    - Lines `Land cap: {value}`, `Cities (×{count}): +{value}`, `Troops/sec: +{value}`, and a short legend `Red: low troops, fast regen`, `Green: optimal troop gain`, `Yellow: near cap, diminishing`.
  - Territory tooltip:
    - Lines `Your territory as % of the total map.` and `Reach 80% to claim victory!`
  - Outbound tooltip:
    - Heading `Outbound Troops` and one line per active attack or beachhead such as `Wilderness: {value}` or `California (beachhead): {value}`, or the single line `No active attacks`.
  - Build button tooltips already described under Build Controls.
- Structure, components, and assets:
  - Each tooltip is a small panel with `10px` padding, `8px` radius, and a border tinted to match its subject such as gold for gold or blue for territory.
  - Panels appear directly above the hovered control, centered on that control and clamped so they never overflow the viewport edge.
- Behavior / states:
  - Tooltips appear only on hover over the related control and disappear on hover end. Placement mode suppresses the build tooltip so the placement banner remains the focal guidance.
  - All displayed values update from the same tick data that drives the bar itself.

## 7. Acceptance Criteria

### Landing and Entry

- The entry overlay shows heading `Meta RTS`, a name field with placeholder `Enter your name`, and actions `Play` and `Tutorial` centered above a passive map preview.
- Leaving the name empty and selecting `Play` starts the session as `Player`; pressing `Enter` in the field starts the same session as selecting `Play`.
- Selecting `Tutorial` starts the game with the full hint sequence enabled, while selecting `Play` starts without hints.

### Map and Camera

- After the entry is dismissed, procedurally generated cloud cover drifts outward and fades over roughly `3s` while the camera eases to the fitted playable zoom.
- The map fills the viewport; dragging or using `W`, `A`, `S`, `D` pans, wheel or pinch zooms, and the view clamps at every zoom so the map edge never reveals empty space.
- Zoom is continuous from the fitted minimum to `8x` and remains smooth at sixty frames per second during full simulation.
- Choosing a starting location animates the camera to that tile and claims a radius of `10` around the click on valid unclaimed land only.

### Location Selection and Territory

- The selection prompt shows the expected title and the good-luck copy and remains until a valid land tile is chosen.
- Hovering valid unclaimed land during selection shows a translucent preview circle with a blue ring; hovering water or owned tiles shows no preview.
- Territory ownership is visible as a distinct color field per player with a soft gradient that makes borders readable; water and land remain visually distinct.

### Bottom Bar and Economy

- The bottom bar remains fixed at the viewport bottom edge, centered `440px` wide on desktop and edge-to-edge on touch, and never overlaps important map feedback.
- Status text reflects the current action as one of `IDLE`, `TAKING WILDERNESS`, or `ATTACKING {name}` with matching color treatment.
- Territory progress shows the player's percentage of total land with a thin tick at `80%` and fill that shifts from blue to gold to green.
- Troop fill width tracks `troops / maxTroops` and uses the red to green to gold progression; gold and income update every tick.
- Outbound troops are visible as a pill on desktop and via a dedicated tooltip; zero outbound still presents a coherent state.

### Building

- City and fort controls show the current cost and become fully opaque only when affordable; unaffordable buttons remain visibly muted.
- Hovering an affordable build control outside placement mode shows a tooltip with the correct effect, constraint, and hotkey line.
- Selecting a build control enters placement mode with the exact banner `PLACING CITY — click to place, Esc to cancel` or the fort equivalent, and placing on a valid owned tile deducts the shown cost while `Escape` cancels without cost.
- Hotkeys `1` and `2` toggle the same placement modes and banners as the pointer controls.

### Tutorial

- Each tutorial step advances only on the action described in its completion condition, and the two building-selection steps make the required purchase reachable for the tour.
- Highlighted regions show a dimmed veil with a clear cutout and a pulsing gold rectangle plus a dashed arrow linking the hint card to the target.
- The tutorial closes when the final step is dismissed or when the victory state appears, and it does not reappear on replay unless the player selects `Tutorial` again.

### Leaderboard, Help, and Overlays

- The leaderboard is open on desktop widths and collapsed on small widths; toggling the heading switches the state without moving the map.
- The leaderboard lists living players sorted by owned tiles with rank, color swatch, name, owned percentage, and maximum troops, with the current player highlighted and pinned when off-screen.
- The `?` help control shows and hides a quick reference panel without pausing the simulation, and `Escape` hides any open help or placement state.

### Victory and Replay

- Reaching `80%` ownership presents the `Victory!` dialog with its scale-in and dims interaction so that only replay is intended.
- Selecting `Play Again` returns the player to the entry state ready for a new location choice.

### Responsive and Accessibility

- At `≤ 768px` the interaction model switches to drag, tap, and pinch with `44px` minimum touch targets, and the build buttons reposition to the vertical stack without overlapping the bottom bar.
- No horizontal overflow appears at `320px`; at narrow widths the bar collapses to essential numbers and relies on tooltips for detail.
- Every interactive control is reachable by keyboard, focus is visible, the entry heading and overlay headings are real headings, the name field and icon-only buttons have accessible names, and decorative map and cloud layers are not exposed as meaningful images.
- With reduced motion enabled, cloud drift and dialog scale are reduced to a crossfade or removed while status, progress, and placement feedback remain clear.
