# Table View Test

## Example 1: Basic Tree with Content Columns

```tree
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
```

## Example 2: Simple Project Structure

```tree
Frontend
	Components
		software
			React
		bahasa pemrograman
			TypeScript
	Styles
		software
			CSS
Backend
	API
		software
			Node.js
		bahasa pemrograman
			JavaScript
	Database
		software
			PostgreSQL
```

## Example 3: Mixed Case Detection

```tree
iPhone Development
	iOS Apps
		software
			Swift
		kerjaan
			Mobile Dev
macOS Development
	Desktop Apps
		software
			SwiftUI
		kerjaan
			Desktop Dev
```

## Instructions

1. Open this file in Obsidian with the Tree Diagram plugin installed
2. Click the **three dots (⋯)** button in the top-right corner
3. Select **View Mode** dropdown
4. Try switching between:
   - **Tree** - Normal tree diagram view
   - **Table FullView** - Flat table with rowspan
   - **Table FolderView** - Drill-down navigation

## Expected Behavior

### Tree Mode
- Shows ASCII tree diagram with branches
- Interactive toggles if enabled
- Hierarchical numbering if configured

### Table FullView (Mode A)
- All leaf nodes in one flat table
- Vertical merging (rowspan) for shared parents
- Content columns: software, kerjaan, bahasa pemrograman
- Empty cells show "—"

### Table FolderView (Mode B)
- Shows 2 hierarchy levels at a time
- Click cells to drill down
- Breadcrumb navigation at top
- Content columns appear at deepest level
