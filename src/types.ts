export interface Skill {
  name: string;
  description: string;
  category: string;
  source: string;
  slashCommand: string;
  filePath: string;
  kind: 'skill' | 'agent';
}
