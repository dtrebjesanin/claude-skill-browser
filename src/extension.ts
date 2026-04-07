import * as vscode from 'vscode';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

import { scanDirectory, scanAgentsDirectory, deriveSourceLabel } from './skillScanner';
import type { Skill } from './types';

export function activate(context: vscode.ExtensionContext) {
  const provider = new SkillBrowserProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeSkillBrowser.sidebar', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeSkillBrowser.refresh', () => {
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      provider.pruneStaleSkills();
      provider.refresh();
    })
  );
}

export function deactivate() {}

function getDefaultScanPaths(): { path: string; label: string; type: 'skills' | 'agents' }[] {
  const paths: { path: string; label: string; type: 'skills' | 'agents' }[] = [];
  const home = homedir();

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const skillsDir = join(folder.uri.fsPath, '.claude', 'skills');
      paths.push({ path: skillsDir, label: deriveSourceLabel(skillsDir), type: 'skills' });
    }
  }

  const pluginCache = join(home, '.claude', 'plugins', 'cache');
  try {
    for (const entry of readdirSync(pluginCache, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('temp_')) continue;
      findContentDirs(join(pluginCache, entry.name), paths, 3);
    }
  } catch {
    // Plugin cache doesn't exist
  }

  return paths;
}

function findContentDirs(
  dirPath: string,
  results: { path: string; label: string; type: 'skills' | 'agents' }[],
  maxDepth: number
): void {
  if (maxDepth <= 0) return;
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entryPath = join(dirPath, entry.name);
      if (entry.name === 'skills' || entry.name === 'agents') {
        results.push({ path: entryPath, label: deriveSourceLabel(entryPath), type: entry.name });
      } else {
        findContentDirs(entryPath, results, maxDepth - 1);
      }
    }
  } catch {}
}

class SkillBrowserProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(join(this.context.extensionPath, 'src', 'webview')),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendSkills();
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'copy': {
          await vscode.env.clipboard.writeText(message.slashCommand);
          vscode.window.setStatusBarMessage(
            `Copied ${message.slashCommand} to clipboard`,
            2000
          );
          const recentSkills: string[] = this.context.workspaceState.get('recentSkills', []);
          const updated = [
            message.skillName,
            ...recentSkills.filter((s) => s !== message.skillName),
          ].slice(0, 8);
          await this.context.workspaceState.update('recentSkills', updated);
          break;
        }
        case 'pin': {
          const pinned = [...this.context.workspaceState.get('pinnedSkills', [] as string[])];
          if (!pinned.includes(message.skillName)) {
            pinned.push(message.skillName);
            await this.context.workspaceState.update('pinnedSkills', pinned);
          }
          this.broadcastState();
          break;
        }
        case 'unpin': {
          const pinned: string[] = this.context.workspaceState.get('pinnedSkills', []);
          await this.context.workspaceState.update(
            'pinnedSkills',
            pinned.filter((s) => s !== message.skillName)
          );
          this.broadcastState();
          break;
        }
        case 'setCategoryColor': {
          const colors = { ...this.context.globalState.get('categoryColors', {} as Record<string, string>) };
          if (message.color) {
            colors[message.category] = message.color;
          } else {
            delete colors[message.category];
          }
          await this.context.globalState.update('categoryColors', colors);
          this.broadcastState();
          break;
        }
        case 'toggleCollapse': {
          const collapsed = [...this.context.globalState.get('collapsedSections', [] as string[])];
          const idx = collapsed.indexOf(message.sectionId);
          if (idx >= 0) {
            collapsed.splice(idx, 1);
          } else {
            collapsed.push(message.sectionId);
          }
          await this.context.globalState.update('collapsedSections', collapsed);
          break;
        }
      }
    });

    this.sendSkills();
  }

  refresh() {
    this.sendSkills();
  }

  pruneStaleSkills() {
    const scanPaths = getDefaultScanPaths();
    const config = vscode.workspace.getConfiguration('claudeSkillBrowser');
    const additionalDirs: string[] = config.get('additionalDirectories', []);
    for (const dir of additionalDirs) {
      scanPaths.push({ path: dir, label: deriveSourceLabel(dir), type: 'skills' as const });
    }

    const allSkills: Skill[] = [];
    for (const { path, label, type } of scanPaths) {
      if (type === 'agents') {
        allSkills.push(...scanAgentsDirectory(path, label));
      } else {
        allSkills.push(...scanDirectory(path, label));
      }
    }

    const validNames = new Set(allSkills.map((s) => s.name));
    const pinnedSkills: string[] = this.context.workspaceState.get('pinnedSkills', []);
    const recentSkills: string[] = this.context.workspaceState.get('recentSkills', []);
    const prunedPinned = pinnedSkills.filter((s) => validNames.has(s));
    const prunedRecent = recentSkills.filter((s) => validNames.has(s));
    if (prunedPinned.length !== pinnedSkills.length) {
      this.context.workspaceState.update('pinnedSkills', prunedPinned);
    }
    if (prunedRecent.length !== recentSkills.length) {
      this.context.workspaceState.update('recentSkills', prunedRecent);
    }
  }

  private broadcastState() {
    this.view?.webview.postMessage({ type: 'state', data: this.getState() });
  }

  private getState(): { pinnedSkills: string[]; recentSkills: string[]; collapsedSections: string[]; categoryColors: Record<string, string> } {
    return {
      pinnedSkills: this.context.workspaceState.get('pinnedSkills', []),
      recentSkills: this.context.workspaceState.get('recentSkills', []),
      collapsedSections: this.context.globalState.get('collapsedSections', []),
      categoryColors: this.context.globalState.get('categoryColors', {}),
    };
  }

  private sendSkills() {
    if (!this.view) return;

    const config = vscode.workspace.getConfiguration('claudeSkillBrowser');
    const additionalDirs: string[] = config.get('additionalDirectories', []);

    const scanPaths = getDefaultScanPaths();
    for (const dir of additionalDirs) {
      scanPaths.push({ path: dir, label: deriveSourceLabel(dir), type: 'skills' as const });
    }

    const allSkills: Skill[] = [];
    for (const { path, label, type } of scanPaths) {
      if (type === 'agents') {
        allSkills.push(...scanAgentsDirectory(path, label));
      } else {
        allSkills.push(...scanDirectory(path, label));
      }
    }

    // Deduplicate skills by name, keeping the first occurrence
    const seen = new Set<string>();
    const uniqueSkills = allSkills.filter((skill) => {
      if (seen.has(skill.name)) return false;
      seen.add(skill.name);
      return true;
    });

    this.view.webview.postMessage({ type: 'skills', data: uniqueSkills });
    this.broadcastState();
  }

  private getHtml(webview: vscode.Webview): string {
    const webviewDir = join(this.context.extensionPath, 'src', 'webview');
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(join(webviewDir, 'style.css'))
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(join(webviewDir, 'script.js'))
    );
    const nonce = randomUUID();

    const replacements: Record<string, string> = {
      cspSource: webview.cspSource,
      nonce,
      styleUri: styleUri.toString(),
      scriptUri: scriptUri.toString(),
    };

    const html = readFileSync(join(webviewDir, 'index.html'), 'utf-8');
    return html.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? '');
  }
}

