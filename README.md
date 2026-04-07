# Claude Skill Browser

A VS Code sidebar that lets you browse, search, and copy all your Claude Code skills from one place.

## What it does

If you use Claude Code skills (from plugins like Superpowers, Marketing Skills, or your own workspace skills), you've probably forgotten what's available or can't remember the exact slash command. This extension fixes that.

- **Browse all skills** grouped by category in a searchable tag grid
- **Click to copy** any `/skill-name` to your clipboard, ready to paste into Claude Code
- **Pin favorites** so your most-used skills are always at the top
- **Recently used** section tracks what you've copied, so you can quickly re-use skills
- **Preview pane** shows the full description, source, and copy/pin actions when you click the ⓘ icon on any skill
- **Works with any theme** using VS Code's native CSS variables

## How it works

The extension automatically scans these locations for `SKILL.md` files:

1. **Workspace skills** — `.claude/skills/` in your workspace
2. **Plugin skills** — `~/.claude/plugins/cache/` (Superpowers, Marketing Skills, etc.)
3. **Custom directories** — add your own via settings

Skills are grouped by category (auto-derived from the source, or set via a `category` field in SKILL.md frontmatter).

## Installation

### From VSIX

1. Download the `.vsix` file from [Releases](https://github.com/dtrebjesanin/claude-skill-browser/releases)
2. In VS Code, open the Extensions view
3. Click `...` → **Install from VSIX...** and select the file

### Build from source

```bash
git clone https://github.com/dtrebjesanin/claude-skill-browser.git
cd claude-skill-browser
npm install
npm run compile
npm run package
```

Then install the generated `.vsix` file.

## Usage

1. Click the **Claude Skills** icon in the activity bar
2. Browse or search for a skill
3. **Click a tag** to copy its `/slash-command` to clipboard
4. **Click ⓘ** to preview the skill's description before copying
5. **Right-click** to pin/unpin a skill

Paste the copied command into Claude Code to invoke the skill.

## Settings

| Setting | Description |
|---------|-------------|
| `claudeSkillBrowser.additionalDirectories` | Array of extra directories to scan for skills |

## Development

```bash
npm run compile       # Build the extension
npm run watch         # Watch mode
npm run test          # Run tests
npm run package       # Package as .vsix
```

### Project structure

```
src/
├── extension.ts       # Extension host, state management, message handling
├── skillScanner.ts    # SKILL.md file discovery and frontmatter parsing
├── types.ts           # Shared type definitions
└── webview/
    ├── index.html     # Webview shell with CSP
    ├── script.js      # Sidebar UI logic
    └── style.css      # Theme-aware styles
```

## Contributing

Pull requests are welcome. If you'd like to add features or fix bugs, fork the repo and open a PR.

## Built with

- TypeScript
- VS Code Extension API
- HTML Canvas / CSS Variables
- Vitest

## Requirements

- [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) VS Code extension (for the skills to browse)

## License

MIT — [Danilo Trebjesanin](https://github.com/dtrebjesanin)
