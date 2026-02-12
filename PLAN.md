# Plan: Attendance-Based Transport & Zoom Allowance System

## Business Logic

### 1. Uang Transport (Saturday Attendance)
- Rate: configurable per batch (default Rp 25.000/Sabat)
- Each month has N Saturdays (configurable per batch)
- Each person attends 0 to N Saturdays
- `transport = rate × sabat_hadir`

### 2. Uang Zoom
- Configurable rates per batch (default: single=50.000, family=30.000)
- Not everyone gets zoom
- **Single person** (no family in the list): gets single rate (e.g., 50k)
- **Family member** (has family group): each member gets family rate (e.g., 30k each)
- Family grouping defined in Recipients using `family_group_id`

### Total: `amount = (transport_rate × sabat_hadir) + zoom_amount`

---

## Data Model Changes

### Recipients table — add:
```sql
family_group_id  INTEGER  -- NULL = no family group (single if zoom eligible)
                          -- Same ID = same family (auto-set to 'family' rate)
zoom_eligible    INTEGER DEFAULT 1  -- default: eligible for zoom
```

### Batches table — add:
```sql
total_saturdays    INTEGER DEFAULT 4    -- how many Saturdays this month
transport_rate     INTEGER DEFAULT 25000  -- per Saturday
zoom_single_rate   INTEGER DEFAULT 50000  -- for single person
zoom_family_rate   INTEGER DEFAULT 30000  -- per family member
```

### Batch Items table — add:
```sql
saturdays_attended  INTEGER DEFAULT 0   -- 0 to total_saturdays
zoom_type           TEXT DEFAULT 'none' -- 'none' | 'single' | 'family'
                                        -- auto-set from recipient data, overridable
```

`amount` = auto-calculated from the formula above.

---

## UI Design

### A. Recipients Page — Family Grouping
- Add a "Family Group" column
- Group management: Select 2+ recipients → "Buat Grup Keluarga"
- Visual: family members show a colored tag (e.g., "👨‍👩‍👧 Keluarga 1")
- Also add zoom_eligible toggle per recipient

### B. Batch Creation Dialog
- Name, Description (existing)
- **Jumlah Sabat bulan ini**: number input (1-5)
- **Rate Transport/Sabat**: Rp 25.000 (editable)
- **Rate Zoom Sendiri**: Rp 50.000 (editable)
- **Rate Zoom Keluarga**: Rp 30.000 (editable)
- Live preview: "Contoh: Hadir 5 Sabat + Zoom sendiri = Rp 175.000"

### C. Checklist Table (Desktop)
```
# | Penerima         | Rek. Tujuan    | Sabat     | Zoom       | Total      | ✓ | WA
1 | Andreas          | BRI 2010...    | ●●●○○ 3/5 | 👤 Rp 50k  | Rp 125.000 | ✅ | WA
2 | Tirto Margono    | Dana 6281...   | ●●●●● 5/5 | 👨‍👩‍👧 Rp 30k | Rp 155.000 | ✅ | WA
3 | Hellena          | → Tirto        | ●●●●○ 4/5 | 👨‍👩‍👧 Rp 30k | Rp 130.000 | ☐ | WA
4 | Novi             | -              | ●●○○○ 2/5 | —          | Rp 50.000  | ☐ | WA
```

**Sabat column**: Clickable dots (●/○). Click a dot = toggle that Saturday.
- Number of dots = batch.total_saturdays
- Shows "3/5" count next to dots
- Quick: shift+click first dot = fill all / clear all

**Zoom column**: Click to cycle: none → single → family → none
- Auto-defaults from recipient data (family_group_id + zoom_eligible)
- Icon + rate shown
- Family members highlighted with same color tag

**Total**: Read-only, auto-calculated

**Merged Transfer+Notif into one ✓ column** — simplify: single checkbox for "transferred", notif status tracked separately after WA click.

### D. Checklist Table (Mobile Card)
```
┌─────────────────────────────┐
│ 1. Andreas                   │
│    BRI 201001005188539        │
│                               │
│  Sabat: ●●●○○  3/5           │
│  Zoom:  👤 Sendiri  Rp 50.000 │
│  ─────────────────────        │
│  Total: Rp 125.000            │
│                               │
│  [✓ Transfer] [○ Notif] [WA] │
└─────────────────────────────┘
```

### E. Stat Cards (top of checklist page)
1. **Total Penerima**: 26 orang · Total Rp X.XXX.XXX
2. **Kehadiran**: Rata-rata 3.8/5 Sabat (76%)
3. **Transfer**: 20/26 (progress bar)
4. **Notifikasi WA**: 5/26 (progress bar)

### F. Bulk Actions
- "Set semua hadir penuh" (set all to max Saturdays)
- "Tandai semua transfer" (existing)
- Per-Saturday quick-set: "Set Sabat ke-3: hadir semua" (optional, future)

### G. WhatsApp Message Update
```
Halo Andreas, dana Tuli EFATA bulan ini:
- Transport 3 Sabat × Rp 25.000 = Rp 75.000
- Zoom (sendiri) = Rp 50.000
- Total: Rp 125.000
sudah ditransfer ke rekening Anda. Mohon dicek. Terima kasih. GBU
```

---

## Implementation Steps

### Step 1: Schema & Types
- Add columns to `recipients`, `batches`, `batch_items` tables (ALTER TABLE for migration)
- Update TypeScript interfaces
- Add `family_groups` concept (using family_group_id on recipients)

### Step 2: Database Layer (`db.ts`)
- Migration logic for new columns
- Update all prepared statements
- Add family group queries
- Auto-calculate amount on item update

### Step 3: API Endpoints
- Update `POST/PUT /api/batches` for new fields
- Update `PUT /api/batches/[id]/items/[itemId]` to accept saturdays_attended, zoom_type and auto-calc amount
- Add `POST /api/batches/[id]/bulk-saturdays` for bulk Saturday update
- Update `POST /api/batches/[id]/populate` to auto-set zoom_type from recipient data
- Update `/api/recipients` for family_group_id, zoom_eligible

### Step 4: New Components
- `SaturdayDots.svelte` — clickable dot row for Saturday attendance
- `ZoomBadge.svelte` — click-to-cycle zoom type badge

### Step 5: Update Batch Creation (`BatchList.svelte`)
- Add total_saturdays, transport_rate, zoom rates to form
- Live calculation preview

### Step 6: Update Checklist (`BatchChecklist.svelte`)
- New table columns: Sabat, Zoom, Total (replacing single Jumlah)
- Integrate SaturdayDots and ZoomBadge components
- Auto-recalculate total on change
- Update mobile card view
- Update stat cards with attendance info
- Add "Set semua hadir penuh" bulk action

### Step 7: Update Recipients Page
- Add family group management UI
- Add zoom_eligible toggle
- Show family group tags

### Step 8: Update WhatsApp Message (`format.ts`)
- Include breakdown in message
- Update `generateWhatsAppMessage` to accept transport + zoom details

### Step 9: Cleanup
- Remove manual amount editing (now auto-calculated)
- Update seed data for testing
- Test all flows end-to-end
