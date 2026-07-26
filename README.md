```markdown
```text
 ██████╗  █████╗ ███╗   ██╗██████╗ ██████╗  ██████╗ ██╗  ██╗
██╔════╝ ██╔══██╗████╗  ██║██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝
╚█████╗  ███████║██╔██╗ ██║██║  ██║██████╔╝██║   ██║ ╚███╔╝ 
 ╚═══██╗ ██╔══██║██║╚██╗██║██║  ██║██╔══██╗██║   ██║ ██╔██╗ 
██████╔╝ ██║  ██║██║ ╚████║██████╔╝██████╔╝╚██████╔╝██╔╝ ██╗
╚═════╝  ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
  [ R&D_EXPERIMENTATION_SYSTEM // GITHUB_AS_A_DATABASE ]

```

---

### 01 // OVERVIEW

`SANDBOX` is a local-first R&D engine designed to store raw technical ideas, rapid software spikes, and research notes. This repository acts as the primary data store with zero external state persistence.

---

### 02 // DIRECTORY INDEX

| DIRECTORY | DESCRIPTION | LINK |
| --- | --- | --- |
| `📁 /ideas` | Unformed concepts, whiteboard sketches, and architecture specs | [📂 OPEN_IDEAS](https://github.com/rahuldesai101/sandbox/tree/main/ideas) |
| `📁 /experiments` | Runnable code spikes, prototypes, and technical benchmarks | [📂 OPEN_EXPERIMENTS](https://github.com/rahuldesai101/sandbox/tree/main/experiments) |
| `📁 /research` | Paper breakdowns, deep dives, and performance analysis | [📂 OPEN_RESEARCH](https://github.com/rahuldesai101/sandbox/tree/main/research) |

---

### 03 // STATUS CODES

Standard status tags to use inside individual markdown files:

* `RAW` — Unverified idea / pure text note.
* `ACTIVE` — Code spike in progress / active local dev.
* `ARCHIVED` — Test finished or abandoned.
* `GRADUATED` — Spun off into an independent repository.

---

### 04 // LOCAL DEV PROTOCOL

To instantiate a new experiment from your terminal:

```bash
# 1. Clone repository
git clone [https://github.com/YOUR_USERNAME/sandbox.git](https://github.com/YOUR_USERNAME/sandbox.git)
cd sandbox

# 2. Create an experiment folder
mkdir -p experiments/exp-01-my-spike
cd experiments/exp-01-my-spike

# 3. Commit record back to Git
git add .
git commit -m "feat: added new experiment"
git push origin main

```

---

### 05 // DASHBOARD INTEGRATION

This repository is designed to be read directly via the **SANDBOX Visual Spec Interface**.

1. Launch your Lovable dashboard.
2. Set `GITHUB_OWNER` to your GitHub username.
3. Set `GITHUB_REPO` to `sandbox`.
4. Any commits pushed locally via VS Code will reflect automatically in the spec viewer.

---

`[ END OF SPECIFICATION ]`
