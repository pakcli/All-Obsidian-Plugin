---
title: Supervisor AI — Timeline-Linked Conversation & Suggestion Workspace
date: 2026-08-13
tags: [agent-brief, supervisor-ai, notion-editor, context-modal, timeline-history, linked-conversations]
---

# Supervisor AI — System Architecture Brief (v2)

## 1. Vision & Core Philosophy

**Supervisor AI** is an intelligent document canvas combining a **Notion-style block editor** with a **Timeline-Linked Supervisor AI Layer**.

Unlike standard AI assistants that operate in isolated sidebar chats, every AI suggestion in Supervisor AI is **linked to a conversation thread and anchored in a chronological document timeline**. Users can view, discuss, accept/reject suggestions, and scrub back through the timeline to see how document decisions evolved over time.

---

## 2. Key Architecture Pillars

```
+-----------------------------------------------------------------------------------+
|                            SUPERVISOR AI CANVAS                                   |
+-----------------------------------------------------------------------------------+
|  1. NOTION-STYLE BLOCK EDITOR      |  2. CONVERSATION MODAL & LINKED THREADS     |
|  - Line-by-line selection          |  - Pinned context lines                      |
|  - Inline AI suggestion cards      |  - Multi-turn AI dialogue                    |
|  - Margin status indicators        |  - 1-Click Diff Apply/Revert                 |
+------------------------------------+----------------------------------------------+
|  3. CHRONOLOGICAL TIMELINE DRAWER  |  4. SUPERVISOR AI PROACTIVE ENGINE           |
|  - Time-scrubbing history slider   |  - Asynchronous quality & logic audits       |
|  - Linked suggestion audit trail   |  - Automatic thread generation               |
+-----------------------------------------------------------------------------------+
```

---

## 3. Detailed Feature Specifications

### 3.1 Line & Block Selection with Floating AI Controls
- **Block Selector**: Select single or multiple lines/blocks in the Notion canvas.
- **Inline Floating Bar**: Appears instantly upon text selection with quick actions:
  - `💬 Start Supervisor Conversation`
  - `✨ AI Rewrite & Refine`
  - `🔍 Fact-Check & Audit`

---

### 3.2 Linked AI Suggestion Cards & Badges
- **Linked Suggestions**: When Supervisor AI notices an issue (e.g. invalid code pin, typo, logical conflict), it inserts a **Linked Suggestion Badge** directly next to the target lines.
- **Interactive Card Expansion**: Clicking a suggestion badge opens its **Linked Conversation Modal**, showing:
  - The AI's explanation & reasoning.
  - The proposed text/code diff.
  - The conversation thread where the user can respond or ask follow-up questions.
- **Status States**: `Pending Review` | `In Discussion` | `Accepted` | `Rejected`.

---

### 3.3 Timeline & Decision History View ("Reach Timeline-ly")
- **Chronological Timeline Slider**: A timeline panel at the bottom or side of the workspace tracking all major document events:
  - `[10:15 AM]` User created lines 1–10.
  - `[10:18 AM]` Supervisor AI flagged Pin 18 mismatch -> *Linked Convo #102*.
  - `[10:20 AM]` User accepted AI suggestion -> *Updated lines 12–15*.
- **Timeline Scrubbing**: Users can click or drag the timeline slider to view the exact state of the document at any previous point in time.
- **Decision Audit Trail**: Clicking any historical event highlights the exact lines changed AND opens the associated conversation modal that led to that decision.

---

### 3.4 Contextual Conversation Modal
- **Pinned Line Context**: Displays the exact text lines selected or referenced by the suggestion.
- **Multi-Turn Dialogue**: User can converse with Supervisor AI to refine the suggestion before applying.
- **1-Click Apply / Revert**: Accept the AI's proposal with instant diff replacement, or revert to a previous timeline checkpoint.

---

## 4. Enhanced Data Schemas

### 4.1 Linked Suggestion & Conversation Thread Schema
```typescript
interface LinkedSuggestionThread {
  threadId: string;
  documentId: string;
  status: 'pending' | 'in_discussion' | 'accepted' | 'rejected';
  
  // Line Anchoring
  anchor: {
    startLine: number;
    endLine: number;
    pinnedText: string;
  };

  // Conversation History
  messages: Array<{
    id: string;
    sender: 'user' | 'supervisor_ai';
    content: string;
    suggestedDiff?: {
      original: string;
      replacement: string;
    };
    timestamp: string;
  }>;

  // Timeline Event Link
  timelineEventId: string;
  createdAt: string;
  updatedAt: string;
}
```

### 4.2 Timeline Event Node Schema
```typescript
interface TimelineEventNode {
  eventId: string;
  timestamp: string;
  type: 'user_edit' | 'ai_suggestion' | 'convo_created' | 'suggestion_accepted' | 'suggestion_rejected';
  description: string;
  lineRange: { start: number; end: number };
  linkedThreadId?: string; // Links directly to Conversation Modal
  snapshotDelta: {
    linesAdded: string[];
    linesRemoved: string[];
  };
}
```

---

## 5. Timeline & Conversation Interaction Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Canvas as Notion Editor Canvas
    participant Badge as Inline Suggestion Chip
    participant Modal as Linked Convo Modal
    participant Timeline as Chronological Timeline

    Canvas->>Badge: Supervisor AI detects issue & links Convo Thread #104
    Badge-->>User: Visual Suggestion Chip appears on Line 18
    User->>Badge: Click Suggestion Chip
    Badge->>Modal: Open Linked Convo Modal (Lines 18 context attached)
    User->>Modal: Chat with AI ("Why 50Hz frequency?")
    Modal->>User: AI explains & provides modified diff
    User->>Modal: Click "Accept Diff"
    Modal->>Canvas: Apply inline rewrite to Line 18
    Modal->>Timeline: Append Event "Accepted Diff #104" to Timeline
    Timeline-->>User: Timeline node added; user can scrub back anytime!
```

---

## 6. Implementation Milestones

- [ ] **Milestone 1**: Notion-style block editor with line indexing & floating selection toolbar.
- [ ] **Milestone 2**: Linked Suggestion Chips & Contextual Conversation Modal.
- [ ] **Milestone 3**: Chronological Timeline Drawer with time-scrubbing & event audit trail.
- [ ] **Milestone 4**: Streaming AI integration for live dialogue & diff resolution.
- [ ] **Milestone 5**: Full end-to-end integration of Timeline + Convo Modal + Canvas state.
