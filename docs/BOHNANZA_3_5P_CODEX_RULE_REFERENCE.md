# BOHNANZA 3–5P — CODEX RULE REFERENCE

Version: 2026-08-19

## Source priority
1. Current AMIGO Bohnanza rules/product summary
2. Current AMIGO Bohnanza Dahlia / Bohnanza Dahlias rules
3. Current Dized Bohnanza Dahlias rules (Publisher: AMIGO)
4. This project's approved rules
5. Older/third-party rules only for comparison

Do not use Duel, 6–7 player expansion, third-field purchase expansion, or old-edition rules unless explicitly approved.

## Player count and fields
- 3 players: 3 fields each
- 4 players: 2 fields each
- 5 players: 2 fields each

## Setup
- 5 hand cards each.
- Hand order may never be rearranged.
- New cards are appended to the back of the hand.
- Keep draw pile and discard pile separate.
- Store startingPlayerId and seatOrder for the end-game tie breaker.

## Turn state machine
WAITING
-> TURN_PLANT
-> TURN_REVEAL_AND_TRADE
-> TURN_PLANT_TRADED
-> TURN_DRAW
-> TURN_END
-> next player

GAME_END is entered when the draw pile is exhausted for the third time, with the special phase-2 handling below.

## Phase 1 — Plant from hand
- Active player MUST plant hand[0].
- Then MAY plant the new hand[0].
- Cannot plant a third hand card.
- If hand is empty, skip phase 1.
- One field can contain only one bean type at a time.
- Same bean type may exist in multiple fields.
- Fields have NO card-capacity limit.
- If a new type must be planted and there is no legal field, harvest a legal field first.

## Phase 2 — Reveal and trade
- Reveal 2 cards from draw pile.
- Every trade MUST include the active player.
- Inactive players cannot trade directly with each other.
- Active player may trade any hand card plus revealed cards.
- Inactive players may trade any card in their own hand.
- Hand position does not restrict trading.
- Field cards cannot be traded.
- Cards already received in trade this phase cannot be traded again.
- Any-number-for-any-number trades are valid.
- Gifts are valid only if the recipient accepts.
- Coins are not tradeable.
- Do not remove hand cards until the deal is agreed.
- Traded-in cards go to receivedCards/pendingPlantCards, NEVER to hand.
- Active player decides when the trade phase ends.

## Phase 3 — Plant traded/revealed cards
- Every player must plant all cards they received.
- Active player must also plant all revealed center cards not traded away.
- These cards cannot be discarded.
- Player chooses planting order.
- If necessary, legal harvests may occur repeatedly to make room.
- This phase must never deadlock.

## Harvesting
- A player may harvest their own fields at any time, even during another player's turn.
- Harvesting always empties the ENTIRE field.
- Partial harvest is forbidden.
- Harvest reward comes from the bean's harvest table.
- Some harvests may pay 0 coins.
- Cards not converted to coins go to discard pile.

## One-card field protection
If a field has exactly 1 card, it cannot be harvested while that player has ANY other field containing 2+ cards.

Examples:
- 1 / 6 => only the 6-card field is harvestable.
- 1 / 1 => either field is harvestable.
- 1 / 1 / 4 => only the 4-card field is harvestable.
- 1 / 1 / 1 => all are harvestable.

Centralize this rule:
getHarvestableFieldIds(playerId)

## Draw/discard
- Harvest leftovers go to discard.
- Untraded revealed cards do NOT go to discard; they must be planted.
- When draw pile becomes empty, reshuffle discard to create a new draw pile.
- Increment drawPileExhaustionCount.

## Phase 4 — Draw
- Draw 3 cards.
- Append them to the BACK of the active player's hand in exact draw order.
- Player cannot choose insertion positions.

## Game end
- Game ends when draw pile is exhausted for the THIRD time.
- If third exhaustion occurs during reveal/trade, finish phase 2 and phase 3, then end.
- At game end, harvest all fields.
- Cards remaining in hand score 0.
- Most coins wins.
- Tie: among tied players, the player furthest from the starting player in clockwise order wins.

## Economy data
Do NOT hard-code economy in UI.

Use:
```ts
type BeanDefinition = {
  id: string;
  name: string;
  totalCards: number;
  harvestTable: Array<{ beansRequired: number; coins: number }>;
};
```

Current AMIGO Bohnanza-Dahlias core economy has 8 gameplay types and 104 gameplay cards:
20 / 18 / 16 / 14 / 12 / 10 / 8 / 6.

For this project:
- use original names/art
- keep counts and harvest tables in config
- do not copy official artwork
- do not invent unapproved harvest values

## Project trade UX decisions
These are project UX decisions, not official rules.

- Players are physically together and negotiate verbally.
- Phone records/validates the final deal.
- Tap a player directly to start trade.
- Keep board and fields visible during negotiation.
- Select GIVE cards from existing hand/center.
- Select REQUEST bean type + quantity.
- Use a compact anchored trade tray, not a full-screen trade page.
- Incoming offer: Accept / Counter / Reject.
- Successful trade cards animate to receivedCards.
- At trade-end, receivedCards becomes mandatory planting queue.
- Do not duplicate the whole hand inside a trade modal.
- Attach pending-offer indicator to the relevant player instead of a permanent large offer list.

## Recommended 393×664 trade layout
Persistent:
- opponents and opponent fields
- draw pile
- revealed center cards
- discard pile
- own fields
- own hand

Trade tray:
- between board/fields and hand, or anchored immediately above hand
- max ~20–25% of screen height

Example:
[Target]
GIVE            REQUEST
[card][card] ↔ [type × qty]
[Send] [Cancel]

## Server-authoritative invariants
Never trust client for:
- turn
- phase
- card ownership
- card identity
- harvest legality
- trade legality
- coin rewards
- draw order
- game-end trigger

Every card instance needs unique cardId.

Recommended state:
```ts
type GameState = {
  players: PlayerState[];
  activePlayerId: string;
  startingPlayerId: string;
  seatOrder: string[];
  phase: GamePhase;
  drawPile: CardId[];
  discardPile: CardId[];
  revealedCards: CardId[];
  drawPileExhaustionCount: number;
  tradeOffers: TradeOffer[];
  status: "waiting" | "playing" | "finished";
};

type PlayerState = {
  id: string;
  hand: CardId[];          // ORDER IS SACRED
  fields: FieldState[];
  receivedCards: CardId[]; // NEVER merge into hand
  coins: number;
};
```

## Required rule functions
- getFieldCount(playerCount)
- canPlantCard(...)
- getHarvestableFieldIds(...)
- harvestField(...)
- getTradeableCardIds(...)
- validateTradeOffer(...)
- resolveTrade(...)
- getPendingPlantCards(...)
- plantPendingCard(...)
- drawCardsToBack(...)
- handleEmptyDrawPile(...)
- checkGameEnd(...)
- scoreGame(...)
- resolveTieByStartingPlayerDistance(...)

## Required tests
- 3p => 3 fields; 4/5p => 2 fields
- hand order never rearranges
- first hand card mandatory; second optional; third forbidden
- active↔inactive valid; inactive↔inactive invalid
- any hand position tradable
- active can trade revealed cards
- field cards cannot trade
- received cards cannot re-trade
- gifts require acceptance
- no coin trading
- all received cards mandatory to plant
- all untraded revealed cards mandatory to plant
- partial harvest invalid
- 1/6 protection
- 1/1 exception
- 1/1/4 protection
- harvest allowed during another player's turn
- harvest leftovers enter discard
- untraded revealed cards do not enter discard
- empty draw pile reshuffles discard
- third exhaustion ends game
- third exhaustion during phase 2 finishes phase 2+3 first
- hand cards score 0 at end
- tie breaker uses starting player and clockwise seat distance

## UI rules that prevent misunderstanding
- Never show field capacity such as 6/8.
- Show "Black Bean ×6", optionally "next reward: 7 → 3 coins".
- receivedCards must be visually separate from hand.
- During forced planting, dim hand and highlight only legal actions.
- Protected 1-card field: short feedback only, no huge rules modal.

## CODEX instruction
Before changing game logic:
1. Read this file fully.
2. Identify affected rules.
3. Update centralized rule functions first.
4. Add/update tests.
5. Update UI only after rule tests pass.
6. Never encode rules only in disabled buttons.
7. Server remains authoritative.
8. If implementation conflicts with this document, treat it as a bug unless the user explicitly changes the rule.

At the end of each rules-related task report:
- rules changed
- tests added/updated
- edge cases covered
- remaining ambiguity

---

## 22. AMBIGUOUS / EDGE-CASE DECISION TABLE — MUST IMPLEMENT EXACTLY

This section exists specifically to remove ambiguity from situations that are easy to implement incorrectly.
These are not optional hints. Treat every case below as an executable rules specification.

### CASE A — Forced plant, all fields contain exactly 1 card

Example for a 4–5 player game:

```text
Field A: Red ×1
Field B: Green ×1
Pending mandatory card: Black ×1
```

Black matches neither field and there is no empty field.

Resolution:
1. The player MUST make room because the Black card is mandatory to plant.
2. Since neither other field contains 2+ cards, the one-card protection rule does not protect either field.
3. The player chooses Field A OR Field B.
4. Harvest the chosen one-card field completely.
5. If its harvest table pays 0 coins at one card, gain 0 coins.
6. Put that harvested card in the discard pile.
7. Plant Black in the now-empty field.

Valid:
```text
Red ×1 / Green ×1
-> harvest Red for 0
-> Black ×1 / Green ×1
```

Also valid:
```text
Red ×1 / Green ×1
-> harvest Green for 0
-> Red ×1 / Black ×1
```

IMPORTANT:
- Mandatory planting never becomes impossible merely because all current fields have one card.
- A zero-coin harvest is legal when the protection rule allows that field to be harvested.

---

### CASE B — Forced plant, one field has 1 card and another has 2+ cards

```text
Field A: Red ×1
Field B: Green ×6
Pending mandatory card: Black ×1
```

Black matches neither field.

Resolution:
- Field A is PROTECTED and cannot be harvested.
- Field B is the only legal harvest.
- The player MUST harvest Green ×6.
- Then plant Black in the empty field.

Invalid implementation:
- allowing the player to sacrifice Red ×1 for 0 coins.

Rule reason:
A one-card field cannot be harvested while any other field contains more than one card.

---

### CASE C — Three-player version: one-card protection across three fields

```text
Field A: Red ×1
Field B: Green ×1
Field C: Blue ×4
Pending: Black ×1
```

Resolution:
- A is protected.
- B is protected.
- C is harvestable.
- If room is required, C must be harvested.

If instead:

```text
A ×1 / B ×1 / C ×1
```

all three fields are legal harvest targets because no other field has 2+ cards.

The protection check must inspect ALL of that player's fields, not only two fields.

---

### CASE D — Multiple mandatory cards of different types may force repeated harvests

```text
Field A: Red ×1
Field B: Green ×1

Pending:
Black ×1
Yellow ×1
```

The player chooses the order of pending cards.

Possible legal resolution:
1. choose Black first
2. harvest Red ×1 for 0 coins
3. plant Black
4. now fields are Black ×1 / Green ×1
5. Yellow still must be planted
6. harvest either legal one-card field
7. plant Yellow

Final state could be:

```text
Yellow ×1 / Green ×1
```

or another legal result depending on choices.

Implementation requirement:
- after EVERY plant/harvest, recompute legal harvest and plant targets
- do not assume one harvest is sufficient for an entire pending queue
- never deadlock the mandatory-plant phase

---

### CASE E — Multiple mandatory cards of the same type

```text
Field A: Black ×3
Field B: Green ×2

Pending:
Black ×1
Black ×1
```

Resolution:
- both Black cards may be planted onto Field A
- final Field A = Black ×5
- no harvest required

The player may choose planting order, but identical-type cards naturally stack onto a matching field.

---

### CASE F — Same bean type may be grown in multiple fields

Example:

```text
Field A: Black ×4
Field B: empty
Pending: Black ×1
```

The player is allowed to plant the new Black card in:
- Field A, making Black ×5
OR
- Field B, starting another Black field

Do not enforce "one bean type may only appear in one field".
The restriction is the opposite:
each individual field may contain only one type.

---

### CASE G — Received trade cards NEVER enter hand

Example:

```text
Hand:
Red, Blue, Green, Black, Yellow

Trade received:
White ×1
```

After trade:
```text
Hand:
Red, Blue, Green, Black, Yellow

receivedCards:
White ×1
```

NOT:
```text
Hand:
Red, Blue, Green, Black, Yellow, White
```

Consequences:
- received card does not affect hand order
- received card cannot be traded again
- received card must be planted in phase 3

---

### CASE H — A card received in trade cannot be re-traded in the same phase

Example:
- Active Player A gives Black to Player B.
- Player B receives Black.
- During the same trade phase, B cannot offer that Black back to A or use it in another deal.

Server validation must reject this even if UI somehow exposes the card.

---

### CASE I — Untraded revealed cards cannot be discarded

Example:

```text
Active player reveals:
Black ×1
Yellow ×1
```

No one wants either card.

Resolution:
- the active player still owns both
- when trade phase ends, both become mandatory pending plant cards
- active player must plant both
- if necessary, the active player must harvest legal fields to make room

Invalid:
- discard because "nobody traded for them"
- return them to draw pile
- move them to hand

---

### CASE J — Trading from the middle of the hand does not break hand order

Example hand:

```text
[A, B, C, D, E]
```

The player trades C.

After the deal resolves:

```text
[A, B, D, E]
```

A remains the front card.

Do NOT:
- move D/E around
- reorder the hand by bean type
- move traded placeholders into another position

Card instances must be removed by unique `cardId`.

---

### CASE K — Do not remove a proposed trade card from hand before agreement

Example:
A offers their third hand card C.

While proposal is pending:
```text
hand remains [A, B, C, D, E]
```

UI may visually mark C as "offered", but server ownership remains unchanged.

Only after both sides agree:
```text
hand becomes [A, B, D, E]
```

Reason:
The official trading rule specifically avoids removing cards early because hand order must remain unambiguous if the deal fails.

---

### CASE L — Gift / donation requires explicit acceptance

Example:
A says "I'll give you Black for free."

Valid only after recipient B accepts.

If B refuses:
- Black stays with A
- A cannot force it into B's `receivedCards`

For UI:
a zero-request trade is a gift:
```text
GIVE: Black ×1
REQUEST: none
```
but recipient still receives Accept / Reject.

---

### CASE M — Inactive players cannot trade with each other

Players:
- A = active
- B = inactive
- C = inactive

Valid:
- A ↔ B
- A ↔ C
- B gives A a card
- A gives C a card

Invalid:
- B ↔ C

Even if B and C verbally agree, the server must reject a B–C transaction.

---

### CASE N — Harvesting is allowed outside your own turn

Example:
- A is active and is negotiating.
- B expects to receive a card that will not fit B's fields.
- B may harvest one of B's legal fields before the deal is completed.

This is legal because players may harvest their own fields at any time.

However:
- harvested cards do NOT become tradeable cards
- coin cards remain score
- leftover harvested cards go to discard

For co-located UX:
the player's own fields should remain tappable for harvest even when another player is active.

---

### CASE O — Off-turn harvest does not waive mandatory planting

Example:
- B harvests a field during A's trade phase.
- B then accepts Black from A.
- Black goes to B.receivedCards.
- When phase 3 begins, B MUST plant Black.

The earlier harvest merely created room.
It does not count as planting or cancel the received card requirement.

---

### CASE P — Harvesting a zero-reward field is legal

If the harvest table requires at least 3 cards for the first coin and the field contains only 1 or 2 cards:

- harvest is still legal if the protection rule permits it
- gain 0 coins
- entire field is discarded
- field becomes empty

This matters when a mandatory card must be planted.

Never block a harvest only because reward == 0.

---

### CASE Q — Partial harvest is never allowed

```text
Field: Black ×7
```

Invalid:
```text
harvest 3, leave 4
```

Valid:
```text
harvest all 7
```

Calculate payout for 7, convert the required number of cards to coins, discard all remaining cards, and leave field empty.

---

### CASE R — Mandatory card matching an existing field does not force a harvest

```text
Field A: Black ×6
Field B: Green ×3
Pending: Black ×1
```

Plant Black directly onto Field A.

Do not prompt for a harvest merely because both fields are occupied.
"Occupied" is not the issue; bean-type compatibility is.

---

### CASE S — Empty field always accepts any bean type

```text
Field A: Red ×4
Field B: empty
Pending: Black ×1
```

Black may be planted directly into Field B.
No harvest is needed.

---

### CASE T — Player chooses the order of phase-3 mandatory cards strategically

Example:

```text
Fields:
Red ×5
Black ×1

Pending:
Red ×1
Yellow ×1
```

Player may choose Red first:
- Red ×6
- then resolve Yellow, possibly requiring a harvest

Or choose Yellow first:
- may require a harvest immediately
- then resolve Red based on the resulting fields

The engine must not automatically sort pending cards.
UI must let the player select which pending card to plant next.

---

### CASE U — Phase 1 and phase 3 planting permissions are different

Phase 1:
- only active player
- only front hand card mandatory
- new front hand card optional
- maximum 2 hand cards

Phase 3:
- any player with `receivedCards` must plant them
- active player also plants untraded revealed cards
- all pending cards mandatory
- player chooses pending-card order

Never implement a generic "plant any card from hand whenever you want" action.

---

### CASE V — A player with no hand cards skips phase 1

If active player's hand is empty at the start of phase 1:
- do not error
- do not draw immediately
- skip to phase 2 reveal/trade

---

### CASE W — Trade phase can continue after the two revealed cards are gone

Example:
- both revealed cards have already been traded.
- active player still wants to negotiate using hand cards.

Legal:
trade phase continues until the active player ends it.

Do not auto-end trade merely because center revealed-card count reaches zero.

---

### CASE X — A pending offer does not reserve/reorder cards by moving them

If multiple trade offers are possible:
- keep exact card IDs marked as offered/locked in UI as needed
- do not physically remove them from hand until a deal resolves
- if one deal consumes a card, other stale offers involving that exact card must become invalid/cancelled

Server must revalidate ownership at acceptance time.

---

### CASE Y — Third draw-pile exhaustion during phase 2

If the draw pile runs out for the third time while revealing the two cards:
- it is possible that only one card can be revealed
- complete phase 2 with the card(s) actually revealed
- complete phase 3 mandatory planting
- then end the game
- do not proceed to the normal phase-4 draw

---

### CASE Z — End-game field harvest ignores normal "keep playing" concerns

At game end:
- all players harvest all fields for final scoring
- cards remaining in hand are worth 0
- there is no need to preserve fields for future turns because the game is over

Implement final scoring as a dedicated end-game procedure rather than trying to drive every field through normal interactive harvest UI.

---

## 23. IMPLEMENTATION DECISION TABLE

Use this table when the UI or server needs an immediate answer.

| Situation | Legal result |
|---|---|
| Need to plant new type; fields = 1 / 1 | Choose either field, harvest it even for 0 coins, then plant |
| Need to plant new type; fields = 1 / 6 | 1-card field protected; harvest 6-card field |
| Need to plant new type; 3-player fields = 1 / 1 / 4 | harvest 4-card field |
| Need to plant new type; 3-player fields = 1 / 1 / 1 | any field may be harvested |
| Received 2 different mandatory types, no space | repeated legal harvest + plant until all are planted |
| Received same type as an existing field | may stack there |
| Empty field exists | any type may be planted there |
| Trade received card | separate pending area; not hand |
| Try to trade a just-received card | reject |
| Revealed card not traded | active player must plant |
| Trade a middle hand card | remove exact card ID; preserve all remaining order |
| Proposed trade not accepted yet | do not remove card from hand |
| Free gift | allowed only with recipient acceptance |
| Inactive B wants to trade with inactive C | reject |
| Harvest while another player is active | allowed for your own field |
| Legal one-card harvest pays 0 | still allowed |
| Try to harvest part of a field | reject |
| Both fields occupied but pending matches one | plant on matching field; no harvest required |
| Phase 1 player wants to plant arbitrary middle hand card | reject |
| Phase 3 player wants to choose which pending card first | allow |
| Both revealed cards already traded | active player may keep trading hand cards |
| Third deck exhaustion during phase 2 | finish phases 2 and 3, then end game |

---

## 24. CODEX EDGE-CASE TEST REQUIREMENT

Before declaring the rules engine complete, Codex MUST create automated tests for every CASE A–Z above that is expressible in the engine.

At minimum, use table-driven tests for:
- field protection
- mandatory planting
- hand-order preservation
- trade ownership
- received-card lock
- off-turn harvesting
- zero-coin harvesting
- draw-pile exhaustion
- end-game transition

Do not treat an edge case as "handled by UI".
The authoritative rule engine must produce the same result even when called directly without the UI.
