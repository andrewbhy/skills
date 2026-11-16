# jig-git

Manage task worktrees and authorized merges.

Skills: /jig-git:jig-worktree, /jig-git:jig-merge, /jig-git:jig-pr. In Codex, request these skill names directly.

Needs Node.js 22 or later on PATH. Git is required for repository commands. Run `npm ci --ignore-scripts` in this plugin folder for helpers with declared package dependencies; browser checks also need local Chrome/Chromium. Optional host tools report gaps when unavailable.

Install independently with `claude plugin install jig-git@andrewbhy --scope local` or `codex plugin add jig-git@andrewbhy`.

State and history stay in `~/.jig`; removing this plugin keeps them.
