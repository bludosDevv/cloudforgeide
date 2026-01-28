import { GITHUB_API_BASE } from '../constants';
import { FileNode, FileContent, Repository, User, WorkflowRun, Artifact } from '../types';

export class GitHubService {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
    const headers = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API Error ${response.status}: ${errorBody}`);
    }

    if (response.status === 204) return {} as T;

    return response.json();
  }

  async getUser(): Promise<User> {
    return this.request<User>('/user');
  }

  async getRepositories(): Promise<Repository[]> {
    return this.request<Repository[]>('/user/repos?sort=updated&per_page=100');
  }

  async createRepository(name: string, description: string): Promise<Repository> {
    return this.request<Repository>('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name, description, auto_init: true }),
    });
  }

  async getRepoTree(owner: string, repo: string, sha: string = 'main'): Promise<{ tree: FileNode[], sha: string }> {
    try {
        const data = await this.request<any>(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
        return data;
    } catch (e) {
         const data = await this.request<any>(`/repos/${owner}/${repo}/git/trees/master?recursive=1`);
         return data;
    }
  }

  async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    const data = await this.request<FileContent>(`/repos/${owner}/${repo}/contents/${path}`);
    if (data.content && data.encoding === 'base64') {
        try {
             return decodeURIComponent(escape(window.atob(data.content.replace(/\n/g, ""))));
        } catch (e) {
            console.error("Decoding failed", e);
            return atob(data.content);
        }
    }
    return "";
  }

  // For text editing
  async updateFile(owner: string, repo: string, path: string, content: string, message: string, sha?: string): Promise<void> {
    let fileSha = sha;
    if (!fileSha) {
      try {
        const existing = await this.request<FileContent>(`/repos/${owner}/${repo}/contents/${path}`);
        fileSha = existing.sha;
      } catch (e) {
        // File doesn't exist
      }
    }

    const body: any = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
    };

    if (fileSha) {
      body.sha = fileSha;
    }

    await this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // For binary imports (already base64 encoded)
  async uploadFile(owner: string, repo: string, path: string, contentBase64: string, message: string): Promise<void> {
    let fileSha = null;
    try {
      const existing = await this.request<FileContent>(`/repos/${owner}/${repo}/contents/${path}`);
      fileSha = existing.sha;
    } catch (e) {
      // File doesn't exist, proceed
    }

    const body: any = {
      message,
      content: contentBase64,
    };

    if (fileSha) {
      body.sha = fileSha;
    }

    await this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteFile(owner: string, repo: string, path: string, message: string, sha: string): Promise<void> {
      await this.request(`/repos/${owner}/${repo}/contents/${path}`, {
          method: 'DELETE',
          body: JSON.stringify({ message, sha })
      });
  }

  async deleteRepository(owner: string, repo: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}`, { method: 'DELETE' });
  }

  async triggerWorkflow(owner: string, repo: string, workflowId: string): Promise<void> {
     await this.request(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: 'main' }) 
     });
  }

  async getWorkflowRuns(owner: string, repo: string): Promise<WorkflowRun[]> {
      try {
        const res = await this.request<any>(`/repos/${owner}/${repo}/actions/runs`);
        return res.workflow_runs;
      } catch(e) {
          return [];
      }
  }

  async getWorkflowJobs(owner: string, repo: string, runId: number): Promise<any[]> {
      try {
          const res = await this.request<any>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
          return res.jobs;
      } catch (e) {
          return [];
      }
  }

  async getArtifacts(owner: string, repo: string, runId: number): Promise<Artifact[]> {
    try {
        const res = await this.request<any>(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);
        return res.artifacts;
    } catch (e) {
        return [];
    }
  }

  async downloadArtifact(url: string, filename: string) {
      // Fetch as blob with auth headers
      const response = await fetch(url, {
          headers: { 'Authorization': `token ${this.token}` }
      });
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename; // This might be ignored by browser for zip, but good practice
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
  }
}