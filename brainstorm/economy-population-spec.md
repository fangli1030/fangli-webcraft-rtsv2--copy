# Economy System Spec: Population & Port-Based Gold

## Design Philosophy

This game differentiates from OpenFront through a deeper economy that rewards strategic planning, alliance-building, and diplomacy. The pace of warfare is deliberately slower — players invest in infrastructure, negotiate trade access, and build up before committing to conflict. But warfare must never stall completely. Every mechanic is designed with two goals: make economy meaningful AND ensure there's always a reason to fight.

**Core principles:**
- Economy is complex enough that building tall is viable and interesting — but never so safe that turtling is optimal
- Diplomacy and alliances matter because players need terrain they don't start with (coastal players need inland rubies, inland players need coastal ports)
- Border clashes and conquest stay active because:
  - Territory contains resources (grassland, rubies) that are worth taking
  - Missiles give attackers a tool to break through defensive lines and destroy infrastructure
  - Missiles punish players who over-invest in static defense and neglect adaptation
  - City exclusion zones mean the best city sites are finite and worth fighting over
  - Destroying enemy infrastructure (farms, ports, silos) via conquest or missiles has massive economic impact — wars have real stakes

**Anti-stalemate mechanics:**
- Missiles bypass ground defenses entirely, punishing passivity and breaking stalemates
- Resource scarcity (limited river-coast tiles, limited ruby deposits) ensures players compete over the same terrain rather than building in isolation
- Each escalation step (defense post upgrades) costs more gold — eventually one side can't keep up and the front breaks

**Compared to OpenFront:**
- Slower early game — players build infrastructure before fighting
- More meaningful mid game — border militarization and diplomacy create dynamic tension
- More dramatic late game — missile strikes and economic warfare create decisive moments
- Alliances matter — inland and coastal players naturally complement each other and benefit from cooperation

## Overview

A spatial economy where geographic decisions drive everything. Ports generate gold from coastline exposure. Gold funds buildings. Buildings generate population for cities. Population increases troop capacity. River and coast bonuses on cities create natural conflict over key terrain.

---

## Win Condition

- **Victory**: First player to control **80% of all land tiles** on the map wins
- Gives a clear, visible target — players can track territory percentages on the leaderboard
- Prevents infinite stalemates — even if two players are evenly matched, one will eventually cross 80%
- The 80% threshold means you don't need to hunt down the last few tiles of a cornered player — once you're dominant, the game ends

---

## Diplomacy

### Alliances
- **How to create**: Right-click on a player's territory → click "Alliance" button → sends an alliance request to that player
- **Acceptance**: The target player sees the request in their **diplomacy log** (bottom-right HUD) and can accept or decline
- **Duration**: Alliances expire after a set time (e.g., 3-5 minutes). They are not permanent
- **Expiration warning**: The diplomacy log notifies the player when an alliance is about to expire (e.g., 30 seconds before). The player must actively renew it by sending a new request — alliances don't auto-renew
- **Effect**: Allied players cannot attack each other's territory. Troops on shared borders are passive. This frees up troops from those borders for use elsewhere
- **Visible to all**: Active alliances are shown on the map (e.g., a colored link between allied players, or a shared border indicator). All players can see who is allied with whom — this is public information that shapes diplomacy
- **Hover to inspect**: Hovering over a player's name (on the leaderboard or map label) shows a tooltip listing all of that player's current alliances and time remaining on each. Quick way to read the diplomatic landscape without opening any menus
- **Breaking an alliance early**: TBD — could be allowed with a penalty (e.g., a temporary overextension-like debuff) or alliances could be unbreakable until expiration. Early breaking with a penalty is more interesting — it creates trust dynamics

### Diplomacy Log (bottom-right HUD)
- **Purpose**: A small panel that shows alliance-related notifications
- **Shows**:
  - Pending alliance requests (accept/decline buttons)
  - Active alliances with time remaining
  - Expiration warnings ("Alliance with [Player] expires in 30s")
  - Alliance broken notifications
- **Compact**: Should not take up much screen space — just a scrollable list of short notifications
- **Design intent**: Keeps diplomacy visible and manageable without a complex diplomacy screen. Players can glance at it to see their alliance status and respond to requests without leaving the map view

---

## Bots & AI Nations

The map is populated with two types of non-player entities that create a dynamic early game and ongoing mid/late-game challenge.

### Bots (neutral/gray nations)
- **Appearance**: Gray-colored territory scattered across the map, numerous small pockets
- **Behavior**: Passive — they do not expand, attack, or build infrastructure. They simply hold territory
- **Purpose**: Early-game fodder. Players expand by conquering bots in the opening minutes, claiming land and resources without fighting other players. This creates a land-grab phase where players race to secure the best terrain (grassland, ruby deposits, coastline) before borders meet
- **Troop count**: Very low — easy to take with minimal troop investment
- **Buildings**: None — bot territory is undeveloped land. Players must build their own infrastructure after conquering it
- **Distribution**: Numerous and spread across the entire map, filling gaps between player and AI nation starting positions. Ensures there's always nearby territory to expand into at game start
- **Design intent**: Prevents players from immediately fighting each other. The first 1-2 minutes are about expansion and scouting — reading the terrain, identifying valuable grassland/ruby/coastal zones, and racing to claim them

### AI Nations (full NPC players)
- **Appearance**: Colored territory like human players, with nation names
- **Behavior**: Active — they expand into bot territory, build infrastructure (cities, farms, ports, mines, defense posts), form alliances, and wage war against players and other AI nations
- **Purpose**: Mid/late-game challenge. AI nations develop economies, defend their borders, and compete for territory like human players. They prevent the map from becoming empty once bots are consumed
- **Infrastructure**: AI nations build the full range of buildings — cities on rivers/coasts, farms on grassland, ports on coastline, mines on rubies. They follow the same economic rules as human players
- **Diplomacy**: AI nations can accept/propose alliances. They make strategic decisions about who to ally with and who to attack based on territory, relative strength, and proximity
- **Difficulty scaling**: AI nations should be noticeably harder to conquer than bots — they have real troop counts, defense posts on borders, and infrastructure generating pop and gold. Taking an AI nation's territory is a mid-game military campaign, not an early-game land grab
- **Design intent**: Ensures the map stays competitive even with few human players. AI nations fill the strategic role of rival empires — they control valuable terrain, build infrastructure worth capturing, and create multi-front pressure that prevents any single player from expanding freely

### Game Flow with Bots & AI Nations
```
EARLY GAME (0-2 min):    Players expand into gray bot territory, claiming land and resources
                         AI nations also expand into bots — race for the best terrain
MID GAME (2-5 min):      Bot territory is mostly consumed. Player and AI nation borders meet
                         First conflicts begin. Infrastructure building ramps up
LATE GAME (5+ min):      Full-scale warfare between developed players and AI nations
                         Alliances, vector attacks, missiles
```

---

## Core Mechanics

### Starting Conditions
- **No city, no gold**: Every player starts with nothing — just a spawn point on the map
- **Player chooses spawn location**: Before the game starts, the player picks where to spawn (similar to OpenFront). This is the first strategic decision — choosing a river valley, coastal area, or highland position sets the tone for the entire game
- **Early game flow**: Players immediately expand into nearby gray bot territory. Conquering bots yields their gold (similar to OpenFront), giving the player their first gold income to fund L1 buildings
- **First city**: Players must earn enough gold from bot conquest and passive territory income to place their first city. This creates urgency to expand quickly in the opening minutes

### Troop Generation
- **Troop capacity**: Determined by territory size (passive) + city pop (from farms). More pop = higher troop cap
- **Troop regeneration**: Troops regenerate automatically over time up to the troop capacity (same logic as OpenFront). The rate of regeneration scales with how far below capacity the player is — the more depleted, the faster troops regenerate (up to a point)
- **No manual troop production**: Players don't build barracks or recruit troops. Troops just fill up based on capacity. The player's job is to increase capacity through pop infrastructure

### Combat Math
- **Tile cost**: Each tile costs troops to conquer. The base cost depends on terrain type:
  - **Grassland**: Cheapest to take — open, flat terrain
  - **Highland**: More expensive — rugged terrain, harder to fight through
  - **Bot territory**: Very cheap — bots have minimal resistance
  - **Enemy territory**: Base terrain cost + additional cost scaling with the defender's troop count. A defender at full troop capacity is much harder to push than one at 10% capacity
- **Defense post modifier**: Tiles within a defense post's radius cost significantly more to take
- **Beachhead modifier**: During the 5-second stabilization window, the defender gets an attack bonus making beachhead tiles cheaper to retake
- **Overextension modifier**: The attacker's tile cost increases with their total territory size relative to developed infrastructure
- **Formulas**: Specific values to be derived from OpenFront's existing combat math and tuned through playtesting

### Building Placement Rules
- **Where**: Any tile within the player's own territory (with building-specific restrictions — ports need coast, mines need rubies, etc.)
- **When**: Anytime, including during active combat. No restriction on building while fighting
- **Build time**: Most economic buildings (farms, ports, mines, cities) are placed instantly
- **Military building delay**: Defense posts take time to build after placement (e.g., 5-10 seconds). The building appears as "under construction" and provides no benefit until complete. This prevents reactive instant-fortification during active combat — you can't drop a defense post the moment an enemy vector attack hits your border
- **Build cooldown**: No global cooldown — players can place multiple buildings in quick succession as long as they have gold
- **Building queuing**: Not needed — players place buildings one at a time by clicking

### Map Generation
- **Balanced resource distribution**: The map generator should ensure a roughly balanced distribution of terrain types and resources across the map. No region should have zero access to grassland, highland, or coastline within a reasonable expansion distance
- **Spawn point selection**: Players choose their spawn location on the map before the game starts. The map should provide enough viable spawn locations that early spawners don't monopolize all premium terrain
- **River placement**: Rivers should flow from highland/mountain areas toward the coast, creating natural valleys of rich grassland. River-coast intersections (deltas) should be limited and valuable
- **Ruby distribution**: Ruby deposits should be scattered across highland terrain with some clustering. Not every highland area has rubies — players must scout to find the richest deposits
- **Mountain placement**: Mountain ranges should create natural barriers and chokepoints that define the map's strategic geography. Not too many (map becomes fragmented) and not too few (no natural defenses)

---

## Resource Chains

```
POP CHAIN:    Grassland → Farms → Cities
              River bonus multiplies farm yield and city pop
              All pop buildings upgradeable (L1 cheap, L2 expensive + big multiplier)

GOLD CHAIN:   Territory → Passive gold trickle (enough for L1 buildings)
              Ports (coastline) → Base gold
              Ruby Deposits → Mines → Base gold (inland, safe)
              Gold ports/mines upgradeable (L2 = more gold output)

MILITARY:     Pop → Troop capacity
              Gold → Building upgrades (L1→L2, ongoing gold sink)
              Gold → Defense posts (border protection)
              Gold → Missile Silos → Missiles (per-launch cost, escalating) → Area damage
```

---

## Buildings

### Gold Income Sources
- **Territory**: All players receive a small passive gold trickle from territory size. This is enough to fund L1 buildings slowly — even a player with no ports or mines can build basic infrastructure given enough time and land
- **Ports**: Primary coastal gold source. Scales with coastline exposure
- **Mines**: Primary inland gold source. Scales with ruby deposits

### Building Upgrade Tiers
All buildings (except defense posts, which have their own level system) can be upgraded from L1 to L2 (and potentially L3). Each level increases the building's output with a significant multiplier, but costs substantially more gold.

**Cost philosophy:**
- **L1 buildings are cheap** — affordable with just passive territory gold income. Every player can build a basic economy without needing ports or mines. This ensures no player is locked out of the game by a bad starting position
- **L2 upgrades are expensive** — require real gold infrastructure (ports, mines) to afford at scale. Upgrading a few key buildings is achievable, but upgrading your entire network is a major gold investment
- **The gap between L1 and L2 output is large** — L2 isn't a marginal improvement, it's a significant multiplier (e.g., 2-3× the output of L1). This makes upgrades feel impactful and worth saving for

**Upgrade costs (example):**
| Building | L1 Cost | L2 Upgrade Cost | Output at L1 | Output at L2 |
|----------|---------|-----------------|--------------|--------------|
| Farm | 15g | 80g | Base pop yield | ~2.5× pop yield |
| City | 50g | 200g | Base pop + 1× terrain multiplier | Higher base pop + stronger terrain multiplier |
| Mine | 30g | 120g | Base gold from rubies | ~2× gold from rubies |
| City | 50g | 200g | Base pop + 1× terrain multiplier | Higher base pop + stronger terrain multiplier |
| Port | 20g | 100g | Base gold generation | ~2× gold generation |

**Strategic implications:**
- A player with 10 L1 farms is functional but capped. A player with 10 L2 farms has dramatically more pop — but spent ~800g upgrading them
- Players must decide: build more L1 buildings for breadth, or upgrade existing ones for depth?
- Gold-rich players (strong ports + mines) can afford to upgrade their entire network, creating a massive pop advantage that justifies their gold infrastructure investment
- Gold-poor players still have a functional L1 economy — they're not helpless, just capped. They can compete through territory size, smart placement, and military pressure

**Why this works as a gold sink:**
- Upgrading is never "done" — there's always another building to upgrade
- The cost scales mean even wealthy players can't upgrade everything instantly
- It gives gold ongoing purpose throughout mid and late game, alongside defense post upgrades and the missile arms race

### Port
- **Purpose**: Primary coastal gold source
- **Placement**: Must be placed on a player-owned land tile adjacent to water. **No two ports can share overlapping coastline yield** — if a port's radius covers certain water/coast tiles, no other port's radius can include those same tiles. This creates natural spacing between ports based on geography
- **Gold generation**: Based on how many water/coast tiles are within its radius. More coastline in radius = substantially more gold per tick. The relationship should be steep — a port with 2× the coastline exposure generates significantly more than 2× the gold. This makes prime port locations (bays, inlets, peninsulas) extremely valuable
- **Bay/harbor bonus**: A port placed in a deep bay or inlet naturally has coastline wrapping around it on multiple sides, filling its radius with water tiles. These natural harbors are the most productive port locations on the map — mimicking real-world port city geography (think natural harbors like San Francisco Bay, Sydney Harbour, Istanbul)
- **Straight coastline**: A port on a flat, straight coastline only has water on one side — its radius captures fewer water tiles. Still functional but much less productive than a bay port
- **Exclusion effect**: Because ports can't share coastline, a player who places a port in a prime bay location locks out other ports from that area. This creates strategic pressure:
  - First player to claim a bay gets the best port position
  - A long straight coastline might support multiple spaced-out ports, but each one is mediocre
  - A deep bay supports one amazing port but no room for others
  - Players fight over natural harbor locations the way they fight over river valleys for farming
- **Upgradeable**: Yes — L2 port generates significantly more gold from the same coastline
- **Cost**: L1 is cheap — this is the bootstrap building, players need gold before anything else
- **Design intent**: Port placement becomes a geographic puzzle. Players scout coastlines for bays and inlets that maximize water tiles in radius. Prime harbor locations are finite and contested — controlling one is a major economic advantage. The no-overlap rule prevents port spam along a coastline and makes each port a deliberate commitment to a specific stretch of coast
- **Yield algorithm requirements**:
  - **Only ocean water counts** — river tiles within the port's radius do not contribute to gold yield. Rivers are for farming and transport, not port trade
  - **Coastline must be contiguous with the port's landmass** — the algorithm traces coastline outward from the port along its own shore. Coastline from a separate landmass across a strait or channel does not count, even if it's within the radius. This prevents a port on a narrow strait from getting inflated yields from the opposite shore
  - **How it works**: From the port tile, trace the land-water boundary along the port's own landmass within the radius. Count the number of coastline tiles (land tiles adjacent to ocean) reachable by walking along the shore from the port without crossing water. This is the port's effective coastline
  - **Bays are naturally rewarded**: A port in a bay has coastline wrapping around it on multiple sides — all contiguous with the port's landmass. The shore-tracing algorithm captures all of it
  - **Straight coast is naturally weaker**: Coastline only extends in two directions (left and right along the shore) before leaving the radius. Fewer coastline tiles = less gold

### Farm
- **Purpose**: Provides base population to a connected city
- **Placement**: Any owned land tile (including highland). Farms can be placed on highland tiles but only grassland tiles within the farm's radius contribute pop yield. A farm on highland surrounded by grassland still works — it just reaches into the nearby grassland
- **Connection rule**: A farm is "connected" to a city if it is within that city's radius
- **Pop contribution**: Based on how many **grassland** tiles are within the farm's radius. More grassland = more pop yield
- **Suggested yield**: +0.5 pop per grassland tile in radius. A farm in a lush grassland area might yield 4-5 pop, while one in sparse/mountainous terrain yields very little
- **River bonus**: Farms placed adjacent to a river tile (not on the river itself) get a multiplier on their yield (e.g., 1.5-2×). River-adjacent grassland is the most fertile land on the map
- **Cost**: Cheap — the bread-and-butter building players place throughout the game
- **Design intent**: Not all land is equal for farming. Players must scout for grassland-rich areas. River-adjacent grassland is premium farmland

### Grassland (map resource)
- **What it is**: A terrain type assigned to land tiles during map generation. Represents fertile, farmable land
- **Distribution**: Concentrated in plains, river valleys, and lowlands. Sparse or absent in mountains, highlands, and arid regions
- **Visibility**: Always visible to all players via terrain coloring (green-tinted tiles vs. brown/grey for non-grassland)
- **Design intent**: Creates varied land value — some regions are farming powerhouses, others are barren. River valleys with dense grassland become the most valuable farming territory

### City
- **Purpose**: Holds population, which determines troop capacity
- **Placement**: Any owned land tile, but **must be at least X tiles away from any other city** (yours or enemy's). This exclusion radius prevents city spam and forces strategic commitment to a region
- **Base pop**: Small fixed amount (e.g., 5 pop just for existing)
- **Receives pop from**: Connected farms (within city's radius)
- **Troop capacity contribution**: Each pop point increases max troops by a fixed amount (e.g., +20 troops per pop)
- **Cost**: Moderate
- **Terrain bonuses** (multiplicative, applied to total pop received by this city):
  - **Adjacent to river**: +50% pop
  - **Adjacent to coast** (next to water): +50% pop
  - **Adjacent to both river + coast**: +100% pop (bonuses stack additively: 1.0 + 0.5 + 0.5 = 2.0x)
  - Buildings are never placed on water/river tiles — they must be on land tiles adjacent to them
- **Exclusion zone effects**:
  - Coastal players are hurt most — narrow land strips mean exclusion zones overlap, limiting them to fewer cities spaced along the coast
  - Inland players benefit — wide open land means more room to space cities and surround each one with farms
  - This naturally balances the coastal gold advantage: coastal players have more gold but fewer, smaller cities. Inland players have less gold but more cities with denser farm networks
- **Design intent**: City placement is the highest-stakes decision. The exclusion zone means each city is a long-term commitment to developing a region. Players must choose between optimal terrain (river/coast) and optimal spacing

**City capture mechanics:**
- **Building supply ownership rule**: All building connections require **same-owner control**. A building only connects to and benefits from other buildings owned by the same player. When territory changes hands, all connections involving captured and non-captured buildings are severed:
  - A captured city only receives pop from farms owned by the **same player** as the city
  - A mine only gets gold from ruby deposits within its own radius
  - Ports and all other buildings follow the same rule
- **Implications**:
  - Capturing a city without its farms gives you the terrain bonus (river/coast multiplier) but no pop income — it's an empty shell until you build or capture the surrounding farms
  - Capturing farms without their city = orphaned (pop goes nowhere)
  - The defender's orphaned buildings contribute nothing until they build/capture replacements
  - This rewards thorough conquest over surgical strikes — taking one building is just the first step, capturing or rebuilding the full production chain is what makes it valuable
  - A city snipe via boat is still powerful (denies the defender their city and severs all connections) but doesn't instantly snowball the attacker's troop count
- **Building capture vs. destruction**:
  - **All economic buildings are captured, not destroyed**: Farms, cities, ports, and mines change ownership when their tile is conquered. They go dormant under the new owner until connected to same-owner infrastructure (e.g., a captured farm is dormant until the new owner has a city in range)
  - **Defense posts are destroyed on capture**: These are military installations — when you fight through them, they're gone. The attacker must build their own to fortify the new border
  - **Missiles destroy buildings**: Buildings caught in a missile blast radius are destroyed regardless of type. This is the only way to destroy economic infrastructure without conquering the tile
- **Razing buildings**:
  - Any building the player owns (whether built or captured) can be **razed** for a partial gold refund
  - **Raze time**: Razing takes time (e.g., 5-10 seconds). The building shows a "razing" visual during this period. If the tile is lost to an enemy before the raze completes, the raze is cancelled and the building remains intact under the new owner
  - **Gold refund**: Returns a percentage of the building's original cost (e.g., 30-50%). L2 buildings return more gold than L1. The refund is not full value — there's always a cost to relocating
  - **Razing your own buildings**: Lets players relocate infrastructure. Found better grassland for a farm? Raze the old one, get some gold back, build a new one in the better spot
  - **Razing captured buildings**: The key offensive use. Raid enemy territory, capture their port or farm, immediately start razing it for gold, then retreat. Even if you can't hold the territory, you denied them the building and gained gold from it. Creates hit-and-run economic warfare
  - **Razing enemy buildings you can't use**: If you capture a farm but have no city nearby, it's dormant and useless to you. Razing it converts it to gold you can actually spend, and denies the defender the chance to retake it intact
  - **Design intent**: Adds a tactical layer to territorial raids. Attackers have a reason to push into enemy territory even temporarily — raze high-value buildings for gold and retreat. Defenders must protect their infrastructure or lose it permanently. Also gives players economic flexibility to restructure their own building networks without total loss

### Defense Post
- **Purpose**: Protects borders by making tiles harder for enemies to take
- **Placement**: On or near owned border tiles
- **Upgradeable**: Yes — can be upgraded through multiple levels, each costing increasing gold
- **Level mechanic**: Defense posts can be upgraded through multiple levels, each costing increasing gold. Higher-level defense posts make tiles within their radius even more expensive for enemies to take
- **Cost**: Base cost is moderate. Each upgrade costs significantly more than the last (e.g., L1 = 50g, L2 = 120g, L3 = 250g)
- **Design intent**: Defense posts are the baseline border protection. Cheap to place, effective against uncontested attacks. Upgradeable for stronger defense on contested borders

### River Gates (Defense Post on River)
- **What it is**: When a defense post is placed on a tile adjacent to a river, it functions as a river gate — blocking enemy boats from passing through that point on the river
- **Blocking behavior**: Enemy boats cannot sail past a river gate. They are stopped at the gate's position. Boats can still cross the river laterally (shore to shore) to land troops and attack the gate, but cannot continue upstream or downstream past it
- **Owner's boats pass freely**: The player who owns the river gate can boat through it without restriction. This makes rivers a fast internal transport network for the defender — troops can be moved quickly between cities along the river while enemies are locked out
- **Destroying a gate**: The attacker must cross the river, land troops, and take the territory the gate is on to destroy it. Once the gate falls, enemy boats can pass through that point and push further up/downstream to the next gate
- **Upgradeable**: River gates follow the same level system as regular defense posts
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
- **How to initiate**: Player holds **Shift + click-drags** from a point in their own territory toward enemy territory, creating a directional attack vector. Regular click-drag continues to pan the camera as before
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
| Defense posts | Defense posts along the vector path slow the attack — the concentrated troops must fight through them |
| Missiles | Soften a section of the enemy border with a missile strike, then follow up with a vector attack through the gap |
| Amphibious landings | Once beachhead stabilizes, vector attack inland from the landing point to push deeper |
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
- **Design intent**: Gives gold-heavy players (especially coastal empires with strong port income) a way to convert surplus gold into military impact. The extreme cost means missiles are a late-game mechanic — early/mid game players can't afford to waste gold on them when they still need farms and cities. Even late game, each launch is a significant spend, keeping missiles marginal rather than dominant

### Missile
- **Launched from**: A missile silo owned by the player
- **Target**: Player clicks any visible tile on the map to target
- **Effect**: Deals damage in a small radius around the impact point. Kills troops in the area and can destroy enemy buildings caught in the blast
- **Travel time**: Missiles are not instant — they take time to travel from silo to target, giving the defender a window to react
- **Cost per launch**: Very expensive (e.g., 200g for the first missile). Each subsequent missile from the same silo costs more than the last (escalating cost). This ensures missiles are a decisive late-game tool, not spammable
- **Design intent**: Surgical strikes, not carpet bombing. A well-placed missile on an enemy's farm cluster or city can cripple their economy, but the escalating cost means you get a few impactful shots, not unlimited bombardment. The first player to fire missiles gains a decisive advantage — creating a late-game race to build silos

### Mine
- **Purpose**: Extracts gold from ruby deposits. The inland player's primary gold source
- **Placement**: Must be placed on or adjacent to a ruby deposit
- **Gold generation**: Generates gold passively based on how many ruby tiles are within the mine's radius. This is standalone income — no other buildings required. Gives inland players a way to fund their economy without coast access
- **Cost**: Moderate
- **Design intent**: Mines are to inland players what ports are to coastal players — a baseline gold source. Placed on highland ruby deposits, they give inland/highland players gold independence

### Ruby Deposits (map resource)
- **What they are**: Rare strategic resource tiles on land, placed during map generation. Rendered with a distinct visual (e.g., red/pink sparkle on the tile)
- **Distribution**: Concentrated in highlands. Rarely near coast. The further from the coast, the more likely rubies appear. This ensures inland territory has unique economic value
- **Visibility**: Always visible to all players. Players can see ruby deposits from the start and plan expansion accordingly
- **Design intent**: Rubies are the inland gold resource. Mines extract gold directly from them, giving highland players gold independence without needing coastal access

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

| Terrain | Effect on Cities | Effect on Farms | Effect on Mines | Effect on Ports |
|---------|-----------------|-----------------|-----------------|-----------------|
| Grassland (land) | — | Each tile in radius = +pop (scales with level) | No rubies here | — |
| Highland (land) | — | Not farmable | Ruby deposits spawn here (scales with level) | — |
| Mountain | Impassable — no buildings, no expansion, no movement. Natural walls and chokepoints | | | |
| River tile | +50% pop multiplier | Multiplier on yield (1.5-2×) | No rubies | — |
| Coast (adjacent to water) | +50% pop multiplier | — | — | Generates gold based on nearby coastline |
| River + Coast intersection | +100% pop (both stack) | River multiplier applies | — | Generates gold |

### Map resources summary

| Resource | Where | Exploited by | Yield |
|----------|-------|-------------|-------|
| Grassland | Land tiles — plains, river valleys, lowlands | Farms | +pop per grassland tile in farm radius |
| Ruby deposits | Highland tiles — deep interior, rarely near coast | Mines | +gold per ruby tile in mine radius |

All work similarly: place a building near the resource → radius captures resource tiles → yield scales with count.

### Strategic asymmetry this creates

- **Coastal players**: Rich in base gold (ports) with grassland farms for pop along the coast. Can build fast. Strength is economic tempo and naval control. Want to push inland to access rubies for even more gold
- **Highland players**: Gold from ruby mines, plus passive territory income. Need to push toward grassland for farm pop or toward coast for ports. Strength is gold self-sufficiency from rubies
- **Inland/river players**: Grassland-rich river farms produce massive pop. May sit near ruby deposits for gold income. Strength is troop density. Want to push coastward for ports
- **Mixed (river-coast) players**: Best of both worlds but these tiles are rare and heavily contested
- **Key tension**: Every terrain type has something unique. Coastal = gold + fish pop. Grassland = farm pop. Highland = ruby gold. Players need diverse terrain to maximize their economy

---

## Example Scenarios

*Note: These examples use simplified pop values to illustrate relative differences. Actual yields depend on grassland tile levels and radius sizes determined during playtesting.*

### Coastal city (river-coast tile, 4 standard farms)
- City base pop: 5
- 4 farms on average grassland (~4 pop each based on tiles in radius): +16 pop
- Subtotal: 21 pop
- River bonus (+50%) + Coast bonus (+50%) = 2.0× multiplier
- **Final pop: 42 → 840 troops**

### Inland river city (river tile, 4 river farms)
- City base pop: 5
- 4 farms on rich river grassland (~4 pop each × 1.5-2× river bonus = ~7 pop each): +28 pop
- Subtotal: 33 pop
- River city bonus: 1.5× multiplier
- **Final pop: 49.5 → 990 troops**

### Inland city (no river, 4 standard farms on mediocre grassland)
- City base pop: 5
- 4 farms on sparse grassland (~2 pop each): +8 pop
- No terrain bonus (1.0×)
- **Final pop: 13 → 260 troops**

### Pure coastal city (coast tile, 4 farms on coastal grassland)
- City base pop: 5
- 4 farms on coastal grassland (~4 pop each): +16 pop
- Subtotal: 21 pop
- Coast city bonus: 1.5× multiplier
- **Final pop: 31.5 → 630 troops**
- This player also has ports generating gold, so they can build and upgrade faster

### Key takeaway
Pop ranking per city: inland river (990) > coastal mixed (840) > pure coastal (630) > pure inland on bad grassland (260). But gold ranking is reversed: coastal players build faster. The system rewards players who control diverse terrain — a player with both river valleys and coastline has the strongest overall economy. Grassland quality and river proximity dramatically affect farm yields.

---

## Balance Considerations

### Gold income pacing
- Ports should generate enough gold that a player with 1-2 ports can slowly build farms, but 3-4 ports enables a much faster build rate
- Gold income should scale sub-linearly with port count to prevent runaway economies from pure coastal control

### Inland viability
- Inland river players are now competitive through superior farm yields — river farms produce higher pop, which compounds with river city bonuses
- Pure inland players (no river access) still need a minimum gold source — options:
  - Passive gold trickle from territory size (small, enough to slowly build farms)
  - Markets: an alternative gold building for inland players that generates less gold than ports
  - Map design guarantees every spawn has access to either coast or river

### Snowball prevention
- City pop has diminishing returns on troop capacity at very high values
- Or: troop upkeep that scales with army size, funded by gold, creating a natural ceiling
- Farm upgrade diminishing returns already prevent infinite scaling from farm spam

### Building density
- Cities enforce a minimum exclusion radius — no two cities (yours or enemy's) can be placed within X tiles of each other
- This exclusion radius should be larger than the city's farm connection radius, so each city has a dedicated economic zone that doesn't overlap with other cities
- Suggested: exclusion radius ~1.5-2× the city connection radius

---

## Migration from Current System

### What stays
- Defense posts (same mechanics, same cost structure)
- City placement on map (but pop mechanics change entirely)
- Build button HUD and placement flow

### What changes
- Farms: currently generate flat gold → now generate pop for connected cities
- Mines and factories: removed or repurposed (gold now comes from ports and mines on rubies)
- Cities: currently just increase max troops by flat amount → now accumulate pop from farms with terrain multipliers
- Gold income: currently from land ownership + farms/mines → now from territory trickle + ports (coastal) + mines (highland rubies)

### New additions
- Port building type
- River/coast terrain bonus detection for cities
- Pop tracking per city
- Connection visualization (farm→city lines on hover)

---

## Open Questions

1. **What radius values?** City radius, port gold-detection radius — these determine how spread out vs. clustered the economy feels
2. **Can one farm connect to multiple cities?** If yes, farms between two cities are extra valuable. If no, players must choose which city a farm serves
3. **Port gold formula**: Linear with coastline tiles? Sqrt? Needs playtesting to find the right curve

---

## P1 Ideas (deferred — add if needed after playtesting)

These are mechanics that may be valuable but aren't essential for the core system. Add them if playtesting reveals specific problems they solve.

### Highland Bazaar (gold trickle building)
- **Problem it solves**: Highland territory without ruby deposits has no economic value beyond passive territory income. Players may avoid holding highlands entirely
- **Mechanic**: A building placeable only on highland terrain with a very large radius that generates a modest gold trickle based on highland tiles in range. Cheap at L1, upgradeable to L2. Standalone — no connections needed
- **Why deferred**: Highlands already have ruby deposits for gold income, and passive territory income provides a baseline. Bazaars may not be needed if ruby distribution is generous enough across highland terrain. Add only if playtesting shows large swaths of ruby-free highlands feel worthless to hold

### City capture cooldown (30 seconds)

### Alliance limit
- **Problem it solves**: A dominant player could ally with all neighbors and turtle safely with no exposed borders
- **Mechanic**: Limit active alliances to 1-2 at a time. Forces players to choose who to ally with, creating diplomatic tension and ensuring every player has at least some unprotected borders
- **Why deferred**: Unlimited alliances may self-balance — large alliance networks are fragile (one expiration breaks the chain) and the 80% win condition means alliances must eventually break. Add only if playtesting shows alliance stacking makes dominant players unchallengeable

### Transport Hub (trade route system)
- **Problem it solves**: Inland mines produce gold but there's no mechanic to incentivize connecting inland resources to coastal ports. No cross-map supply chain dynamics
- **Mechanic**: Transport hubs are buildings placed along a chain from a mine to a port. Each hub connects to the next within its radius, creating a relay. The port at the end receives bonus gold based on total rubies connected through the chain. Cutting the chain (enemy takes territory between hubs) kills the bonus
- **Why deferred**: Adds a building type and a complex connection system (hub-to-hub chaining, contiguous territory checks). The base game already has mines generating standalone gold from rubies. Trade routes add strategic depth but also UI complexity and frustration when chains break. Add only if mines alone feel too simple and there's not enough incentive for cross-map territorial control

### Overextension (territory size penalty)
- **Problem it solves**: Large players snowball by mindlessly expanding — more territory = more passive gold = more buildings = more troops = more territory
- **Mechanic**: Attack troop cost per tile scales with total territory size relative to developed infrastructure. Large undeveloped empires become sluggish on offense (defense unaffected). Building infrastructure on territory reduces the penalty. Self-correcting — overextended players naturally stop expanding and develop instead
- **Why deferred**: The mechanic is invisible and can feel punishing if players don't understand why their attacks suddenly cost more. Needs very clear visual feedback to work well. The base game already has natural expansion limits (gold cost of buildings, defense post placement, finite troop capacity). Add only if playtesting shows large players steamrolling with no natural slowdown

### City capture cooldown (30 seconds)
- **Problem it solves**: Snowballing from rapid city captures — attacker takes a city and immediately gets stronger, funding the next capture
- **Mechanic**: When a city is captured, it enters a "securing" state for 30 seconds. During this time it contributes zero pop to the new owner. The previous owner loses the pop immediately, but the attacker doesn't gain it until the cooldown expires
- **Visual**: Progress bar or timer on the city during the securing phase, visible to all players
- **Why deferred**: The building supply ownership rule (all connections require same-owner) may already prevent snowballing sufficiently — a captured city with no same-owner farms produces nothing anyway. The cooldown would be redundant if supply cutoff does the job. Add only if playtesting shows cities with nearby same-owner farms still snowball too fast

### Troop upkeep (gold cost per army size)
- **Problem it solves**: Late-game gold becoming meaningless once infrastructure is fully built out
- **Mechanic**: Troops cost gold to maintain proportional to army size. Bigger army = bigger gold drain. This naturally caps how large you can grow and means gold is always relevant
- **Why deferred**: The missile arms race and border defense post upgrades may already provide enough late-game gold sinks. Add only if surplus gold still has no use after those systems are in place

### Building decay / repair
- **Problem it solves**: Static economies that never change once fully built
- **Mechanic**: Buildings degrade over time and need gold to repair. Neglected buildings eventually stop producing
- **Why deferred**: Adds maintenance busywork that may not be fun. The building supply cutoff and conquest mechanics already create dynamic economies through warfare. Add only if the meta becomes too static

### Fog of war for buildings
- **Problem it solves**: Perfect information makes it too easy to target enemy infrastructure
- **Mechanic**: Enemy buildings are only visible if you have territory or units nearby. Otherwise you see the terrain but not what's built on it
- **Why deferred**: Full visibility creates better map-reading and diplomacy. Fog of war adds complexity and may reduce the strategic depth of visible vector attacks and troop counts. Add only if perfect information makes the game too predictable

### Warships (naval combat)
- **Problem it solves**: Water is purely a transport medium — no naval warfare or sea control
- **Mechanic**: Warships that patrol sea zones, block enemy boats, and bombard coastal tiles. Would add a full naval theater of war
- **Why deferred**: The base game already has meaningful naval depth through boats, river gates, and beachhead mechanics. Warships would require balancing an entire second combat system (sea combat rules, ship costs, naval economy). Primary maps are land-focused with water edges — keep water as a boundary and transport medium, not a theater. Add only if the game needs more naval depth after core land mechanics are proven

### Trade route visualizations
- **Problem it solves**: Trade routes (mine → hub → port) are invisible — players can't see the supply chain on the map
- **Mechanic**: Animated dots or lines showing goods flowing along trade routes, similar to OpenFront's trade visualization. Makes the economy visually readable
- **Why deferred**: Functional trade routes work without visualization — the gold income is shown in the HUD. Visual polish should come after core mechanics are stable. Add when the game is playable and needs visual feedback improvements

### Casus Belli (CB) system
- **Problem it solves**: Large players can steamroll smaller players with no counterbalancing mechanic. Small players need a way to punch up against defended, overextended empires
- **Mechanic**: Players can fabricate a claim on a painted zone of enemy territory. Fabrication takes 30-60 seconds (invisible to others). Once active, the CB becomes visible to all and grants a 30-50% attack cost discount within the zone. Lasts 2-3 minutes, one CB at a time, same fabrication rate for all players regardless of size
- **Why deferred**: The existing combat mechanics (vector attacks, annexation, missiles) give small players tactical options. CBs add UI complexity (zone painting, fabrication timer, visible claims). Add only if playtesting shows small players still lack viable offensive options against entrenched large players

### Siege Tower (offensive counter to defense posts)
- **Problem it solves**: Defense posts can make borders impenetrable, leading to stalemates. Attackers need a building-based way to neutralize them
- **Mechanic**: An offensive building placed near your border that neutralizes enemy defense posts within its radius. Same level system as defense posts — if the siege tower's level exceeds the defense post's level, the post is neutralized. Creates a gold-burning escalation cycle on contested borders
- **Why deferred**: Missiles already serve as the stalemate breaker by destroying defense posts from range. Siege towers add another building type and a complex level-comparison mechanic. Add only if missiles alone are insufficient to break defensive stalemates

### SAM Site (missile defense)
- **Problem it solves**: Missiles have no counter — once a player builds a silo, there's no defense against strikes
- **Mechanic**: Automatically intercepts incoming missiles within its defense radius. Each interception costs gold to reload. Creates an arms race gold sink between missile silos and SAM sites
- **Why deferred**: Missiles are designed to be a decisive late-game tiebreaker with escalating costs. Adding SAMs turns missiles into an arms race instead of a decisive tool, which may extend games rather than ending them. The escalating missile cost already prevents spam. Add only if missiles feel too dominant with no counterplay

### Mill (farm pop amplifier)
- **Problem it solves**: Farm-only pop growth might feel too linear — no way to multiply farm output in a specific region
- **Mechanic**: A building that connects to both farms and a city. Adds bonus pop to the city based on how many farms are in its radius. Creates a spatial puzzle — the mill needs to be positioned where it reaches both farms and a city. Uses diminishing returns formula (sqrt of connected farm count) to prevent infinite stacking
- **Why deferred**: Farm upgrades (L1→L2) already provide the "invest more gold for more pop" progression. The city exclusion zone means players can just build another city rather than bridging farms to a distant one. Add only if the farm-only economy feels too simple or there's unreachable grassland between city exclusion zones that mills could bridge

### Fishery & Fish Patches (coastal pop building)
- **Problem it solves**: Coastal players might lack pop growth if coastlines have no grassland
- **Mechanic**: Fisheries placed on coast count fish patch tiles (special water tiles) in their radius for pop yield. Fish patches are a map resource scattered along coastlines. Fisheries connect to cities for pop but don't connect to mills
- **Why deferred**: Coastal territory typically has grassland running up to the water's edge, so coastal players can farm normally. Fisheries add a building type and a map resource (fish patches) for an edge case. Add only if playtesting shows coastal-only spawns without nearby grassland are unviable
