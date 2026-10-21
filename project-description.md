# Product Description: AI Crash Course Builder

> **Version:** 1.1
> **Status:** Aligned with Latest Architecture Document & Approved by Stakeholders
> **Last edited:** 2026-09-06

---

## 1. Overview

The AI Crash Course Builder is a simple, locally run web application that helps users create, read, and discuss short “crash course” documents on any topic. A user enters a topic, chooses a target audience, and the app automatically guides an AI through a multi-step process:

1. Create a course outline.
2. Expand every outline section into detailed reading material.
3. Save the finished course into a well-organized local library.

The entire product is private and self-contained. It runs on the user’s own computer, accesses a single AI provider, and stores all course files and conversation history locally. No cloud account, subscription, or online hosting is required.

---

## 2. Target Users and Scenarios

### Primary Users

- **Lifelong learners** who want concise, up-to-date crash courses on new subjects.
- **Educators and trainers** who need quick reference materials for their students.
- **Professionals** who need to ramp up on a new domain quickly.
- **Self-directed readers** who prefer to learn from structured text rather than videos.

### Key Scenarios

- A product manager wants a 30-minute crash course on “customer journey mapping” written for non-technical stakeholders.
- A developer wants a crash course on “vector databases” aimed at software engineers.
- A teacher needs a refresher course on “modern classroom assessment techniques” for other educators.
- A student wants to quickly understand the basics of behavioral economics before a class discussion.

---

## 3. Goals and Non-Goals

### Goals

- Make crash course creation **as easy as typing a few sentences**.
- Automatically handle the repetitive work of prompting the AI section by section.
- Produce clean, readable Markdown documents with formulas where needed.
- Keep all content organized by **subject matter** in folders.
- Preserve user privacy by saving everything locally.
- Allow users to ask follow-up questions about any course and explore side conversations.

### Non-Goals

- No public hosting or shared user accounts.
- No video or audio generation.
- No mobile app at this stage.
- No automatic course scheduling or progress tracking.
- No support for multiple AI providers in the first version, though the design should allow it later.

---

## 4. Key Features

### 4.1 Course Library Home Screen

The main screen is the **course library**. It shows all saved courses grouped by subject matter, exactly matching the folder structure on the user’s machine.

From this screen, the user can:

- **Create a new subject matter** folder.
- **Create a new course** inside a subject matter.
- **Move** a course from one subject matter to another.
- **Move** a subject matter to reorganize the library.
- **Delete** a subject matter or course.
- **Open** any course to read it or continue working on it.

This makes the library feel like browsing a set of clean file folders, but it is all done inside the website.

---

### 4.2 Multi-Step Course Development Workflow

Creating a course is a guided, partially automated process.

#### Step 1: User Input

The user fills out a short form with four fields:

- **Subject matter** (for example: Marketing, Computer Science, History, Education)
- **Topic** (for example: “Customer Journey Mapping”)
- **Target audience** (for example: “non-technical managers”)
- **Additional instructions** (optional; for example, “use real-world examples from e-commerce”)

If the user already has courses in the same subject matter, the app will remember their **topic names and target audiences** and use them as background context. This helps the new course avoid repeating earlier material and instead builds on existing knowledge. Full outlines from earlier courses are not injected in Phase 1.

#### Step 2: Starting Prompt

The app generates a starting prompt that asks the AI for a complete crash course outline. The prompt is designed to:

- Keep the course readable in about 30 minutes.
- Use current best practices and up-to-date information.
- Respect any additional instructions.
- Be formatted as a book-like cover page and table of contents.

If earlier courses exist in the same subject matter, the starting prompt also tells the AI: “Assume the user has already taken these courses, and build on them.” The prompt includes only the prior courses’ topic names and target audiences, not their outlines.

#### Step 3: Course Outline

Once the AI returns the outline, the app breaks the outline into individual bullet points or sections. It then automatically sends a continuation prompt for each section.

Each continuation prompt asks the AI to:

- Teach that outline section to someone with zero prior knowledge.
- Use LaTeX for any mathematical formulas.
- Produce detailed text that fits naturally into a 30-minute reading course.

In Phase 1, the AI is explicitly instructed **not** to produce Mermaid diagrams because diagram rendering is deferred to Phase 3.

#### Step 4: Course Extraction and Saving

After all continuation prompts are completed, the app assembles the final course and saves these files in the course folder:

- **Folder:** `<library root>/<Subject>/<Topic>/`
- **Files:**
  - `course.md` — the final course document
  - `outline.md` — a human-readable version of the generated outline
  - `meta.json` — course metadata

The outline is stored separately and displayed at the top of the reading view; it is not mixed into `course.md`.

#### Workflow Automation

In Phase 1, the workflow has two explicit approval gates:

1. The user confirms the starting prompt.
2. After outline generation, the user reviews the human-friendly outline and the actual continuation prompts before approving section expansion.

After the second approval, section expansion runs automatically. The user can watch the status, see which section is being generated, and stop or pause if something looks wrong. If an AI call fails, the app pauses, gives a clear message, and does **not** auto-retry. The session is durably stored and can be resumed manually.

---

### 4.3 Prompt Previews

Before the AI process begins, the user can preview **exactly what prompts will be sent**.

The preview includes:

- The starting prompt.
- The continuation prompts that will be generated after the outline.
- Any additional context the app will add about previous courses.

In Phase 1, the preview is **two‑stage**: the user first confirms the starting prompt, then after outline generation reviews the actual continuation prompts before expansion.

This gives the user confidence and control. If the prompts look wrong, the user can go back and adjust the topic, audience, or instructions before generating anything.

---

### 4.4 Course Reading Screen

When the user opens a course, it is displayed as a clean, formatted reading experience.

In Phase 1, the app renders:

- Markdown headings, bold text, bullet lists, and tables.
- LaTeX math formulas, such as equations and functions.

A human-friendly outline is displayed at the beginning of the reading view, so the reader can jump between sections. Mermaid diagram rendering is deferred to Phase 3.

---

### 4.5 Follow-Up Questions and Branching Conversations

*Deferred to Phase 2.*

The Phase 1 course reading screen is read-only. Follow-up questions, saved Q&A history, and branching discussion threads are not included. The architecture reserves a `conversations/` folder extension point for this future capability.

---

### 4.6 Local Storage and Privacy

The app runs entirely on the user’s computer and is accessed through a local browser page. It does not require any external hosting.

The user provides a **DeepSeek access key**. In Phase 1, the key is provided via CLI or environment variable and stored in the OS keychain when available, with a local config file fallback. The key is used only to connect to the AI service from the user’s own computer. It is stored locally and is never sent to any other service. A settings UI is deferred to Phase 3.

All files are saved locally:

- Course outlines
- Final Markdown course documents
- Conversation histories *(Phase 2)*
- Branching discussion threads *(Phase 2)*
- User settings *(Phase 3)*

---

## 5. Example User Flow

1. **Open the app** in a local browser.
2. The **library screen** shows current subject matters and courses.
3. The user clicks **“New Course”**.
4. The user selects an existing subject matter or creates a new one.
5. The user enters a topic, target audience, and optional instructions.
6. The app shows a **prompt preview**.
7. The user reviews the starting prompt and clicks **“Generate Outline”**.
8. The app creates the course outline and shows a human-friendly version plus the actual continuation prompts.
9. The user reviews and clicks **“Approve and Expand Sections”**.
10. The app automatically expands each section and saves the course.
11. The user opens the new course and reads it.

*Follow-up questions and branching are deferred to Phase 2 and are not part of this flow.*

---

## 6. Acceptance Criteria for the First Version

- A user can create a new course by entering only a subject matter, topic, and target audience.
- Before generation starts, the user sees the exact starting prompt and can cancel or edit inputs.
- The AI process runs without manual copy/paste; the user reviews and approves the outline before section expansion.
- The completed course is automatically saved as a Markdown file in the correct subject matter folder.
- The user can view the course with proper Markdown and LaTeX rendering.
- The library screen allows creating, moving, and deleting subject matters and courses.
- Follow-up questions and conversations are deferred to Phase 2.
- The app functions entirely locally with only a DeepSeek key; no other internet service is required.

---

## 7. Future Ideas

The first version focuses on the core experience. Later versions might include:

- Support for other AI providers beyond DeepSeek.
- Export options to PDF, Word, or HTML.
- Progress tracking for readers.
- Mobile-responsive reading mode.
- Built-in search across all courses and conversations.
- Ability to share courses while preserving formatting.
- Mermaid diagram rendering.

---

## 8. Success Metrics

The product should be considered successful if:

- Most courses are completed without user intervention once started.
- Users can create a course setup in under two minutes.
- Users can find an existing course in the library with minimal clicks.
- Users actually read and complete the crash courses.
- Users ask follow-up questions, indicating they are engaged with the content. *(Phase 2)*
- Branching conversations demonstrate that the course material supports deeper learning. *(Phase 2)*

---

## 9. Project Milestones

### Phase 1: MVP
- Course library screen
- Course creation form
- Prompt preview
- Automated course generation workflow
- Markdown and LaTeX rendering
- Save courses into local folders

### Phase 2: Conversations
- Follow-up questions on course pages
- Saved conversation history
- Branching conversations

### Phase 3: Polish
- Mermaid rendering for diagrams
- Better course management and moving *(already partially implemented in Phase 1)*
- Error handling and recovery
- Setting screen for the DeepSeek key and local preferences

### Phase 4: Expansion
- Additional AI providers
- Advanced export options
- Search and discovery features

---

## 10. Assumptions

- Users are comfortable running a small program on their own computer.
- Users have access to a DeepSeek key.
- The DeepSeek service is available and responsive.
- Course content is primarily text-based, with optional formulas and diagrams.
- Only one user interacts with the app at a time in the first version.

---

## 11. Summary

The AI Crash Course Builder is a private, locally hosted tool that turns a simple topic idea into a structured, readable, and interactive crash course. It automates the tedious parts of AI prompting, organizes the results by subject matter, and provides a comfortable reading and conversation experience. With its focus on privacy, ease of use, and continuous learning, it is designed for anyone who wants fast, reliable, self-hosted learning materials.

*(Phase 1 scope is limited to course creation and reading; conversations arrive in Phase 2.)*
