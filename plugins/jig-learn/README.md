# jig-learn

Record missed problems and improve checks.

Skills: /jig-learn:jig-correct. In Codex, request these skill names directly.

Needs Node.js 22 or later on PATH. Git is required for repository commands. Run `npm ci --ignore-scripts` in this plugin folder for helpers with declared package dependencies; browser checks also need local Chrome/Chromium. Optional host tools report gaps when unavailable.

Install independently with `claude plugin install jig-learn@andrewbhy --scope local` or `codex plugin add jig-learn@andrewbhy`.

State and history stay in `~/.jig`; removing this plugin keeps them.
