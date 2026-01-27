import React, { useState, useEffect } from 'react';
import { GitHubService } from './services/github';
import ProjectList from './components/ProjectList';
import IDE from './components/IDE';
import { Repository } from './types';
import { Github, KeyRound, Loader2, Info, ArrowRight, Box } from 'lucide-react';
import { Button, Card, Input } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

const App = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('gh_token'));
  const [github, setGithub] = useState<GitHubService | null>(null);
  const [user, setUser] = useState<any>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [currentRepo, setCurrentRepo] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) {
      const svc = new GitHubService(token);
      setGithub(svc);
      setLoading(true);
      svc.getUser()
        .then(u => {
          setUser(u);
          return svc.getRepositories();
        })
        .then(rs => setRepos(rs))
        .catch(err => {
          console.error(err);
          setError("Invalid Token or Network Error");
          setToken(null);
          localStorage.removeItem('gh_token');
        })
        .finally(() => setLoading(false));
    }
  }, [token]);

  const handleLogin = (t: string) => {
    if (!t) return;
    localStorage.setItem('gh_token', t);
    setToken(t);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('gh_token');
    setUser(null);
    setRepos([]);
    setCurrentRepo(null);
  };

  // Modified refresh to be used for both manual and silent polling
  const refreshRepos = async () => {
    if (github) {
      try {
          const rs = await github.getRepositories();
          // We only update if the data is actually different to avoid unnecessary renders
          // For simplicity in this demo, we just set it, React's diffing is fast enough
          setRepos(rs);
      } catch (e) {
          console.error("Silent refresh failed", e);
      }
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 font-sans text-gray-100 relative overflow-hidden">
        {/* Ambient Background */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-900/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-900/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-md space-y-8 relative z-10 animate-fade-in">
           <div className="text-center">
              <div className="mx-auto h-20 w-20 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-black/50 border border-gray-700 mb-8 transform rotate-3 hover:rotate-6 transition-transform duration-500">
                <Box size={40} className="text-primary-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]" />
              </div>
              <h2 className="text-4xl font-extrabold text-white tracking-tight mb-3">CloudForge</h2>
              <p className="text-gray-400 font-medium text-lg">Build Minecraft Mods in the Cloud.</p>
           </div>
           
           <Card className="p-8 space-y-6 shadow-2xl border-gray-800 bg-gray-900/80 backdrop-blur-sm">
              <form onSubmit={(e) => { e.preventDefault(); const val = (e.target as any).token.value; handleLogin(val); }}>
                  <Input 
                    name="token" 
                    type="password" 
                    placeholder="ghp_xxxxxxxxxxxx" 
                    label="Personal Access Token" 
                    required
                  />
                  <div className="pt-4">
                    <Button className="w-full py-3.5 font-bold text-lg group bg-primary-600 text-white hover:bg-primary-500 shadow-lg shadow-primary-900/30 border-none" type="submit">
                        <Github className="mr-2" size={20} /> Login with GitHub
                        <ArrowRight className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" size={16} />
                    </Button>
                  </div>
              </form>
              <div className="pt-4 border-t border-gray-800">
                   <a 
                     href="https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo&description=CloudForge%20Studio" 
                     target="_blank" 
                     rel="noreferrer"
                     className="block w-full text-center text-sm font-semibold text-primary-400 hover:text-primary-300 hover:underline transition-colors"
                   >
                       Generate New Token (Auto-fill Scopes)
                   </a>
              </div>
           </Card>
           
           <div className="flex justify-center gap-6 text-xs font-semibold text-gray-500 uppercase tracking-widest">
                <span>Forge</span>
                <span>•</span>
                <span>Fabric</span>
                <span>•</span>
                <span>Actions</span>
           </div>

           {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center text-sm font-semibold animate-in slide-in-from-bottom-2">{error}</div>}
        </div>
      </div>
    );
  }

  if (loading && !user) {
    return (
      <div className="h-screen w-screen flex flex-col gap-4 items-center justify-center bg-gray-950 text-primary-500">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
        <p className="text-gray-500 font-mono text-sm">Authenticating...</p>
      </div>
    );
  }

  if (currentRepo && github) {
    return (
      <ErrorBoundary>
        <IDE repo={currentRepo} github={github} onBack={() => setCurrentRepo(null)} />
      </ErrorBoundary>
    );
  }

  return (
    <ProjectList 
      repos={repos} 
      user={user} 
      onSelect={setCurrentRepo} 
      onRefresh={refreshRepos}
      github={github!}
      onLogout={handleLogout}
    />
  );
};

export default App;