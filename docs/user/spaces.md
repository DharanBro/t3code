# Spaces

A space holds one task. Each agent working on it gets its own tab in the space, so you can run several agents side by side, such as Claude writing code in one tab and Codex reviewing it in another, and switch between them without searching the thread list.

Spaces are part of this fork's web and desktop builds. Mobile and the official T3 Code apps show a space's threads as ordinary threads.

## Start a space

Right-click a thread in the sidebar and choose **Start a space from this thread**, or run the same command from the command palette. The space takes the thread's name and the thread becomes its first tab. To add another thread to an existing space, right-click it and choose **Move to space**.

## Work in tabs

A thread in a space shows a row of tabs under its title. Each tab is an ordinary thread with its own provider, model, and right panel.

Use **+** to open a new tab:

- **New tab in this folder** works in the same checkout or worktree as the tab you are on.
- **New tab in its own worktree** creates a new worktree from that tab's branch when you send the first message.

**+** waits until the current tab has sent its first message, because until then the tab has no folder to share.

Tabs in the same folder can change the same files at the same time. Give each agent its own area of the code, or use a worktree per tab when their changes might collide.

## Let agents open tabs

An agent in a space can open another agent as a new tab, for example when you ask "have a second agent write the tests in another tab". The new tab works in the same folder unless the agent asks for its own worktree, uses the same model unless the agent picks another, and never gets wider permissions than the agent that opened it. For a quick subtask whose result the agent needs back, agents delegate instead, which keeps the work inside their own thread.

## Find and tidy spaces

- The **Spaces** list at the top of the sidebar shows each space with its tab count and a dot for the tab that most needs you. Click a space to return to the tab you visited last.
- Threads in a space leave the main thread list and sidebar search. Open them through their space, or with **Open space** in the command palette.
- Right-click a tab and choose **Remove from space** to return its thread to the thread list.
- Right-click a space in the sidebar to rename or delete it. Deleting a space keeps its threads.
