Project: Zero-Config Tree-to-Table Converter (Dual View)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ABOUT

Mengonversi hirarki teks menjadi tabel dinamis dengan deteksi otomatis karakter.
Tanpa konfigurasi — cukup tulis tree, sistem deteksi berjalan otomatis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. INPUT: TREE FORMAT

Aturan penulisan:
- Indentasi tab = kedalaman level
- Node dengan huruf kapital (A-Z) di manapun = node hierarki (baris / folder)
- Node tanpa huruf kapital sama sekali = node konten (kolom attribute)
- Child dari node konten = isi nilai kolom tersebut

Deteksi node type:
- Scan setiap karakter dalam nama node
- Jika ada minimal 1 huruf kapital (A-Z) → node hierarki
- Jika tidak ada huruf kapital sama sekali → node konten
- Contoh hierarki: "Root", "Level 3", "iPhone", "macOS"
- Contoh konten: "software", "kerjaan", "bahasa pemrograman"

Edge cases:
- Tree dengan semua node lowercase → treat as flat list, no hierarchy, langsung jadi tabel 1 kolom
- Node name kosong atau whitespace → skip node tersebut
- Duplicate node names di level sama → append index: "Level 3", "Level 3 (2)", "Level 3 (3)"
- Special characters → escape HTML, preserve in display
- Mixed case mid-word (iPhone, macOS) → tetap dianggap hierarki karena ada kapital

Contoh:

Root 1
    A level 2
        Level 3
            software
                s1
            kerjaan
                k1
    B level 2
        Level 3
            software
                s1
            kerjaan
                k1
Root 2
    B level 2
        Level 3
            software
                s1
            kerjaan
                k1
    B level 2
        Level 3
            Level 4
                software
                    s1
                kerjaan
                    k1
    C level 2
        Level 3
            software
                s1
            kerjaan
                k1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. MODES

─────────────────────────────────────────
Mode A — Full View (Default)
─────────────────────────────────────────
Menampilkan seluruh leaf node sekaligus dalam satu tabel flat.
Kolom hierarki  = max depth seluruh tree (dinamis).
Kolom konten    = semua unique lowercase node di seluruh tree.
Vertical merge  = cell yang share parent yang sama → rowspan ke bawah.
Header          = capitalize first letter dari nama node, fallback "Level N".

Output dari contoh tree di atas:

| Root 1    | A level 2 | Level 3 | Level 4 | Software | Kerjaan |
|-----------|-----------|---------|---------|----------|---------|
| Root 1    | A level 2 | Level 3 | —       | S1       | K1      |
|           | B level 2 | Level 3 | —       | S1       | K1      |
| Root 2    | B level 2 | Level 3 | —       | S1       | K1      |
|           | B level 2 | Level 3 | Level 4 | S1       | K1      |
|           | C level 2 | Level 3 | —       | S1       | K1      |

─────────────────────────────────────────
Mode B — Folder TableView (Drill-down)
─────────────────────────────────────────
Navigasi bertahap seperti file explorer.
Setiap view menampilkan 2 level kapital sekaligus:
- Broot : tampilkan Level 1 + Level 2
- B2    : tampilkan Level 2 + Level 3
- B3    : tampilkan Level 3 + Level 4
- Dst   : terus turun sampai tidak ada lagi child kapital

Kolom konten muncul hanya di level terdalam (ketika child sudah lowercase semua).
Node yang sudah di-navigasi → jadi breadcrumb, bukan kolom lagi.
Header          = capitalize first letter dari nama node itu sendiri.

Contoh navigasi step by step:

Broot — tampilkan Level 1 + Level 2:

| Level 1 | Level 2   |
|---------|-----------|
| Root 1  | A level 2 |
|         | B level 2 |
| Root 2  | B level 2 |
|         | B level 2 |
|         | C level 2 |

B2 — klik "Root 2", tampilkan Level 2 + Level 3:

Breadcrumb: Root 2

| Level 2   | Level 3 |
|-----------|---------|
| B level 2 | Level 3 |
| B level 2 | Level 3 |
| C level 2 | Level 3 |

B3 — klik "B level 2" (yang punya Level 4), tampilkan Level 3 + Level 4 + konten:

Breadcrumb: Root 2 > B level 2

| Level 3 | Level 4 | Software | Kerjaan |
|---------|---------|----------|---------|
| Level 3 | Level 4 | S1       | K1      |

B3 — klik "B level 2" (yang tidak punya Level 4), langsung konten:

Breadcrumb: Root 2 > B level 2

| Level 3 | Software | Kerjaan |
|---------|----------|---------|
| Level 3 | S1       | K1      |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. IMPLEMENTATION RULES

Deteksi kolom:
- Scan seluruh tree saat load, kumpulkan semua unique lowercase node → fixed column list
- Header kolom konten = capitalize first letter dari nama node (software → Software)
- Header kolom hierarki = capitalize first letter dari nama node induknya, fallback "Level N"
- Kolom hierarki dihitung dari max depth kapital di subtree yang sedang aktif

Mode A — rowspan:
- Flatten tree jadi array of leaf rows, tiap row menyimpan full path array
- Group rows by path.slice(0, d+1) per depth d → jumlah group = nilai rowspan
- Row pertama tiap group emit <td rowspan=n>, sisanya skip

Mode B — navigasi & state:
- Simpan full path navigasi sebagai stack, contoh: ["Root 2", "B level 2"]
- Setiap klik kapital → push ke stack, render subtree dari node tersebut
- Back → pop dari stack, render ulang parent
- Breadcrumb = stack.join(" > "), tiap item bisa diklik untuk jump ke level tersebut
- Stop drill-down ketika semua child di level berikutnya adalah lowercase → render tabel konten

Mode B — tampilan per step:
- Setiap step tampilkan tepat 2 kolom hierarki (current level + next level)
- Jika next level sudah lowercase semua → tampilkan 1 kolom hierarki + kolom konten
- Jika node tidak punya child sama sekali → tampilkan baris kosong dengan — di kolom konten

Kolom konten styling:
- Software, Bahasa pemrograman → badge (pill)
- Kolom lowercase lainnya       → plain text

General:
- Search/filter tersedia di kedua mode, filter by nama node atau isi konten
- Tidak ada bold, bullet, atau dekorasi pada konten cell
- Semua header selalu capitalize first letter, tanpa exception

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. PERFORMANCE & OPTIMIZATION

Strategi performa untuk tree besar:

Mode A — Full View:
- Virtualisasi rows jika > 100 rows (render only visible rows)
- Pagination: 50 rows per page dengan navigasi prev/next
- Lazy calculation: Hitung rowspan on-demand saat render
- Debounce search input (300ms delay)

Mode B — Folder TableView:
- Lazy load children: Load subtree hanya saat drill-down
- Cache rendered tables: Simpan hasil render per navigation level
- Breadcrumb limit: Tampilkan max 5 level, sisanya "..." dengan tooltip

General optimization:
- Memoize column detection: Scan tree sekali saat load, cache hasil
- Reuse DOM elements: Update innerHTML instead of recreate
- Throttle resize events (100ms)
- Use CSS containment untuk isolasi render

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6. MOBILE RESPONSIVENESS

Layout mobile (<768px):

Horizontal scroll:
- Table container: overflow-x: auto, -webkit-overflow-scrolling: touch
- Sticky first column: position: sticky, left: 0, z-index: 1
- Shadow indicator: Show shadow saat ada content tersembunyi di kanan

Settings panel:
- Bottom sheet instead of side panel
- Slide up animation dari bawah
- Backdrop overlay (rgba(0,0,0,0.5))
- Swipe down to close

Touch gestures:
- Tap cell: Select/highlight
- Long press (500ms): Show context menu (copy, expand all, collapse all)
- Swipe right on row: Drill-down (Mode B only)
- Swipe left on breadcrumb: Go back

Responsive typography:
- Mobile: 14px font size, 1.6 line height
- Desktop: 13px font size, 1.5 line height
- Touch targets: min 44x44px untuk clickable elements

Compact mode:
- Hide kolom konten yang kosong di semua rows
- Abbreviate long headers: "Software" → "Soft.", "Kerjaan" → "Kerj."
- Show full text on tap/hover

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7. UI/UX LAYOUT

Layout struktur codeblock dengan settings panel:

┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   [ (v) interactive ] [ copy ]  [ ⋯ ] <offset> │
├──────────────────────────────────────────────────────┬──────────────────────────┤
│                                                      │ settings                 │
│  -interactive:true                                   │ ──────────────────────   │
│  -startShowLevel:2                                   │ view mode                │
│  -levelnumbered:2                                    │ [ Tree ▼ ]    ← dropdown │
│                                                      │   • Tree                 │
│                                                      │   • Table FullView       │
│  Root node                                           │   • Table FolderView     │
│  ├── (v) 1.1. Branch A                               │                          │
│  │   ├── 1.1.1. Leaf A1                              │ interactive              │
│  │   └── 1.1.2. Leaf A2                              │ [ ● ON ]      ← toggle   │
│  └── (>) 1.2. Branch B                               │                          │
│                                                      │ start show level         │
│                                                      │ [ − ]   [ 2 ]   [ + ]    │
│                                                      │                          │
│                                                      │ level numbered           │
│                                                      │ [ − ]   [ 2 ]   [ + ]    │
│                                                      │                          │
│                                                      │                          │
└──────────────────────────────────────────────────────┴──────────────────────────┘

Komponen UI:
- Top bar: Label container (kiri), 3 tombol kontrol (kanan dengan offset ke kiri)
  - [ (v) interactive ] - toggle interactive mode
  - [ copy ] - copy button
  - [ ⋯ ] - three dots menu untuk settings (bukan gear icon)
- Split view: Kiri = rendered tree/table, Kanan = settings panel (saat dibuka)
- Settings panel:
  - View mode dropdown (default: Tree)
    - Tree - tampilan tree diagram normal
    - Table Mode A - Full View dengan rowspan
    - Table Mode B - Folder TableView dengan drill-down
  - Interactive toggle (ON/OFF dengan radio button)
  - Start show level spinner (tombol − dan + dengan nilai di tengah)
  - Level numbered spinner (tombol − dan + dengan nilai di tengah)
  - Title text input (input field untuk judul custom)
- Settings panel muncul/hilang saat klik three dots (⋯)
- Settings panel overlay di atas konten (tidak menggeser layout)
- Ketiga tombol kontrol memiliki offset/spacing ke kiri dari edge kanan container