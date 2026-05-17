# Requirements Document: Code Refactoring - Modular Structure

## 1. Functional Requirements

### 1.1 Directory Structure Creation
**Description**: Create new directory structure to organize code by responsibility

**Acceptance Criteria**:
- [ ] `src/models/` directory exists
- [ ] `src/utils/` directory exists
- [ ] `src/renderers/` directory exists
- [ ] `src/accessibility/` directory exists
- [ ] All directories are empty and ready to receive files

**Priority**: High
**Dependencies**: None

---

### 1.2 Parser Module Extraction
**Description**: Extract parsing functionality from util.ts into dedicated parser module

**Acceptance Criteria**:
- [ ] `utils/parser.ts` file created
- [ ] `parseConfig` function moved and working
- [ ] `parseLine` function moved and working
- [ ] `parseInput` function moved and working
- [ ] `parseMultiInput` function moved and working
- [ ] `parseWithConfig` function moved and working
- [ ] `buildTabTree` function moved and working
- [ ] `TreeConfig` interface moved to parser.ts
- [ ] `ParseResult` interface moved to parser.ts
- [ ] All functions maintain original behavior
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1

---

### 1.3 Tree Formatter Module Extraction
**Description**: Extract tree formatting functionality from util.ts into dedicated formatter module

**Acceptance Criteria**:
- [ ] `utils/treeFormatter.ts` file created
- [ ] `treeView` function moved and working
- [ ] Function maintains original behavior with all parameters
- [ ] ASCII characters (EDGE, CORNER, LINE, BLANK) preserved
- [ ] Interactive mode functionality preserved
- [ ] Numbering functionality preserved
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1

---

### 1.4 Clipboard Module Extraction
**Description**: Extract clipboard functionality from util.ts into dedicated clipboard module

**Acceptance Criteria**:
- [ ] `utils/clipboard.ts` file created
- [ ] `copyToClipboard` function moved and working
- [ ] Electron clipboard fallback preserved
- [ ] Browser clipboard API preserved
- [ ] Function returns boolean success indicator
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1

---

### 1.5 Rendering Utilities Module Creation
**Description**: Create new shared rendering utilities module to eliminate code duplication

**Acceptance Criteria**:
- [ ] `utils/rendering.ts` file created
- [ ] `parseWikilinks` function extracted from TableModeA
- [ ] `enableWikiLinks` function moved from util.ts
- [ ] `renderContentCell` function created (new helper)
- [ ] `parseWikilinks` handles `[[target|alias]]` format
- [ ] `parseWikilinks` handles `[[target]]` format
- [ ] `parseWikilinks` returns DocumentFragment
- [ ] `enableWikiLinks` sets up click handlers
- [ ] `enableWikiLinks` sets up hover preview
- [ ] `renderContentCell` handles multiple values with `<br>` separators
- [ ] All wikilink rendering behavior preserved

**Priority**: High
**Dependencies**: 1.1

---

### 1.6 Table Analysis Module Migration
**Description**: Move and enhance TableDetector into utils directory

**Acceptance Criteria**:
- [ ] `utils/tableAnalysis.ts` file created
- [ ] `TableDetector` class moved from TableDetector.ts
- [ ] All static methods preserved: `hasCapital`, `isHierarchical`, `isContentColumn`, `collectContentColumns`, `getMaxHierarchicalDepth`, `capitalizeFirst`, `handleDuplicates`, `escapeHtml`
- [ ] `extractContent` function added (extracted from table renderers)
- [ ] `extractContent` handles wikilinks correctly
- [ ] `extractContent` handles plain text correctly
- [ ] `extractContent` returns Map<string, string[]>
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1

---

### 1.7 Table Full Renderer Refactoring
**Description**: Rename and refactor TableModeA to use shared utilities

**Acceptance Criteria**:
- [ ] `renderers/TableFullRenderer.ts` file created
- [ ] Class renamed from `TableModeA` to `TableFullRenderer`
- [ ] Duplicated `parseWikilinks` method removed
- [ ] Uses `parseWikilinks` from `utils/rendering.ts`
- [ ] Uses `renderContentCell` from `utils/rendering.ts` (or equivalent)
- [ ] All table rendering functionality preserved
- [ ] Rowspan calculation preserved
- [ ] Leaf path flattening preserved
- [ ] Wikilink rendering works correctly
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1, 1.5, 1.6

---

### 1.8 Table Folder Renderer Refactoring
**Description**: Rename and refactor TableModeB to use shared utilities

**Acceptance Criteria**:
- [ ] `renderers/TableFolderRenderer.ts` file created
- [ ] Class renamed from `TableModeB` to `TableFolderRenderer`
- [ ] Duplicated `parseWikilinks` method removed
- [ ] Uses `parseWikilinks` from `utils/rendering.ts`
- [ ] Uses `renderContentCell` from `utils/rendering.ts` (or equivalent)
- [ ] Uses `extractContent` from `utils/tableAnalysis.ts`
- [ ] All table rendering functionality preserved
- [ ] Navigation stack functionality preserved
- [ ] Breadcrumb rendering preserved
- [ ] Drill-down navigation preserved
- [ ] Wikilink rendering works correctly
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1, 1.5, 1.6

---

### 1.9 Diagram Renderer Refactoring
**Description**: Rename and refactor TreeDiagramMarkdownRenderChild

**Acceptance Criteria**:
- [ ] `renderers/DiagramRenderer.ts` file created
- [ ] Class renamed from `TreeDiagramMarkdownRenderChild` to `DiagramRenderer`
- [ ] All orchestration logic preserved
- [ ] View mode switching preserved
- [ ] Settings panel functionality preserved
- [ ] Interactive mode preserved
- [ ] Copy functionality preserved
- [ ] Uses parser from `utils/parser.ts`
- [ ] Uses formatter from `utils/treeFormatter.ts`
- [ ] Uses clipboard from `utils/clipboard.ts`
- [ ] Uses rendering utilities from `utils/rendering.ts`
- [ ] Uses table renderers from `renderers/`
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8

---

### 1.10 TreeNode Model Migration
**Description**: Move TreeNode model to models directory

**Acceptance Criteria**:
- [ ] `models/TreeNode.ts` file created
- [ ] `TreeNode` class moved from node.ts
- [ ] `WikiLink` interface moved from node.ts
- [ ] All class methods preserved
- [ ] All properties preserved
- [ ] All imports updated correctly

**Priority**: High
**Dependencies**: 1.1

---

### 1.11 Accessibility Modules Migration
**Description**: Move accessibility modules to dedicated directory

**Acceptance Criteria**:
- [ ] `accessibility/MobileDetector.ts` file created
- [ ] `MobileDetector` class moved from src/MobileDetector.ts
- [ ] All functionality preserved
- [ ] `accessibility/TouchHandler.ts` file created
- [ ] `TouchHandler` class moved from src/TouchHandler.ts
- [ ] All functionality preserved
- [ ] All imports updated correctly

**Priority**: Medium
**Dependencies**: 1.1

---

### 1.12 Main Plugin Import Updates
**Description**: Update main.ts to use new module structure

**Acceptance Criteria**:
- [ ] Import statement for `DiagramRenderer` updated
- [ ] Import path points to `renderers/DiagramRenderer`
- [ ] Plugin registration uses `DiagramRenderer` class name
- [ ] All functionality preserved
- [ ] Plugin loads correctly

**Priority**: High
**Dependencies**: 1.9

---

### 1.13 Old File Cleanup
**Description**: Remove old files after successful migration

**Acceptance Criteria**:
- [ ] `src/util.ts` deleted
- [ ] `src/TableModeA.ts` deleted
- [ ] `src/TableModeB.ts` deleted
- [ ] `src/TableDetector.ts` deleted
- [ ] `src/TreeDiagramMarkdownRenderChild.ts` deleted
- [ ] `src/node.ts` deleted
- [ ] `src/MobileDetector.ts` deleted (if moved)
- [ ] `src/TouchHandler.ts` deleted (if moved)
- [ ] No broken imports remain
- [ ] Build succeeds

**Priority**: High
**Dependencies**: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12

---

## 2. Non-Functional Requirements

### 2.1 Code Quality
**Description**: Maintain or improve code quality metrics

**Acceptance Criteria**:
- [ ] No ESLint errors introduced
- [ ] No TypeScript compilation errors
- [ ] All existing type safety preserved
- [ ] Code follows existing style conventions
- [ ] No console.log or debug statements left in code

**Priority**: High

---

### 2.2 Performance
**Description**: Ensure no performance degradation

**Acceptance Criteria**:
- [ ] Build time increase < 5%
- [ ] Runtime performance unchanged or improved
- [ ] Bundle size decreased by 10-15KB
- [ ] No memory leaks introduced
- [ ] Tree rendering speed unchanged

**Priority**: High

---

### 2.3 Maintainability
**Description**: Improve code maintainability

**Acceptance Criteria**:
- [ ] Each module has single responsibility
- [ ] No circular dependencies exist
- [ ] Module boundaries are clear
- [ ] Code duplication eliminated (parseWikilinks exists in one place only)
- [ ] File sizes reduced (no file > 400 lines)
- [ ] Total lines of code reduced by 400-500 lines

**Priority**: High

---

### 2.4 Backward Compatibility
**Description**: Maintain complete backward compatibility

**Acceptance Criteria**:
- [ ] All existing functionality preserved
- [ ] No user-visible behavior changes
- [ ] All configuration flags work identically
- [ ] All view modes work identically
- [ ] Wikilink behavior unchanged
- [ ] Interactive mode behavior unchanged
- [ ] Copy functionality unchanged

**Priority**: Critical

---

### 2.5 Build System Compatibility
**Description**: Ensure compatibility with existing build system

**Acceptance Criteria**:
- [ ] `npm run build` succeeds
- [ ] `npm run dev` succeeds
- [ ] esbuild configuration unchanged (or updated if needed)
- [ ] Output files (main.js, manifest.json, styles.css) generated correctly
- [ ] Plugin loads in Obsidian without errors

**Priority**: Critical

---

### 2.6 Documentation
**Description**: Update documentation to reflect new structure

**Acceptance Criteria**:
- [ ] README.md updated if it references old file structure
- [ ] Code comments updated for moved functions
- [ ] JSDoc comments preserved for all public functions
- [ ] Import examples in comments updated

**Priority**: Medium

---

## 3. Constraints

### 3.1 Technical Constraints
- Must maintain compatibility with Obsidian plugin API
- Must use TypeScript
- Must use esbuild for bundling
- Must not introduce new external dependencies
- Must preserve all existing functionality

### 3.2 Project Constraints
- Refactoring must be completed in single atomic change
- All tests must pass before and after refactoring
- No breaking changes to public API
- Must maintain git history for moved files (use git mv where possible)

---

## 4. Assumptions

1. Current codebase has no uncommitted changes
2. Build system is functional before refactoring
3. No other developers are actively working on conflicting changes
4. All existing functionality is working correctly
5. TypeScript and esbuild are properly configured

---

## 5. Success Metrics

### Quantitative Metrics
- **Code Duplication**: Reduce from 80 duplicated lines to 0
- **File Size**: No file exceeds 400 lines (currently util.ts is 500, TreeDiagramMarkdownRenderChild.ts is 600)
- **Total Lines**: Reduce total codebase by 400-500 lines (22% reduction)
- **Module Count**: Increase from 8 files to 13 files (better organization)
- **Build Success**: 100% build success rate
- **Test Pass Rate**: 100% (if tests exist)

### Qualitative Metrics
- **Code Organization**: Clear separation of concerns
- **Maintainability**: Easier to locate and modify specific functionality
- **Readability**: Smaller, focused modules are easier to understand
- **Extensibility**: New features easier to add without modifying multiple files

---

## 6. Out of Scope

The following are explicitly **not** included in this refactoring:

1. Adding new features or functionality
2. Changing user-facing behavior
3. Modifying CSS styles
4. Updating Obsidian plugin manifest
5. Adding new dependencies
6. Refactoring CSS or styles.css
7. Changing build configuration (unless required for new structure)
8. Adding new tests (though existing tests must pass)
9. Performance optimizations beyond duplication elimination
10. Changing data structures or algorithms
