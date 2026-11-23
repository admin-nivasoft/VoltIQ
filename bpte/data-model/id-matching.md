# ID matching (silver step)

The battery ID joins birth, BMS and deployment data. This step decides which `battery_id` a record belongs to. Every lookup is scoped to one `manufacturer_id`; an ID never matches across manufacturers.

## Inputs
- Factory serial (birth files, test files, dispatch files).
- BMS ID (`device_id_raw` in each BMS message).
- Tags (QR, asset tag) where provided.
Whether the BMS ID equals the factory serial, contains it, or is a separate ID with a mapping file is `[__]` (open question in `bpte/CLAUDE.md`).

## Normalisation
Normalisation rules are `[__]`: pending the BMS protocol documents and the factory ID format. No case folding, separator removal, prefix stripping or zero stripping is applied until confirmed, because any of these could merge distinct IDs. Default: exact match only; `id_value_norm` equals `id_value_raw` until rules are confirmed. When rules exist, they live in a versioned per-manufacturer configuration and the version used is stored with each link.

## Matching order
1. **Exact**: raw value equals a stored `id_value_raw` of the same `id_type`, valid at `observed_at`. Link with `link_method = exact`.
2. **Normalised** (disabled until normalisation rules are confirmed `[__]`): `id_value_norm` equals a stored normalised value of the same type, valid at `observed_at`. Link with `link_method = normalised`.
3. **Cross-type**: BMS ID normalised equals a factory serial normalised, only if the manufacturer confirms the IDs are the same `[__]`. Otherwise skipped.
4. **Manual**: an Admin links the ID to a battery. Stored as a new `battery_identifier` row, `link_method = manual`, audited.
No fuzzy or partial matching in the first release.

## No match
- The record goes to `unmatched_record` (reason `no_match`). Bronze keeps it.
- It does not create a battery. Batteries are created only from birth data or by an Admin.
- Repeats of the same unknown ID update `count` and `last_seen_at` on one open row.
- Phase order is birth first (P1), BMS second (P2), so a battery normally exists before its BMS data. When a later birth file or Admin entry adds a matching identifier, open `no_match` rows for that ID are re-matched and replayed automatically.
- Admin sees the list with counts (data coverage view). After a manual link, the held records are replayed from bronze into silver and gold.

## Several matches
- Never pick one automatically. Record goes to `unmatched_record` (reason `several_matches`, `candidates` listed).
- An Admin resolves it. Root cause (duplicate factory serials, overlapping validity) is fixed in the identifier table, then the records are replayed.

## Invalid ID
Empty, only separators, or fails a format check (format `[__]`): reason `invalid_id`.

## Identifier changes over time
- BMS board replaced: close the old `bms_id` row (`valid_to`), open a new one. Readings match by `observed_at` within validity.
- The same BMS ID reused on another battery: allowed only with non-overlapping validity. Overlap = several matches.
- Factory serial is fixed for the battery's life; a correction is a new identifier row, the old one is closed, never edited.

## Measures (shown as data coverage, no targets set)
Share of BMS messages matched, open unmatched IDs, several-match count. Target `[__]`.
