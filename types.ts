export interface User {
  login: string;
  avatar_url: string;
  id: number;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
  owner: {
    login: string;
  };
}

export interface FileNode {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface FileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content?: string; // Base64 encoded
  encoding?: string;
}

export enum ModLoader {
  FORGE = 'Forge',
  FABRIC = 'Fabric',
}

export interface NewProjectConfig {
  name: string;
  description: string;
  loader: ModLoader;
  minecraftVersion: string;
  modId: string;
  packageName: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
}
