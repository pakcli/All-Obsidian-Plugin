# Tasks: Code Refactoring - Modular Structure

## Phase 1: Preparation and Directory Setup

- [ ] 1.1 Create directory structure
  - [x] 1.1.1 Create `src/models/` directory
  - [x] 1.1.2 Create `src/utils/` directory
  - [x] 1.1.3 Create `src/renderers/` directory
  - [x] 1.1.4 Create `src/accessibility/` directory
  - [x] 1.1.5 Verify all directories are created and empty

- [ ] 1.2 Backup current state
  - [ ] 1.2.1 Commit all current changes to git
  - [ ] 1.2.2 Create backup branch for rollback if needed
  - [ ] 1.2.3 Verify build succeeds before refactoring

## Phase 2: Extract Utility Modules from util.ts

- [x] 2.1 Create parser module
  - [ ] 2.1.1 Create `utils/parser.ts` file
  - [ ] 2.1.2 Copy `TreeConfig` interface to parser.ts
  - [ ] 2.1.3 Copy `ParseResult` interface to parser.ts
  - [ ] 2.1.4 Copy `parseLineOutput` interface to parser.ts
  - [ ] 2.1.5 Copy `parseConfig` function to parser.ts
  - [ ] 2.1.6 Copy `parseLine` function to parser.ts
  - [ ] 2.1.7 Copy `parseInput` function to parser.ts
  - [ ] 2.1.8 Copy `parseMultiInput` function to parser.ts
  - [ ] 2.1.9 Copy `parseWithConfig` function to parser.ts
  - [ ] 2.1.10 Copy `buildTabTree` function to parser.ts
  - [ ] 2.1.11 Add necessary imports (TreeNode, WikiLink, TFolder)
  - [ ] 2.1.12 Export all functions and interfaces
  - [ ] 2.1.13 Verify parser.ts compiles without errors

- [ ] 2.2 Create tree formatter module
  - [ ] 2.2.1 Create `utils/treeFormatter.ts` file
  - [ ] 2.2.2 Copy ASCII constants (EDGE, CORNER, LINE, BLANK) to treeFormatter.ts
  - [ ] 2.2.3 Copy `treeView` function to treeFormatter.ts
  - [ ] 2.2.4 Add necessary imports (TreeNode)
  - [ ] 2.2.5 Export `treeView` function
  - [ ] 2.2.6 Verify treeFormatter.ts compiles without errors

- [ ] 2.3 Create clipboard module
  - [ ] 2.3.1 Create `utils/clipboard.ts` file
  - [ ] 2.3.2 Copy electron clipboard initialization code to clipboard.ts
  - [ ] 2.3.3 Copy `copyToClipboard` function to clipboard.ts
  - [ ] 2.3.4 Export `copyToClipboard` function
  - [ ] 2.3.5 Verify clipboard.ts compiles without errors

## Phase 3: Create Shared Rendering Utilities

- [ ] 3.1 Create rendering utilities module
  - [ ] 3.1.1 Create `utils/rendering.ts` file
  - [ ] 3.1.2 Extract `parseWikilinks` function from TableModeA.ts
  - [ ] 3.1.3 Copy `enableWikiLinks` function from util.ts to rendering.ts
  - [ ] 3.1.4 Create `renderContentCell` helper function
    - [ ] 3.1.4.1 Function accepts `values: string[]` parameter
    - [ ] 3.1.4.2 Function creates HTMLTableCellElement
    - [ ] 3.1.4.3 Function iterates through values
    - [ ] 3.1.4.4 Function calls parseWikilinks for each value
    - [ ] 3.1.4.5 Function adds `<br>` between values
    - [ ] 3.1.4.6 Function returns cell element
  - [ ] 3.1.5 Export all functions
  - [ ] 3.1.6 Verify rendering.ts compiles without errors

## Phase 4: Migrate Table Analysis Module

- [ ] 4.1 Create table analysis module
  - [ ] 4.1.1 Create `utils/tableAnalysis.ts` file
  - [ ] 4.1.2 Copy `TableDetector` class from TableDetector.ts
  - [ ] 4.1.3 Extract `extractContent` function from TableModeB.ts
    - [ ] 4.1.3.1 Copy extractContent logic from TableModeB
    - [ ] 4.1.3.2 Make it a standalone function
    - [ ] 4.1.3.3 Ensure it handles wikilinks correctly
    - [ ] 4.1.3.4 Ensure it returns Map<string, string[]>
  - [ ] 4.1.4 Add necessary imports (TreeNode)
  - [ ] 4.1.5 Export TableDetector class and extractContent function
  - [ ] 4.1.6 Verify tableAnalysis.ts compiles without errors

## Phase 5: Refactor Table Renderers

- [ ] 5.1 Create and refactor TableFullRenderer
  - [ ] 5.1.1 Create `renderers/TableFullRenderer.ts` file
  - [ ] 5.1.2 Copy TableModeA class to new file
  - [ ] 5.1.3 Rename class from `TableModeA` to `TableFullRenderer`
  - [ ] 5.1.4 Remove `parseWikilinks` method from class
  - [ ] 5.1.5 Add import for `parseWikilinks` from `utils/rendering`
  - [ ] 5.1.6 Update all calls to `this.parseWikilinks` to use imported function
  - [ ] 5.1.7 Add import for `TableDetector` from `utils/tableAnalysis`
  - [ ] 5.1.8 Add import for `TreeNode` from `models/TreeNode`
  - [ ] 5.1.9 Export `TableFullRenderer` class
  - [ ] 5.1.10 Verify TableFullRenderer.ts compiles without errors

- [ ] 5.2 Create and refactor TableFolderRenderer
  - [ ] 5.2.1 Create `renderers/TableFolderRenderer.ts` file
  - [ ] 5.2.2 Copy TableModeB class to new file
  - [ ] 5.2.3 Rename class from `TableModeB` to `TableFolderRenderer`
  - [ ] 5.2.4 Remove `parseWikilinks` method from class
  - [ ] 5.2.5 Add import for `parseWikilinks` from `utils/rendering`
  - [ ] 5.2.6 Update all calls to `this.parseWikilinks` to use imported function
  - [ ] 5.2.7 Remove `extractContent` method from class
  - [ ] 5.2.8 Add import for `extractContent` from `utils/tableAnalysis`
  - [ ] 5.2.9 Update all calls to `this.extractContent` to use imported function
  - [ ] 5.2.10 Add import for `TableDetector` from `utils/tableAnalysis`
  - [ ] 5.2.11 Add import for `TreeNode` from `models/TreeNode`
  - [ ] 5.2.12 Export `TableFolderRenderer` class
  - [ ] 5.2.13 Verify TableFolderRenderer.ts compiles without errors

## Phase 6: Refactor Main Diagram Renderer

- [ ] 6.1 Create and refactor DiagramRenderer
  - [ ] 6.1.1 Create `renderers/DiagramRenderer.ts` file
  - [ ] 6.1.2 Copy TreeDiagramMarkdownRenderChild class to new file
  - [ ] 6.1.3 Rename class from `TreeDiagramMarkdownRenderChild` to `DiagramRenderer`
  - [ ] 6.1.4 Update import for `parseWithConfig` from `utils/parser`
  - [ ] 6.1.5 Update import for `treeView` from `utils/treeFormatter`
  - [ ] 6.1.6 Update import for `copyToClipboard` from `utils/clipboard`
  - [ ] 6.1.7 Update import for `enableWikiLinks` from `utils/rendering`
  - [ ] 6.1.8 Update import for `TreeNode` from `models/TreeNode`
  - [ ] 6.1.9 Update import for `TableFullRenderer` from `renderers/TableFullRenderer`
  - [ ] 6.1.10 Update import for `TableFolderRenderer` from `renderers/TableFolderRenderer`
  - [ ] 6.1.11 Update all references to `TableModeA` to `TableFullRenderer`
  - [ ] 6.1.12 Update all references to `TableModeB` to `TableFolderRenderer`
  - [ ] 6.1.13 Export `DiagramRenderer` class
  - [ ] 6.1.14 Verify DiagramRenderer.ts compiles without errors

## Phase 7: Migrate Model and Accessibility Modules

- [ ] 7.1 Move TreeNode model
  - [ ] 7.1.1 Create `models/TreeNode.ts` file
  - [ ] 7.1.2 Copy `WikiLink` interface from node.ts
  - [ ] 7.1.3 Copy `TreeNode` class from node.ts
  - [ ] 7.1.4 Export `WikiLink` interface and `TreeNode` class as default
  - [ ] 7.1.5 Verify TreeNode.ts compiles without errors

- [ ] 7.2 Move accessibility modules
  - [ ] 7.2.1 Create `accessibility/MobileDetector.ts` file
  - [ ] 7.2.2 Copy MobileDetector class from src/MobileDetector.ts
  - [ ] 7.2.3 Export MobileDetector class
  - [ ] 7.2.4 Verify MobileDetector.ts compiles without errors
  - [ ] 7.2.5 Create `accessibility/TouchHandler.ts` file
  - [ ] 7.2.6 Copy TouchHandler class from src/TouchHandler.ts
  - [ ] 7.2.7 Export TouchHandler class
  - [ ] 7.2.8 Verify TouchHandler.ts compiles without errors

## Phase 8: Update Main Plugin File

- [ ] 8.1 Update main.ts imports
  - [ ] 8.1.1 Update import for `DiagramRenderer` from `renderers/DiagramRenderer`
  - [ ] 8.1.2 Update class name in registerMarkdownCodeBlockProcessor from `TreeDiagramMarkdownRenderChild` to `DiagramRenderer`
  - [ ] 8.1.3 Update any other imports if needed (MobileDetector, TouchHandler)
  - [ ] 8.1.4 Verify main.ts compiles without errors

## Phase 9: Update All Import Statements

- [ ] 9.1 Update imports in all new files
  - [ ] 9.1.1 Verify all imports in `utils/parser.ts` are correct
  - [ ] 9.1.2 Verify all imports in `utils/treeFormatter.ts` are correct
  - [ ] 9.1.3 Verify all imports in `utils/clipboard.ts` are correct
  - [ ] 9.1.4 Verify all imports in `utils/rendering.ts` are correct
  - [ ] 9.1.5 Verify all imports in `utils/tableAnalysis.ts` are correct
  - [ ] 9.1.6 Verify all imports in `renderers/TableFullRenderer.ts` are correct
  - [ ] 9.1.7 Verify all imports in `renderers/TableFolderRenderer.ts` are correct
  - [ ] 9.1.8 Verify all imports in `renderers/DiagramRenderer.ts` are correct
  - [ ] 9.1.9 Verify all imports in `models/TreeNode.ts` are correct
  - [ ] 9.1.10 Verify all imports in `accessibility/MobileDetector.ts` are correct
  - [ ] 9.1.11 Verify all imports in `accessibility/TouchHandler.ts` are correct

## Phase 10: Build and Test

- [ ] 10.1 Build verification
  - [ ] 10.1.1 Run `npm run build`
  - [ ] 10.1.2 Verify build succeeds without errors
  - [ ] 10.1.3 Verify main.js is generated
  - [ ] 10.1.4 Verify bundle size decreased by 10-15KB

- [ ] 10.2 Manual testing
  - [ ] 10.2.1 Copy plugin files to Obsidian test vault
  - [ ] 10.2.2 Reload Obsidian
  - [ ] 10.2.3 Test tree view rendering
  - [ ] 10.2.4 Test interactive mode (expand/collapse)
  - [ ] 10.2.5 Test table full view
  - [ ] 10.2.6 Test table folder view with navigation
  - [ ] 10.2.7 Test wikilink click behavior
  - [ ] 10.2.8 Test wikilink hover preview
  - [ ] 10.2.9 Test copy to clipboard
  - [ ] 10.2.10 Test settings panel
  - [ ] 10.2.11 Test all configuration flags
  - [ ] 10.2.12 Verify no console errors

## Phase 11: Cleanup Old Files

- [ ] 11.1 Delete old files
  - [ ] 11.1.1 Delete `src/util.ts`
  - [ ] 11.1.2 Delete `src/TableModeA.ts`
  - [ ] 11.1.3 Delete `src/TableModeB.ts`
  - [ ] 11.1.4 Delete `src/TableDetector.ts`
  - [ ] 11.1.5 Delete `src/TreeDiagramMarkdownRenderChild.ts`
  - [ ] 11.1.6 Delete `src/node.ts`
  - [ ] 11.1.7 Delete `src/MobileDetector.ts` (if moved)
  - [ ] 11.1.8 Delete `src/TouchHandler.ts` (if moved)

- [ ] 11.2 Final verification
  - [ ] 11.2.1 Run `npm run build` again
  - [ ] 11.2.2 Verify no broken imports
  - [ ] 11.2.3 Verify build succeeds
  - [ ] 11.2.4 Run ESLint to check for errors
  - [ ] 11.2.5 Verify no TypeScript errors

## Phase 12: Documentation and Finalization

- [ ] 12.1 Update documentation
  - [ ] 12.1.1 Update README.md if it references old file structure
  - [ ] 12.1.2 Update code comments for moved functions
  - [ ] 12.1.3 Verify JSDoc comments are preserved
  - [ ] 12.1.4 Update import examples in comments

- [ ] 12.2 Code quality checks
  - [ ] 12.2.1 Run ESLint and fix any warnings
  - [ ] 12.2.2 Remove any console.log statements
  - [ ] 12.2.3 Verify no debug code left
  - [ ] 12.2.4 Check for unused imports

- [ ] 12.3 Final testing
  - [ ] 12.3.1 Test all functionality one more time
  - [ ] 12.3.2 Verify performance is unchanged or improved
  - [ ] 12.3.3 Check bundle size reduction
  - [ ] 12.3.4 Verify no memory leaks

- [ ] 12.4 Git commit
  - [ ] 12.4.1 Stage all changes
  - [ ] 12.4.2 Create commit with descriptive message
  - [ ] 12.4.3 Verify git history is clean
  - [ ] 12.4.4 Push to repository

## Success Criteria

### Quantitative Metrics
- ✓ Code duplication reduced from 80 lines to 0
- ✓ No file exceeds 400 lines
- ✓ Total codebase reduced by 400-500 lines (22%)
- ✓ Module count increased from 8 to 13 files
- ✓ Build success rate: 100%
- ✓ Bundle size decreased by 10-15KB

### Qualitative Metrics
- ✓ Clear separation of concerns achieved
- ✓ Each module has single responsibility
- ✓ No circular dependencies
- ✓ Code is easier to navigate and maintain
- ✓ All functionality preserved
- ✓ No user-visible behavior changes

## Rollback Plan

If issues are encountered:
1. Checkout backup branch created in Phase 1
2. Investigate issues
3. Fix problems in new branch
4. Retry refactoring with fixes applied

## Notes

- This refactoring should be completed in a single atomic change
- All tests must pass before and after refactoring
- Use git mv where possible to preserve file history
- Keep backup branch until refactoring is verified in production
- Consider creating a feature flag to toggle between old and new code if needed for gradual rollout
