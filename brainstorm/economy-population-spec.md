# Economy System Spec: Population & Port-Based Gold

## Design Philosophy

This game differentiates from OpenFront through a deeper economy that rewards strategic planning, alliance-building, and diplomacy. The pace of warfare is deliberately slower — players invest in infrastructure, negotiate trade access, and build up before committing to conflict. But warfare must never stall completely. Every mechanic is designed with two goals: make economy meaningful AND ensure there's always a reason to fight.

**Core principles:**
- Economy is complex enough that building tall is viable and interesting — but never so safe that turtling is optimal
- Diplomacy and alliances matter because players need terrain they don't start with (coastal players need inland rubies, inland players need coastal ports)
- Border clashes and conquest stay active because:
  - Territory contains resources (grassland, rubies, fish patches) that are worth taking
  - Trade routes through contested territory can be cut, forcing military response
  - Siege towers give attackers a tool to break through defensive lines
  - Missiles punish players who over-invest in static defense and neglect adaptation
  - City exclusion zones mean the best city sites are finite and worth fighting over
  - Destroying enemy infrastructure (mills, trade hubs, silos) via conquest or missiles has massive economic impact — wars have real stakes

**Anti-stalemate mechanics:**
- Siege towers counter defense posts, preventing permanent turtle
- Missiles bypass ground defenses entirely, punishing passivity
- Trade route vulnerability means a single territorial cut can cripple an economy — incentivizes offensive action to sever enemy supply lines
- Resource scarcity (limited river-coast tiles, limited ruby deposits) ensures players compete over the same terrain rather than building in isolation
- Each escalation step (defense post upgrades, siege tower upgrades, SAMs) costs more gold — eventually one side can't keep up and the front breaks

**Compared to OpenFront:**
- Slower early game — players build infrastructure before fighting
- More meaningful mid game — border militarization, trade routes, and diplomacy create dynamic tension
- More dramatic late game — missile strikes and economic warfare create decisive moments
- Alliances matter — inland and coastal players naturally complement each other and benefit from cooperation

## Overview

A spatial economy where geographic decisions drive everything. Ports generate gold from coastline exposure. Gold funds buildings. Buildings generate population for cities. Population increases troop capacity. River and coast bonuses on cities create natural conflict over key terrain.

---

## Resource Chains

```
POP CHAIN:    Grassland → Farms → Cities ← Fisheries ← Fish Patches
                            ↑
                          Mills (amplify farms)
              River bonus multiplies farm yield and city pop

GOLD CHAIN:   Ports (coastline) → Base gold
              Ruby Deposits → Mines → Base gold (inland, safe)
              Ruby Deposits → Mines → Transport Hubs → Ports → Boosted gold (trade route, vulnerable)

MILITARY:     Pop → Troop capacity
              Gold → Missile Silos → Missiles (per-launch cost) → Area damage
              Gold → SAM Sites → Interceptors (per-intercept cost) → Missile defense

              Gold funds all buildings + late-game arms race
              Pop increases troop capacity
```

---

## Buildings

### Port
- **Purpose**: Only source of gold income
- **Placement**: Must be placed on a player-owned land tile adjacent to water
- **Gold generation**: Based on how many water/coast tiles are within its radius. More exposed coastline = more gold per tick
- **Cost**: Cheap — this is the bootstrap building, players need gold before anything else
- **Design intent**: Coastal territory becomes valuable. Players fight over shorelines not just for expansion but for economic dominance

### Farm
- **Purpose**: Provides base population to a connected city
- **Placement**: Any owned land tile
- **Connection rule**: A farm is "connected" to a city if it is within that city's radius
- **Pop contribution**: Based on how many **grassland** tiles are within the farm's radius. More grassland = more pop yield. Same mechanic as fisheries counting fish patches — farms and fisheries are mirrors of each other for inland vs. coastal terrain
- **Suggested yield**: +0.5 pop per grassland tile in radius. A farm in a lush grassland area might yield 4-5 pop, while one in sparse/mountainous terrain yields very little
- **River bonus**: Farms placed on or adjacent to a river tile get a multiplier on their yield (e.g., 1.5-2×). River-adjacent grassland is the most fertile land on the map
- **Cost**: Cheap — the bread-and-butter building players place throughout the game
- **Design intent**: Not all land is equal for farming. Players must scout for grassland-rich areas, just like coastal players scout for fish patches. River-adjacent grassland is premium farmland — the inland equivalent of a fish-rich coast

### Grassland (map resource)
- **What it is**: A terrain type assigned to land tiles during map generation. Represents fertile, farmable land
- **Distribution**: Concentrated in plains, river valleys, and lowlands. Sparse or absent in mountains, highlands, and arid regions
- **Visibility**: Always visible to all players via terrain coloring (green-tinted tiles vs. brown/grey for non-grassland)
- **Design intent**: Mirrors fish patches for inland play. Creates varied land value — some inland regions are farming powerhouses, others are barren. River valleys with dense grassland become the inland player's most valuable territory

### Mill
- **Purpose**: Amplifies population by converting nearby farm output into bonus pop for a connected city
- **Placement**: Any owned land tile
- **Connection rules**:
  - A mill connects to farms within the mill's radius
  - A mill connects to a city if it is within that city's radius
  - A mill must be connected to at least one farm AND one city to function
- **Pop contribution**: Adds bonus pop to its connected city based on how many farms are connected to the mill. More farms = more bonus pop (with diminishing returns per additional farm)
- **Cost**: Expensive — the mid-game investment building
- **Suggested formula**: `bonus_pop = base_mill_pop * sqrt(connected_farm_count)` — this gives meaningful gains for the first few farms but diminishing returns beyond ~6-8 farms per mill
- **Design intent**: Placement puzzle — mill needs to be positioned where it can reach both farms and a city. Creates interesting cluster vs. spread decisions

### City
- **Purpose**: Holds population, which determines troop capacity
- **Placement**: Any owned land tile, but **must be at least X tiles away from any other city** (yours or enemy's). This exclusion radius prevents city spam and forces strategic commitment to a region
- **Base pop**: Small fixed amount (e.g., 5 pop just for existing)
- **Receives pop from**: Connected farms (direct) and connected mills (bonus from their farms)
- **Troop capacity contribution**: Each pop point increases max troops by a fixed amount (e.g., +20 troops per pop)
- **Cost**: Moderate
- **Terrain bonuses** (multiplicative, applied to total pop received by this city):
  - **River tile**: +50% pop
  - **Coast tile** (adjacent to water): +50% pop
  - **River + Coast**: +100% pop (bonuses stack additively: 1.0 + 0.5 + 0.5 = 2.0x)
- **Exclusion zone effects**:
  - Coastal players are hurt most — narrow land strips mean exclusion zones overlap, limiting them to fewer cities spaced along the coast
  - Inland players benefit — wide open land means more room to space cities and surround each one with farms/mills
  - This naturally balances the coastal gold advantage: coastal players have more gold but fewer, smaller cities. Inland players have less gold but more cities with denser farm networks
- **Design intent**: City placement is the highest-stakes decision. The exclusion zone means each city is a long-term commitment to developing a region. Players must choose between optimal terrain (river/coast) and optimal spacing

### Defense Post
- **Purpose**: Protects borders by making tiles harder for enemies to take
- **Placement**: On or near owned border tiles
- **Upgradeable**: Yes — can be upgraded through multiple levels, each costing increasing gold
- **Level mechanic**: A defense post's effective level is compared against nearby enemy siege towers. If the defense post's level ≥ the siege tower's level, the defense post remains active. If the siege tower's level is higher, the defense post is neutralized
- **Cost**: Base cost is moderate. Each upgrade costs significantly more than the last (e.g., L1 = 50g, L2 = 120g, L3 = 250g)
- **Design intent**: Defense posts are the baseline border protection. Cheap to place, effective against uncontested attacks. But they can be neutralized by siege towers, forcing the defender to upgrade or lose the advantage. Creates a gold-burning arms race on contested borders

### Siege Tower
- **Purpose**: Offensive building that neutralizes nearby enemy defense posts, enabling breakthrough attacks
- **Placement**: On owned territory near the border you intend to attack
- **Upgradeable**: Yes — same level system as defense posts
- **Level mechanic**: A siege tower neutralizes all enemy defense posts within its radius whose level is ≤ the siege tower's level. If the defense post is upgraded to match or exceed the siege tower, the defense post reactivates. The attacker must then upgrade the siege tower further to re-neutralize it
- **Radius**: Moderate — large enough to cover a section of the border, not the entire front
- **Cost**: Expensive. Each upgrade costs significantly more (e.g., L1 = 80g, L2 = 180g, L3 = 400g). Siege towers should cost more than defense posts at each level — the attacker pays a premium to break through
- **Vulnerability**: If the enemy takes the tile the siege tower is on, it's destroyed. Siege towers near the front are inherently risky investments
- **Design intent**: The attacker's answer to defense posts. Placing a siege tower is a visible declaration of intent — the defender sees it and must decide whether to upgrade their defense posts, counter-attack the siege tower, or reinforce elsewhere. Creates localized arms races on specific borders

### Border Militarization Mechanic
```
ESCALATION CYCLE:
  Attacker places Siege Tower L1 → Neutralizes enemy Defense Posts L1 in radius
  Defender upgrades Defense Post to L2 → Defense Post reactivates, siege tower ineffective
  Attacker upgrades Siege Tower to L2 → Defense Post neutralized again
  Defender upgrades to L3 → Reactivates again
  ... and so on
```
- Each escalation step costs more gold than the last, creating a drain on both sides
- The attacker always pays more per level than the defender (siege > defense at each tier) — this ensures defense has a natural advantage, but a richer attacker can overcome it
- Multiple siege towers can target the same border section, but defense posts in range of ANY higher-level siege tower are neutralized
- Heavily militarized borders become expensive gold sinks for both sides — players must weigh whether the border is worth the investment or if they should attack elsewhere
- The visual escalation (L1 → L2 → L3 buildings growing larger/more imposing) gives map readability — players can see where the arms races are happening

### River Gates (Defense Post on River)
- **What it is**: When a defense post is placed on a tile adjacent to a river, it functions as a river gate — blocking enemy boats from passing through that point on the river
- **Blocking behavior**: Enemy boats cannot sail past a river gate. They are stopped at the gate's position. Boats can still cross the river laterally (shore to shore) to land troops and attack the gate, but cannot continue upstream or downstream past it
- **Owner's boats pass freely**: The player who owns the river gate can boat through it without restriction. This makes rivers a fast internal transport network for the defender — troops can be moved quickly between cities along the river while enemies are locked out
- **Destroying a gate**: The attacker must cross the river, land troops, and take the territory the gate is on to destroy it. Once the gate falls, enemy boats can pass through that point and push further up/downstream to the next gate
- **Upgradeable**: River gates follow the same level system as regular defense posts. A higher-level gate is harder to take (same siege tower interaction applies)
- **Placement strategy**: Defend narrow river points, forks, and where rivers enter your territory. Each gate is a checkpoint that the attacker must break through sequentially

### River Warfare Dynamics
```
DEFENDER'S RIVER:
  Gate A (downstream) → Gate B (midstream) → Gate C (upstream, deep territory)
  Defender's boats move freely between all gates — fast troop redeployment

ATTACKER'S CAMPAIGN:
  1. Cross river near Gate A, land troops, assault Gate A
  2. Gate A falls → attacker boats can now sail to Gate B
  3. Cross river near Gate B, assault Gate B
  4. Gate B falls → attacker boats push to Gate C
  ... sequential campaign up the river
```
- Rivers shift from being a defensive liability (exposed shoreline) to a controllable strategic asset
- The defender who invests in river gates has interior lines — fast troop movement along the river while the attacker must fight gate by gate
- Attacking up a river becomes a multi-step campaign, not a single boat rush. Each gate is a battle
- Narrow river sections are natural chokepoints — a single gate can lock down the entire river. Wide rivers may need multiple gates to fully block
- A player who controls a river from source to sea has a massive logistical advantage — internal boat transport with gates locking out enemies at every entry point
- Destroying river gates via missile strike is a valid strategy — blow a hole in the defender's river defenses to sail boats through without a ground assault

### Beachhead Mechanics (Amphibious Landing)

**Troop commitment:**
- Amphibious landings commit **20%** of troops (same fixed rate as all attacks)
- The player commits more by sending additional boat landings to the same area (though limited to one boat at a time — see Boat Limit)
- **20% landing** is enough for undefended coastlines but fragile against defended shores — the beachhead penalty makes the 5-second window dangerous with limited troops

**Landing behavior:**
- The initial boat landing expands **radially in all directions** from the landing point — troops push outward to grab as much ground as possible and establish a foothold
- No vector attacks can be launched from a beachhead during stabilization — the troops are fighting to survive, not pushing in a direction
- During the 5-second stabilization window, a **"+" reinforcement button** appears on the beachhead. Clicking it sends an additional 20% of troops from the homeland to reinforce the beachhead (troops arrive instantly as reinforcement, not via boat). The player can click "+" multiple times to keep pouring in troops, each click committing another 20%
- This gives the attacker an active way to keep the beachhead alive — if the defender is pushing hard, the attacker can pump more troops in to survive the 5 seconds, at the cost of weakening the homeland
- Once the beachhead is stabilized (after 5 seconds), it becomes regular territory and the player can launch normal vector attacks from it to push deeper inland
- If the beachhead is isolated across water with no land connection, reinforcement via "+" is not possible — the player must send another boat (after the first completes) to bring more troops

**Stabilization timer (5 seconds):**
- When troops land, a **5-second countdown timer** starts at the landing point, visible on the map to both attacker and defender (e.g., a pulsating circle with a countdown number)
- During these 5 seconds, the **defender gets an attack bonus** against the beachhead — troops defending against the amphibious landing fight harder, making it cheaper for the defender to push back the invader
- After 5 seconds, the beachhead is "stabilized" — the attack bonus disappears and normal land warfare rules apply. The pulsating circle stops
- This creates a high-stakes 5-second window: the defender is racing to wipe out the landing before it stabilizes, the attacker is trying to survive and hold ground until the timer runs out

**Defender's counterplay:**
- Counter-attack beachhead tiles with an attack bonus during the timer — the defender is always favored at the water's edge
- Defense posts near the landing zone stack with the amphibious penalty, making defended coastlines brutally hard to assault
- If the defender wipes out all beachhead tiles before the timer expires, the landing fails and the attacker loses all committed troops

**Amphibious assault sequence:**
```
1. Launch boat (20% troops) → boat sails to target
2. Troops land → radial expansion in all directions → 5s stabilization timer starts
3. "+" button appears on beachhead — click to reinforce with another 20% from homeland
4. Defender has 5s to wipe out the beachhead (attack bonus active)
5. Attacker spams "+" as needed to keep beachhead alive (each click = 20% more troops from homeland)
6. Timer expires → beachhead stabilized → normal territory
7. Player can now vector attack from beachhead to push inland
8. If isolated across water, send another boat to bring more troops
```

**Interaction with other systems:**
- **Defense posts** on coastlines stack with the amphibious penalty — defended shores are extremely hard to assault
- **River gates** block boats entirely — attacker must break gates via ground assault before they can even attempt a river landing deeper inland
- **Missiles** can soften coastal defenses before a landing — destroy defense posts, then send the boat
- **City snipes**: Landing directly on an enemy city tile can take the city quickly, but if the landing fails, those troops are gone. High risk, high reward

### Boat Limit
- **Rule**: Each player can have a maximum of one outgoing boat at a time. A new boat cannot be launched until the current one has landed or been destroyed
- **Why**: Prevents boat spam. Without this limit, players could cheaply harass enemy coastlines with constant small landings, bypassing the beachhead penalty through volume. One boat at a time forces each landing to be a deliberate, committed operation
- **City snipes remain viable**: Even with one boat, a well-timed landing directly on an enemy river/coast city is devastating. Cities on premium terrain (river, coast) are more powerful but inherently more exposed to naval assault. This is the core risk-reward of city placement — the best city sites are the most vulnerable to boats
- **Interaction with river gates**: A defender's river gates block the boat entirely, so the attacker's one boat can't even reach inland cities without first breaking gates through ground assault. This further rewards river defense investment
- **Design intent**: Each boat launch is a strategic decision, not spam. Players must choose their landing target carefully because they only get one shot at a time. Failed landings (beachhead wiped out, boat destroyed) waste time and troops with no fallback boat in the water

---

## Attack Mechanics

### Unified Troop Commitment (fixed 20%)
- All attacks commit a fixed **20%** of available troops. There is no toggle, slider, or choice — every attack sends 20%
- If the player wants more force, they simply **send more attacks**. Two clicks = 40%, three = 60%, etc. This is intuitive and requires no HUD element
- The attack slider is **removed** from the bottom HUD entirely
- Applies to all attack types: general attacks, vector attacks, and amphibious landings
- **Design intent**: Simplifies the UI by removing a control that most players either ignored or set-and-forgot. The meaningful decision is no longer "how much to commit" but "how many times to commit" — which is a more natural expression of intent

### General Attack (click-based, existing)
- **How it works**: Player clicks on wilderness or enemy territory. 20% of troops are committed, spreading across all bordering fronts with that target
- **Stacking**: Click again to commit another 20%. Multiple clicks = stronger push
- **Use case**: Expanding into wilderness, broad-front pressure against an enemy, casual aggression where you don't need surgical precision

### Vector Attack (drag-based, new)
- **How to initiate**: Player drags from a point in their own territory toward enemy territory, creating a directional attack vector
- **Troop commitment**: 20% per vector attack. Player can launch additional vector attacks for more force
- **Visual**: A **pulsating circle with a troop count number** appears at the origin point of the attack, plus an arrow showing the attack direction. This uses the same visual language as amphibious landings — pulsating circle = active attack, number = troops remaining. The circle and count stay visible for the duration of the attack and are visible to **all players on the map** (allies, enemies, spectators). As troops are spent taking tiles, the number counts down. When it reaches zero, the attack is over and the visual disappears
- **Troop behavior**: The committed troops flow along the vector direction, concentrating force on that section of the border rather than spreading across all fronts. This is a focused push, not a broad assault
- **Duration**: The attack continues along the vector until the committed troops are **exhausted** (all spent on taking tiles / fighting). There is no timer — the attack naturally ends when the troops run out
- **During a vector attack**: The player's remaining troops (the 80% not committed) continue to function normally for defense and any general attacks. The player is not locked out of other actions
- **Multiple vectors**: TBD — could allow one vector attack at a time (like boats) or multiple simultaneous vectors for pincer moves. One at a time is simpler and prevents micro-spam

### Attack Visuals (unified across all attack types)
- **Pulsating circle + troop count**: Every active attack (general, vector, amphibious) shows a pulsating circle at the attack point with a number showing remaining committed troops. This is the universal visual indicator for "attack in progress"
- **Vector attacks** add a directional arrow from the origin point showing the push direction
- **Amphibious landings** show the pulsating circle at the landing point with a 5-second countdown overlay during stabilization, then switch to the standard troop count after stabilizing
- **Visible to all players**: Every attack visual is public. All players can read the map and see where attacks are happening, how many troops are committed, and in what direction. This enables diplomacy, coordination, and strategic reads
- **Troop count decreases in real-time**: As troops are spent fighting, the number counts down. Players (and observers) can watch an attack running out of steam or see a reinforcement vector adding troops

### Vector Attack Visibility & Diplomacy
- The attack vector is visible to **everyone** on the map from the moment it's created
- Other players can see: the origin point, the direction, and the exact troop count committed
- This creates rich diplomatic situations:
  - **"They're massing on your border"** — players can warn allies about incoming vector attacks
  - **Feints**: Launch a 20% vector attack in one direction to draw the defender's attention, then launch a boat landing or general attack elsewhere
  - **Deterrence**: The mere sight of a vector attack forming on your border forces you to respond — pull troops from other fronts, build defense posts, or negotiate
  - **Coordination**: Allied players can launch vector attacks at the same enemy from different directions simultaneously

### Defensive Reinforcement ("+" button)
- **What it is**: When a section of a player's border is under attack (vector attack, general attack, or amphibious landing), a **"+" button** appears on the threatened area. Clicking it sends 20% of troops from the homeland to reinforce that specific border section
- **How it works**: The reinforcement troops concentrate at the threatened point rather than spreading across all borders. This lets the defender match the attacker's focused force with focused defense
- **Stacking**: Click "+" multiple times to pour more troops in. Each click = 20% from homeland reserves. Visible troop count on the reinforcement point shows how many are committed to defense there
- **Visual**: Same pulsating circle + troop count as attacks, but in the player's own territory color (or a distinct shield icon). Visible to all players — everyone can see where reinforcements are being sent
- **When it appears**: The "+" appears whenever the player's border is being actively pushed — whether by a vector attack, general attack, or beachhead landing. It gives the defender an active response rather than passively watching tiles flip
- **Asymmetry with attacks**:
  - **Attacking** = vector (directional push) or general click (broad spread)
  - **Defending** = "+" reinforcement (pour troops into a specific threatened point)
  - The defender can also choose to counter with their own vector attack as an offensive response, but "+" is the pure defensive option
- **Strategic tradeoff**: Every "+" click weakens other borders. A smart attacker can feint with a small vector on one front to draw "+" reinforcements, then hit the weakened front with the real attack
- **Beachhead defense**: When an enemy lands on your shore, "+" appears on the beachhead area. The defender clicks "+" to pour troops into pushing the landing back during the 5-second window. This mirrors the attacker's "+" reinforcement of their own beachhead — both sides are frantically clicking "+" trying to win the 5-second race

### The "+" Pattern (unified reinforcement mechanic)
```
ATTACKER'S "+":   Reinforce own beachhead during 5s stabilization → pour troops to survive
DEFENDER'S "+":   Reinforce threatened border section → pour troops to push back attacks

Both work identically:
- Click "+" on a hotspot → 20% troops from homeland sent to that point
- Click again for more → each click = another 20%
- Visible troop count shows commitment
- Weakens other fronts as troops are pulled to the reinforcement point
```

### How Attacks Interact with Other Systems

| System | Interaction |
|--------|-------------|
| Defense posts | Defense posts along the vector path slow the attack — the concentrated troops must fight through them. Siege towers can neutralize defense posts in the vector's path |
| Siege towers | Place a siege tower first, then launch a vector attack through the neutralized section — a planned breach |
| Amphibious landings | Once beachhead stabilizes, vector attack inland from the landing point to push deeper |
| Missiles | Soften a section of the enemy border with a missile strike, then follow up with a vector attack through the gap |
| River gates | Vector attacks on land don't cross rivers — you need boats for that. But a vector attack can target a river gate from the land side to break it open |
| General attacks | Both can run simultaneously. A player might launch a vector attack on one front while running a general attack on another to create pressure across multiple fronts |
| Defensive "+" | Defender reinforces a specific threatened point. Attacker can feint on one front to draw "+" reinforcements, then hit elsewhere |

### Attack Summary
```
FIXED RATE:       Every action commits 20% of troops. Want more force? Stack more actions.

ATTACKING:
  General attack    Click enemy/wilderness → 20% troops spread across all fronts → click again for more
  Vector attack     Drag from territory toward enemy → 20% troops concentrate along direction → visible to all → runs until troops exhausted
  Amphibious        Launch boat (20% troops) → land on shore → 5s stabilization → "+" to reinforce beachhead

DEFENDING:
  "+" reinforce     Click "+" on threatened border → 20% troops sent to that point → click again for more

All actions visible to all players. Troop counts shown in real-time.
```
No slider, no toggle. One fixed rate, symmetric "+" reinforcement for both attacker (beachhead) and defender (border). Players read the map and react.

### Annexation (Territory Encirclement)
- **Full encirclement**: If a player completely surrounds a chunk of enemy territory (the enemy tiles have no connection to the rest of their empire), the surrounded territory is **annexed** — it instantly converts to the encircling player's territory. All buildings in the annexed area are captured or destroyed
- **Territory cutting**: If an attack cuts an enemy's territory into disconnected chunks, any chunk that is cut off from the enemy's main body (largest connected region) is annexed by the attacker
- **River/ocean lifeline exception**: A territory chunk that touches a river or ocean **cannot be annexed** — the water connection acts as a lifeline, representing the ability to resupply by sea/river. The attacker must conquer these tiles the normal way (tile by tile)
- **This means**: Coastal and river territories are inherently harder to annex. An inland empire can be sliced and diced by cutting through narrow land bridges, but a coastal empire's territory always has a water lifeline
- **Strategic implications**:
  - **Cutting attacks are powerful**: A well-placed vector attack that slices through an enemy's territory can annex large chunks instantly — much faster than conquering tile by tile
  - **Defend your connections**: Players must be aware of narrow land bridges in their territory that could be cut. Defense posts and fortified borders along chokepoints prevent annexation
  - **Coastal advantage**: Another reason coastal territory is premium — it can't be annexed by encirclement because it always touches water
  - **River advantage**: Cities on rivers are harder to annex — the river connection prevents encirclement. This further rewards river city placement
  - **Offensive play**: Vector attacks aimed at cutting enemy territory in half are devastating. Even if the attack doesn't take much land, severing the connection annexes everything on the other side (unless it has water access)

---

### Missile Silo
- **Purpose**: Late-game gold sink. Allows rich players to launch missiles for targeted area damage
- **Placement**: Any owned land tile
- **Mechanics**: The silo itself is a one-time gold investment. Once built, the player can spend gold to launch missiles from it. Each missile costs a large amount of gold per launch
- **Cost**: Very expensive to build. Each missile launch costs additional gold on top (e.g., silo = 500g, each missile = 200g)
- **Design intent**: Gives gold-heavy players (especially coastal empires with port + trade route income) a way to convert surplus gold into military impact. The extreme cost means missiles are a late-game mechanic — early/mid game players can't afford to waste gold on them when they still need farms, mills, and cities. Even late game, each launch is a significant spend, keeping missiles marginal rather than dominant

### Missile
- **Launched from**: A missile silo owned by the player
- **Target**: Player clicks any visible tile on the map to target
- **Effect**: Deals damage in a small radius around the impact point. Kills troops in the area and can destroy enemy buildings caught in the blast
- **Travel time**: Missiles are not instant — they take time to travel from silo to target, giving the defender a window to react (and a reason to have SAMs)
- **Cost per launch**: Very expensive (e.g., 200g per missile). A player would need substantial ongoing gold income to launch more than a few per game
- **Design intent**: Surgical strikes, not carpet bombing. A well-placed missile on an enemy's mill cluster or trade hub can cripple their economy, but the cost means you can't spam them. Each launch is a strategic decision

### SAM Site (Surface-to-Air Missile)
- **Purpose**: Defensive counter to missiles. Intercepts incoming missiles within its radius
- **Placement**: Any owned land tile
- **Mechanics**: Automatically intercepts incoming missiles that pass through or target within its defense radius. Each interception consumes the SAM (or a charge — TBD). Player must spend gold to reload/rebuild
- **Intercept radius**: Moderate — large enough to cover a city and its surrounding infrastructure, but not so large that one SAM protects everything
- **Cost**: Very expensive (comparable to a silo). Reloading/replacing interceptors also costs gold
- **Design intent**: Creates an arms race gold sink. Attacker spends gold on missiles, defender spends gold on SAMs. Neither side can ignore the other — undefended cities are vulnerable to strikes, but over-investing in SAMs means less gold for economy. The gold drain from this arms race ensures surplus gold is always consumed in late game

### Late-Game Arms Race Summary
```
ATTACKER:  Surplus gold → Missile Silo (one-time) → Missiles (per-launch cost) → Area damage
DEFENDER:  Surplus gold → SAM Site (one-time) → Interceptors (per-intercept cost) → Missile defense
```
- Both sides burn gold continuously — the attacker launching missiles, the defender intercepting them
- This ensures gold never becomes meaningless, even with a fully built-out economy
- The extreme costs mean this arms race only kicks in late game when infrastructure is established and gold is flowing
- A player who neglects SAMs is vulnerable to having key infrastructure (mills, trade hubs, cities) destroyed by surgical strikes
- A player who neglects silos has no way to break entrenched defensive positions from range
- Key difference from OpenFront: missiles in this game are so expensive they're a strategic tool, not a spammable weapon. Each launch matters

### Fishery
- **Purpose**: Coastal pop source — gives coastal players a way to grow city population without inland farmland
- **Placement**: Must be placed on an owned land tile adjacent to water (same placement rule as ports). Fisheries and ports can be placed on adjacent tiles — they don't compete for the same slot
- **Connection rule**: Connected to a city if within that city's radius
- **Pop contribution**: Based on how many **fish patch** tiles are within the fishery's radius. Fish patches are a map resource — special water tiles distributed along coastlines during map generation. More fish patches in radius = more pop, but still less than a river farm + mill combo
- **Suggested yield**: +0.5 pop per fish patch tile in radius. A fishery near a dense cluster might yield 3-4 pop, while one on barren coast yields almost nothing
- **Cost**: Cheap (similar to farms)
- **Does NOT connect to mills**: Fisheries are standalone. Mills only amplify farms. This keeps the inland farm+mill combo as the superior pop engine
- **Design intent**: Fisheries exist so coastal players aren't stuck with zero pop growth. Fish patches as a map resource mean not all coastline is equal — players must scout for fish-rich shores. Weaker than the farm+mill combo but available where farmland isn't

### Fish Patches (map resource)
- **What they are**: Special water tiles placed during map generation, rendered with a subtle visual indicator (e.g., slightly different water color, small fish icon)
- **Distribution**: Scattered along coastlines in clusters of varying density. Some coastal regions are fish-rich, others have none. River mouths / deltas could have denser fish patches as a natural hotspot
- **Visibility**: Always visible to all players. Part of the map's strategic geography, like rivers and mountains
- **Design intent**: Adds map-reading to coastal strategy — not all shoreline is worth building fisheries on. Fish-rich coasts become contested territory just like river valleys are for inland players

### Mine
- **Purpose**: Extracts gold from ruby deposits. The inland player's primary gold source
- **Placement**: Must be placed on or adjacent to a ruby deposit
- **Gold contribution (base)**: Generates gold passively based on how many ruby tiles are within the mine's radius. This is standalone income — no port connection required. Gives inland players a way to fund their economy without coast access
- **Gold contribution (trade bonus)**: If the mine is connected to a transport hub, which is in turn connected to a port via contiguous territory, the mine's gold output is significantly boosted (e.g., 2-3× multiplier). The trade route makes rubies far more valuable but isn't required for baseline income
- **Cost**: Moderate
- **Design intent**: Mines are to inland players what ports are to coastal players — a baseline gold source. But mines on their own produce less gold than a well-placed port. The trade route multiplier closes that gap and can even exceed port income for deep-inland ruby clusters, but at the cost of maintaining a vulnerable supply chain

### Transport Hub
- **Purpose**: Links mines to ports, boosting mine gold output through trade. The middleman building that makes trade routes work
- **Placement**: Any owned land tile. Should be placed between mines and ports to bridge the connection
- **Connection rule**: A transport hub connects a mine to a port if all three (mine, hub, port) are within the same player's contiguous territory. The hub must be within radius of the mine it's boosting
- **Gold contribution**: Does not generate gold itself. Instead, it enables the trade route multiplier on connected mines. Each mine connected to a hub that reaches a port gets the trade bonus
- **Cost**: Moderate — infrastructure investment that pays off through boosted mine income
- **Vulnerability**: If an enemy cuts your territory between the hub and the port (breaking the contiguous land connection), the trade bonus dies and mines revert to base income. The mine itself still generates baseline gold — only the bonus is lost
- **Design intent**: Creates supply chains that span the map. The hub is the infrastructure piece that rewards players for controlling territory between their inland mines and coastal ports. Defending trade routes becomes a strategic concern — and cutting enemy trade routes is a valid military tactic

### Ruby Deposits (map resource)
- **What they are**: Rare strategic resource tiles on land, placed during map generation. Rendered with a distinct visual (e.g., red/pink sparkle on the tile)
- **Distribution**: Concentrated inland — mountains, highlands, and deep interior. Rarely near coast. The further from the coast, the more likely rubies appear. This ensures inland territory has unique economic value
- **Visibility**: Always visible to all players. Players can see ruby deposits from the start and plan expansion accordingly
- **Design intent**: Rubies are the inland gold resource. Mines extract baseline gold from them. Trade routes through transport hubs to ports multiply that gold. This creates a two-tier income system: safe but modest (mine alone) vs. lucrative but vulnerable (mine + trade route)

### Trade Route Summary
```
BASELINE:     Ruby Deposit → Mine → Base gold (safe, modest)
TRADE ROUTE:  Ruby Deposit → Mine → Transport Hub → Contiguous territory → Port → Boosted gold (lucrative, vulnerable)
```
- Mines always generate base gold from rubies regardless of trade connections
- Trade route multiplier (2-3×) activates only when mine → hub → port chain is intact through owned territory
- If the territorial connection is severed, mines revert to base income — the trade bonus stops instantly but baseline gold continues
- Multiple mines can connect through one hub, and multiple hubs can feed one port
- Cutting an enemy's trade route is a strategic military objective — it doesn't kill their economy but significantly weakens it

---

## Terrain Gradation

The current terrain system uses 3 discrete types (grassland, highland, mountain). The new economy requires finer granularity so that terrain quality directly affects building yields. Each terrain band should have an internal gradation (e.g., 10 levels) that determines how productive it is.

### Grassland gradation (10 levels)
- Level 1 (pale green): Marginal farmland — low yield per tile
- Level 5 (medium green): Average farmland — moderate yield
- Level 10 (deep lush green): Premium farmland — highest yield per tile
- **Farmable**: Yes — this is the ONLY terrain type where farms are productive
- **Ruby deposits**: Never spawn on grassland. This terrain is purely for pop via farming
- **How it affects farms**: Each grassland tile in a farm's radius contributes pop proportional to its level. A farm surrounded by L10 grassland produces dramatically more pop than one surrounded by L3 grassland
- **Visual**: Smooth green gradient on the map. Players can visually read which areas are the most fertile at a glance — darker green = better farming
- **Distribution**: Richest grassland concentrated in river valleys and lowlands. Gradually fades toward highlands

### Highland gradation (10 levels)
- Level 1 (light tan): Low hills — transition zone, borders grassland. Sparse ruby deposits possible
- Level 5 (medium brown): Rugged terrain — moderate ruby deposit density
- Level 10 (dark brown): Deep highlands — high ruby density, approaching mountain value
- **Farmable**: No — farms placed here produce nothing. Highlands are not arable land
- **Ruby deposits**: Yes — ruby spawn chance scales with highland level. Low highlands have sparse rubies, high highlands are fairly rich
- **Role**: Transition zone between farmable grassland and mineral-rich mountains. Not as productive as either extreme but gives players access to rubies without having to push into expensive mountain terrain
- **Visual**: Tan-to-brown gradient

### Mountain (impassable)
- **Not a terrain gradation** — mountains are impassable barriers, like water. No player can expand into, build on, or move through mountain tiles
- **Farmable**: No
- **Ruby deposits**: No — can't build mines on impassable terrain
- **Role**: Natural walls and boundaries. Creates chokepoints, protected flanks, and defensible positions. A player behind a mountain range only needs to defend narrow passes. Mountain ranges shape the map's strategic geography the same way oceans do — they define where conflict can and can't happen
- **Visual**: White/snow-capped tiles (unchanged from current rendering)
- **Design implication**: Since mountains are impassable, all ruby deposits are in highland terrain only. This concentrates mining in the accessible midland zone rather than deep unreachable peaks

### Ruby deposit spawn rules
| Terrain | Ruby spawn chance |
|---------|------------------|
| Water / Coast | Never |
| River tiles | Never |
| Grassland (any level) | Never |
| Mountain | Never (impassable) |
| Highland L1-3 | Low (~10-20%) |
| Highland L4-7 | Moderate (~30-50%) |
| Highland L8-10 | High (~60-80%) |

This distribution ensures:
- Grassland is purely for farming — no rubies distract from its role
- Highlands are the sole mining terrain — all rubies are here, making midland territory the key contested zone for gold income
- Mountains are impassable walls — they shape the map but contain no resources
- Players who only hold grassland and coast have zero ruby income — they must push into highland terrain or trade with players who control it

### Implementation note
The map binary already encodes a `mag` value (0-31) per land tile that gets bucketed into 3 types. Instead of bucketing, the raw `mag` value (or a derived 1-10 scale) should be preserved and used directly for yield calculations and color rendering. Ruby deposit placement during map generation should use the terrain level to determine spawn probability.

## Terrain Interactions

| Terrain | Effect on Cities | Effect on Farms | Effect on Mines | Effect on Fisheries | Effect on Ports |
|---------|-----------------|-----------------|-----------------|---------------------|-----------------|
| Grassland (land) | — | Each tile in radius = +pop (scales with level) | No rubies here | — | — |
| Highland (land) | — | Not farmable | Ruby deposits spawn here (scales with level) | — | — |
| Mountain | Impassable — no buildings, no expansion, no movement. Natural walls and chokepoints | | | | |
| River tile | +50% pop multiplier | Multiplier on yield (1.5-2×) | No rubies | — | — |
| Coast (adjacent to water) | +50% pop multiplier | — | — | Placement allowed | Generates gold based on nearby water tiles |
| River + Coast intersection | +100% pop (both stack) | River multiplier applies | — | Placement allowed; river mouths may have dense fish patches | Generates gold |
| Fish patches (water tiles) | — | — | — | Each patch in radius = +pop yield | — |

### Map resources summary

| Resource | Where | Exploited by | Yield |
|----------|-------|-------------|-------|
| Grassland | Land tiles — plains, river valleys, lowlands | Farms | +pop per grassland tile in farm radius |
| Fish patches | Water tiles — scattered along coastlines, dense near river mouths | Fisheries | +pop per fish patch in fishery radius |
| Ruby deposits | Land tiles — mountains, highlands, deep interior (rarely near coast) | Mines | +gold per ruby tile in mine radius (base). 2-3× with trade route via transport hub → port |

All three work similarly: place a building near the resource → radius captures resource tiles → yield scales with count. Farms/fisheries yield pop, transport hubs yield gold (via port connection).

### Strategic asymmetry this creates

- **Coastal players**: Rich in base gold (ports) with some pop from fisheries near fish patches. Can build fast but cities stay smaller. Strength is economic tempo and naval control. Want to push inland to access rubies for even more gold
- **Inland/river players**: Grassland-rich river farms + mills produce massive pop. Sitting on ruby deposits but need coastal access to monetize them. Strength is troop density. Want to push coastward for ports
- **Mixed (river-coast) players**: Best of both worlds but these tiles are rare and heavily contested
- **Trade routes**: The ruby → transport hub → port chain creates cross-map supply lines that are high reward but vulnerable to being cut. Defending trade routes becomes a key strategic concern
- **Key tension**: Both sides need what the other has. Coastal players want inland rubies, inland players want coastal ports. The map's middle ground is where empires collide

---

## Example Scenarios

### Coastal city (river-coast tile, 4 standard farms, 1 mill)
- City base pop: 5
- 4 farms × 2 pop each: +8 pop
- Mill with 4 connected farms: 3 × sqrt(4) = +6 pop
- Subtotal: 19 pop
- River bonus (+50%) + Coast bonus (+50%) = 2.0× multiplier
- **Final pop: 38 → 760 troops**

### Inland river city (river tile, 4 river farms, 1 mill)
- City base pop: 5
- 4 river farms × 2 pop × 2× river bonus each: +16 pop
- Mill with 4 connected farms: 3 × sqrt(4) = +6 pop
- Subtotal: 27 pop
- River city bonus: 1.5× multiplier
- **Final pop: 40.5 → 810 troops**

### Inland city (no river, 4 standard farms, no mill)
- City base pop: 5
- 4 farms × 2 pop each: +8 pop
- No mill, no terrain bonus (1.0×)
- **Final pop: 13 → 260 troops**

### Pure coastal city (coast tile, 4 fisheries, no farms, no mill)
- City base pop: 5
- 4 fisheries × ~1.5 pop each: +6 pop
- Subtotal: 11 pop
- Coast city bonus: 1.5× multiplier
- **Final pop: 16.5 → 330 troops**
- But this player also has ports generating gold, so they can build more cities/buildings faster

### Key takeaway
Pop ranking per city: inland river (810) > coastal mixed (760) > pure coastal (330) > pure inland (260). But gold ranking is reversed: coastal players build faster. The system rewards players who control diverse terrain — a player with both river valleys and coastline has the strongest overall economy.

---

## Balance Considerations

### Gold income pacing
- Ports should generate enough gold that a player with 1-2 ports can slowly build farms, but 3-4 ports enables a much faster build rate
- Gold income should scale sub-linearly with port count to prevent runaway economies from pure coastal control

### Inland viability
- Inland river players are now competitive through superior farm yields — river farms produce 2× pop, which compounds with mills and river city bonuses
- Pure inland players (no river access) still need a minimum gold source — options:
  - Passive gold trickle from territory size (small, enough to slowly build farms)
  - Markets: an alternative gold building for inland players that generates less gold than ports
  - Map design guarantees every spawn has access to either coast or river

### Snowball prevention
- City pop has diminishing returns on troop capacity at very high values
- Or: troop upkeep that scales with army size, funded by gold, creating a natural ceiling
- Mill diminishing returns (sqrt formula) already prevents infinite scaling from farm spam

### Building density
- Cities enforce a minimum exclusion radius — no two cities (yours or enemy's) can be placed within X tiles of each other
- This exclusion radius should be larger than the city's farm/mill connection radius, so each city has a dedicated economic zone that doesn't overlap with other cities
- Suggested: exclusion radius ~1.5-2× the city connection radius
- Mills should have a moderate radius so one mill can't serve two distant cities — forces commitment to a region

---

## Migration from Current System

### What stays
- Defense posts (same mechanics, same cost structure)
- City placement on map (but pop mechanics change entirely)
- Build button HUD and placement flow

### What changes
- Farms: currently generate flat gold → now generate pop for connected cities
- Mills: currently boost farm gold → now generate bonus pop based on connected farms
- Mines and factories: removed or repurposed (gold now comes from ports only)
- Cities: currently just increase max troops by flat amount → now accumulate pop from farms/mills with terrain multipliers
- Gold income: currently from land ownership + farms/mines → now exclusively from ports

### New additions
- Port building type
- River/coast terrain bonus detection for cities
- Pop tracking per city
- Connection visualization (farm→city, farm→mill→city lines on hover)

---

## Open Questions

1. **What radius values?** City radius, mill radius, port gold-detection radius — these determine how spread out vs. clustered the economy feels
2. **Can one farm connect to multiple cities?** If yes, farms between two cities are extra valuable. If no, players must choose which city a farm serves
3. **Can one mill connect to multiple cities?** Same question — allowing it makes central mills powerful but harder to balance
4. **Port gold formula**: Linear with water tiles? Sqrt? Needs playtesting to find the right curve
5. **Do enemy buildings in radius matter?** E.g., does an enemy farm in your mill's radius count? Probably not — only same-owner connections
6. **Mountain terrain**: Should mountains block farm placement entirely, or just reduce yield?
