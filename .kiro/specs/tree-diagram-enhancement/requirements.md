# Requirements Document: Tree Diagram Plugin

## Introduction

This document specifies the requirements for an Obsidian plugin that renders hierarchical tree diagrams from indented text within code blocks. The plugin parses tab-indented or space-indented text, constructs a tree structure, and renders it using ASCII art with clickable wikilink support. The plugin also provides commands to generate tree source text from vault folder structures.

## Glossary

- **Tree_Diagram_Plugin**: The Obsidian plugin system that manages tree rendering and vault structure commands
- **Parser**: The component that converts indented text into a tree node structure
- **Renderer**: The component that converts tree node structures into ASCII art visualization
- **Tree_Node**: A data structure representing a single node in the tree hierarchy
- **Wikilink**: An Obsidian internal link in the format `[[target]]` or `[[target|alias]]`
- **Vault**: The Obsidian workspace containing folders and files
- **Code_Block**: A markdown code block with language identifier `tree`
- **Indentation_Unit**: Two spaces or one tab character representing one level of hierarchy
- **ASCII_Symbols**: The characters used for tree visualization: `├──`, `└──`, `│`, and four spaces
- **Clipboard_Manager**: The component that handles copying text to the system clipboard
- **Link_Handler**: The component that makes wikilinks clickable and navigable

## Requirements

### Requirement 1: Parse Indented Text into Tree Structure

**User Story:** As a developer, I want to parse indented text into a tree node structure, so that I can render hierarchical diagrams from simple text input.

#### Acceptance Criteria

1. WHEN a line contains leading whitespace, THE Parser SHALL calculate the depth by dividing the whitespace length by 2 (treating tabs as 2 spaces)
2. WHEN a line contains a wikilink in format `[[target|alias]]`, THE Parser SHALL extract both target and alias into a link object
3. WHEN a line contains a wikilink in format `[[target]]`, THE Parser SHALL extract the target and use it as both target and alias
4. WHEN a line contains both a wikilink and additional text, THE Parser SHALL remove the wikilink portion and use the remaining text as the node name
5. WHEN a line contains only a wikilink with no additional text, THE Parser SHALL use the alias as the node name
6. WHEN a node depth is greater than the previous node depth, THE Parser SHALL add the new node as a child of the previous node
7. WHEN a node depth equals the previous node depth, THE Parser SHALL add the new node as a sibling of the previous node
8. WHEN a node depth is less than the previous node depth, THE Parser SHALL traverse up the tree to find the appropriate parent and add the new node there
9. WHEN the last child is added to a parent node, THE Parser SHALL mark the previous last child as not last and mark the new child as last
10. FOR ALL valid tree structures, parsing the text SHALL produce a tree where each node correctly references its parent and children

### Requirement 2: Render Tree Structure as ASCII Art

**User Story:** As a user, I want to see tree structures rendered with ASCII art, so that I can visualize hierarchical relationships clearly.

#### Acceptance Criteria

1. WHEN rendering the root node, THE Renderer SHALL display only the node name without any ASCII symbols
2. WHEN rendering a non-root node that is the last child, THE Renderer SHALL prefix the node with `└── `
3. WHEN rendering a non-root node that is not the last child, THE Renderer SHALL prefix the node with `├── `
4. WHEN rendering a node with ancestors that are not last children, THE Renderer SHALL add `│   ` for each such ancestor in the prefix
5. WHEN rendering a node with ancestors that are last children, THE Renderer SHALL add four spaces for each such ancestor in the prefix
6. WHEN a node has a link object, THE Renderer SHALL append the wikilink in format `[[target|alias]]` to the node name
7. FOR ALL tree structures, rendering SHALL preserve the hierarchical relationships visible through indentation and ASCII symbols

### Requirement 3: Process Tree Code Blocks

**User Story:** As a user, I want to write tree diagrams in code blocks with `tree` syntax, so that they render automatically in my notes.

#### Acceptance Criteria

1. WHEN a markdown code block has language identifier `tree`, THE Tree_Diagram_Plugin SHALL register it for custom rendering
2. WHEN rendering a tree code block, THE Tree_Diagram_Plugin SHALL parse the source text into a tree structure
3. WHEN rendering a tree code block, THE Tree_Diagram_Plugin SHALL render the tree structure as ASCII art
4. WHEN rendering a tree code block, THE Tree_Diagram_Plugin SHALL display the output in a monospace font using `var(--font-monospace)`
5. WHEN rendering a tree code block, THE Tree_Diagram_Plugin SHALL preserve whitespace using `white-space: pre` CSS property
6. WHEN rendering a tree code block, THE Tree_Diagram_Plugin SHALL add a copy button positioned at the top-right of the rendered tree

### Requirement 4: Handle Wikilinks in Rendered Trees

**User Story:** As a user, I want to click on wikilinks in rendered trees, so that I can navigate to linked notes directly from the diagram.

#### Acceptance Criteria

1. WHEN rendering a wikilink in format `[[target|alias]]`, THE Renderer SHALL create an HTML anchor element with class `internal-link` and `data-href` attribute set to the target
2. WHEN rendering a wikilink in format `[[target]]`, THE Renderer SHALL create an HTML anchor element with class `internal-link` and `data-href` attribute set to the target, displaying the target as text
3. WHEN a user clicks an internal link, THE Link_Handler SHALL prevent the default browser behavior and open the target note in the Obsidian workspace
4. WHEN opening a linked note, THE Link_Handler SHALL resolve the link relative to the source note path
5. FOR ALL rendered wikilinks, clicking the link SHALL navigate to the target note within the same vault

### Requirement 5: Copy Rendered Tree to Clipboard

**User Story:** As a user, I want to copy the rendered ASCII tree to my clipboard, so that I can paste it into other documents or notes.

#### Acceptance Criteria

1. WHEN a user clicks the copy button, THE Clipboard_Manager SHALL copy the plain text content of the rendered tree to the system clipboard
2. WHEN the copy operation succeeds, THE Tree_Diagram_Plugin SHALL change the button text to "Copied!" for 1200 milliseconds
3. WHEN the copy operation fails, THE Tree_Diagram_Plugin SHALL change the button text to "Fail" for 1200 milliseconds
4. WHEN the feedback timeout expires, THE Tree_Diagram_Plugin SHALL restore the button text to "Copy"
5. WHEN Electron clipboard is available, THE Clipboard_Manager SHALL use `electron.clipboard.writeText`
6. WHEN Electron clipboard is not available, THE Clipboard_Manager SHALL use `navigator.clipboard.writeText`

### Requirement 6: Generate Vault Tree Source

**User Story:** As a user, I want to generate tree source text from my vault structure, so that I can create tree diagrams of my folder hierarchy.

#### Acceptance Criteria

1. WHEN the "Copy vault tree source (folders + files)" command is executed, THE Tree_Diagram_Plugin SHALL generate tab-indented text representing the entire vault structure including files
2. WHEN the "Copy vault tree source (folders only)" command is executed, THE Tree_Diagram_Plugin SHALL generate tab-indented text representing only the folder structure
3. WHEN generating vault tree source, THE Tree_Diagram_Plugin SHALL sort folders before files at each level
4. WHEN generating vault tree source, THE Tree_Diagram_Plugin SHALL sort items alphabetically within their category (folders or files)
5. WHEN generating vault tree source, THE Tree_Diagram_Plugin SHALL use one tab character per depth level
6. WHEN generating vault tree source, THE Tree_Diagram_Plugin SHALL copy the generated text to the system clipboard
7. WHEN vault tree source is copied successfully, THE Tree_Diagram_Plugin SHALL display a notice with the message "Vault tree source copied" or "Vault folders source copied"

### Requirement 7: Generate Current Folder Tree Source

**User Story:** As a user, I want to generate tree source text from the current note's folder, so that I can create tree diagrams of the local folder structure.

#### Acceptance Criteria

1. WHEN the "Copy current note folder source tree" command is executed with an active note, THE Tree_Diagram_Plugin SHALL generate tab-indented text representing the current note's parent folder structure including files
2. WHEN the "Copy current note folder source tree" command is executed without an active note, THE Tree_Diagram_Plugin SHALL display a notice with the message "No active note"
3. WHEN the "Copy current note folder source tree" command is executed without an active note, THE Tree_Diagram_Plugin SHALL not copy anything to the clipboard
4. WHEN generating current folder tree source, THE Tree_Diagram_Plugin SHALL apply the same sorting rules as vault tree generation
5. WHEN current folder tree source is copied successfully, THE Tree_Diagram_Plugin SHALL display a notice with the message "Current folder tree copied"

### Requirement 8: Plugin Lifecycle Management

**User Story:** As a developer, I want the plugin to register all components during load, so that the plugin integrates correctly with Obsidian.

#### Acceptance Criteria

1. WHEN the plugin loads, THE Tree_Diagram_Plugin SHALL register the markdown code block processor for language identifier "tree"
2. WHEN the plugin loads, THE Tree_Diagram_Plugin SHALL register the command "copy-vault-tree-tabs" with name "Copy vault tree source (folders + files)"
3. WHEN the plugin loads, THE Tree_Diagram_Plugin SHALL register the command "copy-vault-folders-tabs" with name "Copy vault tree source (folders only)"
4. WHEN the plugin loads, THE Tree_Diagram_Plugin SHALL register the command "copy-current-folder-tabs" with name "Copy current note folder source tree"
5. WHEN the plugin loads, THE Tree_Diagram_Plugin SHALL attempt to load the Electron clipboard module and gracefully handle failure
6. FOR ALL registered components, the plugin SHALL ensure they are available immediately after the onload method completes

### Requirement 9: Tree Node Data Structure

**User Story:** As a developer, I want a tree node data structure that maintains parent-child relationships, so that I can traverse and render the tree correctly.

#### Acceptance Criteria

1. WHEN a Tree_Node is created, THE Tree_Node SHALL store the node name, depth, parent reference, isLast flag, and optional link object
2. WHEN a child is added to a Tree_Node, THE Tree_Node SHALL append the child to its children array
3. WHEN a child is added to a Tree_Node, THE Tree_Node SHALL set the child's parent reference to itself
4. WHEN a child is added to a Tree_Node, THE Tree_Node SHALL set the child's depth to its own depth plus one
5. WHEN a child is added to a Tree_Node that already has children, THE Tree_Node SHALL mark the previous last child as not last
6. WHEN a child is added to a Tree_Node, THE Tree_Node SHALL mark the new child as last
7. FOR ALL Tree_Nodes in a tree, the depth SHALL accurately reflect the distance from the root node

### Requirement 10: Error Handling and Edge Cases

**User Story:** As a user, I want the plugin to handle edge cases gracefully, so that malformed input does not break the rendering.

#### Acceptance Criteria

1. WHEN the tree source text is empty, THE Parser SHALL return null
2. WHEN a line in the tree source contains only whitespace, THE Parser SHALL skip that line
3. WHEN a line in the tree source has no name after removing wikilinks and whitespace, THE Parser SHALL skip that line
4. WHEN the clipboard copy operation fails, THE Clipboard_Manager SHALL return false
5. WHEN the clipboard copy operation succeeds, THE Clipboard_Manager SHALL return true
6. WHEN rendering an empty tree (null root), THE Renderer SHALL produce an empty output array
7. FOR ALL error conditions, the plugin SHALL not throw unhandled exceptions that crash Obsidian
