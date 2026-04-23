# Future Building Ideas

## Economy Buildings (Phase 2)
- **Market**: +1.5 gold/tick per nearby building. Likes cities (+40%), farms (+30%). Dislikes defense posts (-30%). Rewards dense, diverse clusters.
- **Temple**: +50 max troops. Likes mountains (+40%), cities (+30%). Dislikes factories (-50%). Mountain empires get more of these.

## Military Buildings (Phase 2)
- **Watchtower**: +defense radius 10 tiles. Likes highland/mountain (+40%), defense posts (+50%). Dislikes other watchtowers (-60%). Synergizes with defense post network.
- **Bunker**: Only on mountains. Immune to nukes. Takes 1-2 min to conquer. Acts as last-resort city. Very expensive.
- **Artillery Post**: Upgraded defense post. Auto-fires at enemy frontline within range. Active defense vs passive.

## Advanced Economy (Phase 3)
- **Train/Rail System**: Factories produce trains along rail lines between cities/ports. Gold per stop. Routes decay after ~5 stops.
- **Ports & Trade Ships**: Ports generate trade ships to ally ports. Ships can be pirated.
- **Worker Ratio Slider**: Balance between troop production and gold production.

## Diplomacy (Phase 3)
- **Tributary States**: Force conquered player into vassal paying gold.
- **Peace Votes**: End stalemates democratically.
- **Alliance Betrayal Penalty**: Traitor debuff (20% weaker for 30 sec).

## Terrain-Weighted Pack Probabilities
Each building type has terrain bias weights:
- Farm: Plains 70%, Highland 20%, Mountain 10%
- Mine: Mountain 60%, Highland 30%, Plains 10%
- Factory: Highland 40%, Plains 40%, Mountain 20%
- Temple: Mountain 50%, Highland 30%, Plains 20%
- Market: Plains 50%, Highland 35%, Mountain 15%
- Watchtower: Highland 50%, Mountain 40%, Plains 10%

## Proximity Scoring Rules
- Radius of influence: 15 tiles Manhattan distance
- Liked things multiply base effect
- Disliked things reduce it
- Final output = baseEffect * (1 + bonuses - penalties), min 10% of base
- Preview shown before placement (green/red overlay)
