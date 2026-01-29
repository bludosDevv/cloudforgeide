import React, { useState, useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
// @ts-ignore
import SimpleEditor from 'react-simple-code-editor';
// @ts-ignore
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-json';

import { FileNode, Repository, WorkflowRun, Artifact } from '../types';
import { GitHubService } from '../services/github';
import { Folder, FileText, ChevronRight, ChevronDown, Menu, Save, Play, Bot, ArrowLeft, Loader2, X, Code2, Copy, Undo, Redo, CheckCircle2, AlertCircle, ExternalLink, MoreVertical, FilePlus, FolderPlus, Trash2, Edit2, Clipboard, ClipboardPaste, Github, Upload, Terminal, Download, Minus, KeyRound, Settings } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { Button, Modal, Input } from './ui';

interface IDEProps {
  repo: Repository;
  github: GitHubService;
  onBack: () => void;
}

// ---- Helper Components ----

const FileTreeItem = ({ node, level, onSelect, expandedFolders, toggleFolder, selectedPath, onMenu }: any) => {
  const isFolder = node.type === 'tree';
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;
  const paddingLeft = `${level * 16 + 12}px`;

  return (
    <div>
      <div 
        className={`flex items-center justify-between py-2 px-2 cursor-pointer text-sm select-none transition-colors border-l-2 ${isSelected ? 'bg-primary-900/20 border-primary-500 text-primary-300' : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
        style={{ paddingLeft }}
        onClick={() => isFolder ? toggleFolder(node.path) : onSelect(node)}
      >
        <div className="flex items-center overflow-hidden">
            <span className="mr-2 opacity-60 flex-shrink-0">
                {isFolder ? (isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <span className="w-3.5 block"></span>}
            </span>
            <span className="mr-2 opacity-90 flex-shrink-0">
                {isFolder ? <Folder size={16} fill="currentColor" className={isExpanded ? "text-primary-400" : "text-gray-500"} /> : <FileText size={16} className="text-gray-500" />}
            </span>
            <span className="truncate font-medium">{node.path.split('/').pop()}</span>
        </div>
        <button 
            className="p-1 hover:bg-gray-700 rounded-md text-gray-500 hover:text-white"
            onClick={(e) => { e.stopPropagation(); onMenu(node); }}
        >
            <MoreVertical size={14} />
        </button>
      </div>
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child: any) => (
            <FileTreeItem 
              key={child.path} 
              node={child} 
              level={level + 1} 
              onSelect={onSelect} 
              expandedFolders={expandedFolders} 
              toggleFolder={toggleFolder}
              selectedPath={selectedPath}
              onMenu={onMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Simple Markdown Renderer for AI Messages
const AiMessageRenderer = ({ text }: { text: string }) => {
  if (text.trim().startsWith('```json')) return <span className="text-xs text-gray-500 italic">Executing actions...</span>;

  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, idx) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);
          
          return (
            <div key={idx} className="bg-gray-950 rounded-lg border border-gray-700 overflow-hidden my-2">
               <div className="flex justify-between items-center px-3 py-1.5 bg-gray-800/50 border-b border-gray-800 text-xs text-gray-400">
                  <span className="font-mono uppercase">{lang || 'CODE'}</span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(code)}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    <Copy size={12} /> Copy
                  </button>
               </div>
               <div className="p-3 overflow-x-auto text-sm font-mono text-gray-300">
                  <pre>{code}</pre>
               </div>
            </div>
          );
        }
        const boldParts = part.split(/(\*\*.*?\*\*)/g);
        return (
            <span key={idx}>
                {boldParts.map((bp, bidx) => (
                    bp.startsWith('**') && bp.endsWith('**') 
                    ? <strong key={bidx} className="text-white font-bold">{bp.slice(2, -2)}</strong> 
                    : <span key={bidx}>{bp}</span>
                ))}
            </span>
        );
      })}
    </div>
  );
};

const BuildOverlay = ({ status, runId, github, repo, onClose, onMinimize }: any) => {
    const [jobs, setJobs] = useState<any[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchJobs = async () => {
             try { 
                 const j = await github.getWorkflowJobs(repo.owner.login, repo.name, runId); 
                 if (isMounted) {
                    setJobs(j);
                    // Simulate log streaming based on job steps
                    if (j.length > 0) {
                        const newLogs = j[0].steps.map((s: any) => {
                            const icon = s.status === 'completed' ? (s.conclusion === 'success' ? '✓' : '✗') : '➜';
                            return `${icon} [${new Date().toLocaleTimeString()}] ${s.name} ... ${s.status}`;
                        });
                        setLogs(newLogs);
                    }
                 }

                 // Check for artifacts if complete
                 if (j.length > 0 && j[0].status === 'completed' && j[0].conclusion === 'success') {
                     const arts = await github.getArtifacts(repo.owner.login, repo.name, runId);
                     if (arts.length > 0 && isMounted) setArtifact(arts[0]);
                 }
             } catch (e) {}
        };
        fetchJobs();
        const interval = setInterval(fetchJobs, 2000);
        return () => { isMounted = false; clearInterval(interval); };
    }, [runId]);

    const handleDownload = async () => {
        if (!artifact) return;
        setDownloading(true);
        try {
            await github.downloadArtifact(artifact.archive_download_url, `${artifact.name}.zip`);
        } catch (e) {
            alert("Download failed: " + e);
        } finally {
            setDownloading(false);
        }
    };

    const isSuccess = status === 'completed' && jobs[0]?.conclusion === 'success';
    const isFailure = status === 'completed' && jobs[0]?.conclusion === 'failure';
    const isActive = status !== 'completed';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-2xl bg-[#0d1117] border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isSuccess ? 'bg-green-500/10 text-green-400' : isFailure ? 'bg-red-500/10 text-red-400' : 'bg-primary-500/10 text-primary-400'}`}>
                            {isActive ? <Loader2 size={18} className="animate-spin" /> : isSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-200 text-sm">Build Pipeline</h3>
                            <p className="text-xs text-gray-500 font-mono">Run ID: {runId}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button onClick={onMinimize} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white" title="Minimize"><Minus size={18}/></button>
                         <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white" title="Close"><X size={18}/></button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-0 bg-black flex flex-col h-[400px]">
                    {/* Terminal Area */}
                    <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1">
                        {logs.map((log, i) => (
                            <div key={i} className={`flex gap-2 ${log.includes('✗') ? 'text-red-400' : log.includes('✓') ? 'text-green-400' : 'text-gray-400'}`}>
                                <span className="opacity-50">{i + 1}</span>
                                <span>{log}</span>
                            </div>
                        ))}
                        {isActive && <div className="text-primary-500 animate-pulse mt-2">_ Building project...</div>}
                    </div>

                    {/* Footer / Actions */}
                    <div className="p-4 bg-gray-900 border-t border-gray-800">
                         {isActive && (
                            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary-500 animate-progress-indeterminate"></div>
                            </div>
                         )}

                         {isSuccess && (
                            <div className="flex items-center justify-between animate-in slide-in-from-bottom-2">
                                <div className="text-green-400 flex items-center gap-2 font-medium text-sm">
                                    <CheckCircle2 size={16}/> Build Successful
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="secondary" onClick={onClose} size="sm">Close</Button>
                                    {artifact && (
                                        <Button variant="primary" onClick={handleDownload} disabled={downloading} className="shadow-green-900/20 bg-green-600 hover:bg-green-500 border-green-500">
                                            {downloading ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}
                                            Download Mod (.jar)
                                        </Button>
                                    )}
                                </div>
                            </div>
                         )}

                         {isFailure && (
                             <div className="flex items-center justify-between text-red-400 animate-in slide-in-from-bottom-2">
                                <span className="flex items-center gap-2 font-medium text-sm"><AlertCircle size={16}/> Build Failed</span>
                                <Button variant="secondary" onClick={onClose}>Close</Button>
                             </div>
                         )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---- Main Component ----

const IDE: React.FC<IDEProps> = ({ repo, github, onBack }) => {
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [currentFile, setCurrentFile] = useState<{path: string, content: string, sha: string} | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiHistory, setAiHistory] = useState<{role: string, parts: {text: string}[]}[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  
  // Build State
  const [activeBuild, setActiveBuild] = useState<WorkflowRun | null>(null);
  const [isBuildMinimized, setIsBuildMinimized] = useState(false);
  const [lastBuildId, setLastBuildId] = useState<number>(0);
  const [isWaitingForBuild, setIsWaitingForBuild] = useState(false);

  // AI Configuration State
  const [isAiReady, setIsAiReady] = useState(false);
  const [inlineApiKey, setInlineApiKey] = useState("");
  const [showAiSettings, setShowAiSettings] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // File Manager State
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null); // For context menu
  const [clipboard, setClipboard] = useState<{path: string, type: 'copy' | 'cut'} | null>(null);
  const [modalMode, setModalMode] = useState<'create_file' | 'create_folder' | 'rename' | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [creationContextPath, setCreationContextPath] = useState<string>(""); 
  const [importTargetFolder, setImportTargetFolder] = useState<string>("");

  // Lazy init Gemini
  const gemini = useRef<GeminiService | null>(null);
  
  // Initialize AI on mount or when key changes
  useEffect(() => {
      try {
          if (!gemini.current) {
              const storedKey = localStorage.getItem('gemini_api_key');
              gemini.current = new GeminiService(storedKey || undefined);
          }
          if (gemini.current && gemini.current.isConfigured()) {
              setIsAiReady(true);
          } else {
              setIsAiReady(false);
          }
      } catch (e) {
          console.error("Gemini init failed:", e);
          setIsAiReady(false);
      }
  }, []);

  // Force re-check when opening panel
  useEffect(() => {
      if (isAIOpen && gemini.current) {
          if (gemini.current.isConfigured()) setIsAiReady(true);
      }
  }, [isAIOpen]);

  const handleAiToggle = () => {
      setIsAIOpen(!isAIOpen);
  };
  
  const handleSaveInlineKey = () => {
      if (!gemini.current || !inlineApiKey.trim()) return;
      gemini.current.updateConfiguration(inlineApiKey.trim());
      setIsAiReady(true);
      setShowAiSettings(false);
  };

  const handleClearKey = () => {
      localStorage.removeItem('gemini_api_key');
      if (gemini.current) {
          gemini.current = new GeminiService(undefined);
      }
      setIsAiReady(false);
      setInlineApiKey("");
  };

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Intelligent Build Polling
  useEffect(() => {
    let interval: any;
    
    const checkBuilds = async () => {
        try {
            const runs = await github.getWorkflowRuns(repo.owner.login, repo.name);
            const latest = runs[0];
            
            if (!latest) return;

            // Case 1: We are explicitly waiting for a new build after a save
            if (isWaitingForBuild) {
                // If we found a run that is newer than our "known" last run
                if (latest.id > lastBuildId) {
                    setActiveBuild(latest);
                    setIsBuildMinimized(false);
                    setIsWaitingForBuild(false); // Stop "waiting" mode, start "tracking" mode
                    setLastBuildId(latest.id);
                }
            } 
            // Case 2: Tracking an active build
            else if (activeBuild && activeBuild.id === latest.id) {
                setActiveBuild(latest); // Update status
                if (latest.status === 'completed') {
                    // Do not auto-close, let user see it
                }
            }
            // Case 3: Passive check for external builds (optional, but good)
            else if (!activeBuild && latest.status === 'in_progress' && latest.id > lastBuildId) {
                setActiveBuild(latest);
                setLastBuildId(latest.id);
            }
            // Store highest seen ID to avoid re-opening old builds
            if (latest.id > lastBuildId) setLastBuildId(latest.id);

        } catch (e) {}
    };

    // Poll frequently if waiting or building, else slower
    const pollRate = isWaitingForBuild ? 2000 : (activeBuild?.status === 'in_progress' ? 3000 : 10000);
    interval = setInterval(checkBuilds, pollRate);
    checkBuilds(); // Initial check

    return () => clearInterval(interval);
  }, [repo, activeBuild, isWaitingForBuild, lastBuildId]);

  const loadTree = async () => {
      try {
        const { tree } = await github.getRepoTree(repo.owner.login, repo.name);
        const root: any[] = [];
        const map: any = {};
        tree.forEach((node: any) => { map[node.path] = { ...node, children: [] }; });
        tree.forEach((node: any) => {
             const parts = node.path.split('/');
             if (parts.length > 1) {
                 const parentPath = parts.slice(0, -1).join('/');
                 if (map[parentPath]) map[parentPath].children.push(map[node.path]);
                 else root.push(map[node.path]); 
             } else root.push(map[node.path]);
        });
        const sortNodes = (nodes: any[]) => {
            nodes.sort((a, b) => {
                if (a.type === b.type) return a.path.localeCompare(b.path);
                return a.type === 'tree' ? -1 : 1;
            });
            nodes.forEach(n => { if (n.children.length) sortNodes(n.children); });
        };
        sortNodes(root);
        setFileTree(root);
      } catch (e) { console.error(e); }
  };

  useEffect(() => { loadTree(); }, [repo, github]);

  // ---- Editor Actions ----

  const handleFileSelect = async (node: FileNode) => {
    try {
      setSelectedNode(node);
      const content = await github.getFileContent(repo.owner.login, repo.name, node.path);
      setCurrentFile({ path: node.path, content, sha: node.sha });
      setEditorContent(content);
      if (isMobile) setIsSidebarOpen(false);
    } catch (e) { alert("Error loading file"); }
  };

  const handleSave = async () => {
    if (!currentFile) return;
    setIsSaving(true);
    try {
      await github.updateFile(repo.owner.login, repo.name, currentFile.path, editorContent, `Update ${currentFile.path}`, currentFile.sha);
      await loadTree(); 
      // Trigger Build Wait
      setIsWaitingForBuild(true);
    } catch (e) { alert("Failed to save: " + e); } finally { setIsSaving(false); }
  };

  const handleUndo = () => editorRef.current?.trigger('keyboard', 'undo', null);
  const handleRedo = () => editorRef.current?.trigger('keyboard', 'redo', null);

  // ---- File Manager Actions ----

  const setupCreate = (mode: 'create_file' | 'create_folder', contextPath?: string) => {
      setCreationContextPath(contextPath || "");
      setModalMode(mode);
  };

  const executeModalAction = async () => {
      if (!modalInput) return;
      let basePath = creationContextPath;
      if (!basePath && selectedNode) {
         basePath = selectedNode.type === 'tree' ? selectedNode.path : (selectedNode.path.split('/').slice(0, -1).join('/'));
      }
      const cleanPath = (p: string) => p.startsWith('/') ? p.slice(1) : p;
      const targetPath = cleanPath(basePath ? `${basePath}/${modalInput}` : modalInput);

      try {
          if (modalMode === 'create_file') {
              await github.updateFile(repo.owner.login, repo.name, targetPath, "", "Create " + modalInput);
          } else if (modalMode === 'create_folder') {
              await github.updateFile(repo.owner.login, repo.name, `${targetPath}/.keep`, "", "Create folder " + modalInput);
          } else if (modalMode === 'rename' && selectedNode) {
              if (selectedNode.type === 'tree') { alert("Folder rename not supported yet."); return; }
              const content = await github.getFileContent(repo.owner.login, repo.name, selectedNode.path);
              const parent = selectedNode.path.split('/').slice(0, -1).join('/');
              const newPath = cleanPath(parent ? `${parent}/${modalInput}` : modalInput);
              await github.updateFile(repo.owner.login, repo.name, newPath, content, `Rename ${selectedNode.path} to ${newPath}`);
              await github.deleteFile(repo.owner.login, repo.name, selectedNode.path, `Delete old ${selectedNode.path}`, selectedNode.sha);
          }
          await loadTree();
          setModalMode(null); setModalInput(""); setSelectedNode(null); setCreationContextPath("");
      } catch (e: any) { alert("Action failed: " + e.message); }
  };

  const handleDeleteFile = async () => {
      if (!selectedNode) return;
      if (!window.confirm(`Delete ${selectedNode.path}?`)) return;
      try {
          if (selectedNode.type === 'tree') { alert("Folder deletion requires deleting all files inside manually."); return; }
          await github.deleteFile(repo.owner.login, repo.name, selectedNode.path, "Delete " + selectedNode.path, selectedNode.sha);
          await loadTree();
          if (currentFile?.path === selectedNode.path) setCurrentFile(null);
          setSelectedNode(null);
      } catch (e: any) { alert("Delete failed: " + e.message); }
  };

  const handleCopy = () => { if (selectedNode && selectedNode.type === 'blob') setClipboard({ path: selectedNode.path, type: 'copy' }); };

  const handlePaste = async () => {
      if (!clipboard || !selectedNode) return;
      try {
          const destFolder = selectedNode.type === 'tree' ? selectedNode.path : selectedNode.path.split('/').slice(0, -1).join('/');
          const fileName = clipboard.path.split('/').pop();
          const newPath = destFolder ? `${destFolder}/${fileName}` : fileName;
          const content = await github.getFileContent(repo.owner.login, repo.name, clipboard.path);
          await github.updateFile(repo.owner.login, repo.name, newPath!, content, `Copy ${fileName}`);
          await loadTree();
          setClipboard(null); setSelectedNode(null);
      } catch (e: any) { alert("Paste failed: " + e.message); }
  };

  const triggerImport = (folderPath: string) => {
      setImportTargetFolder(folderPath);
      if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const confirmMsg = `Import ${files.length} file(s) into '${importTargetFolder || 'root'}'?`;
      if (!window.confirm(confirmMsg)) return;

      try {
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const reader = new FileReader();
              await new Promise<void>((resolve, reject) => {
                  reader.onload = async () => {
                      try {
                          const base64Content = (reader.result as string).split(',')[1];
                          const targetPath = importTargetFolder ? `${importTargetFolder}/${file.name}` : file.name;
                          await github.uploadFile(repo.owner.login, repo.name, targetPath, base64Content, `Import ${file.name}`);
                          resolve();
                      } catch (err) { reject(err); }
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
              });
          }
          await loadTree();
      } catch (err: any) { alert("Import failed: " + err.message); } 
      finally { if (fileInputRef.current) fileInputRef.current.value = ''; setImportTargetFolder(""); setSelectedNode(null); }
  };

  // ---- AI Logic ----

  const handleAiSend = async () => {
      if (!aiMessage.trim()) return;
      if (!gemini.current || !isAiReady) return;

      const userMsg = aiMessage;
      setAiMessage("");
      setAiHistory(prev => [...prev, { role: "user", parts: [{ text: userMsg }] }]);
      setAiLoading(true);
      
      const context = `Current File: ${currentFile?.path || 'None'}\nFile Tree: ${fileTree.map(f => f.path).join(', ')}`;
      const responseText = await gemini.current.chat(userMsg, context, aiHistory);
      
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      let displayText = responseText;

      if (jsonMatch) {
          try {
              const data = JSON.parse(jsonMatch[1]);
              displayText = data.text;
              if (data.actions && Array.isArray(data.actions)) {
                  for (const action of data.actions) {
                      if (action.type === 'create' || action.type === 'update') {
                          await github.updateFile(repo.owner.login, repo.name, action.path, action.content, `AI: ${action.type} ${action.path}`);
                      } else if (action.type === 'delete') {
                          const items = await github.getRepoTree(repo.owner.login, repo.name);
                          const item = items.tree.find(t => t.path === action.path);
                          if (item) await github.deleteFile(repo.owner.login, repo.name, action.path, `AI: delete ${action.path}`, item.sha);
                      }
                  }
                  await loadTree();
                  displayText += "\n\n✅ **Project updated successfully.**";
              }
          } catch (e) {
              console.error("AI JSON Error", e);
              displayText += "\n\n⚠️ Failed to execute AI actions automatically.";
          }
      }

      setAiHistory(prev => [...prev, { role: "model", parts: [{ text: displayText }] }]);
      setAiLoading(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-gray-950 overflow-hidden text-gray-200 fixed inset-0">
        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
        
        {/* Build Overlay */}
        {activeBuild && !isBuildMinimized && (
            <BuildOverlay 
                status={activeBuild.status} 
                runId={activeBuild.id} 
                github={github} 
                repo={repo} 
                onClose={() => setActiveBuild(null)} 
                onMinimize={() => setIsBuildMinimized(true)}
            />
        )}
        
        {/* Minimized Build Indicator */}
        {activeBuild && isBuildMinimized && (
             <div 
                className="fixed bottom-4 right-4 z-50 bg-gray-900 border border-gray-700 shadow-xl rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-800 transition-colors animate-in slide-in-from-bottom-5"
                onClick={() => setIsBuildMinimized(false)}
             >
                <Terminal size={16} className={activeBuild.status === 'in_progress' ? 'text-primary-400 animate-pulse' : 'text-green-400'} />
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-200">Build #{activeBuild.id}</span>
                    <span className="text-[10px] text-gray-500 uppercase">{activeBuild.status}</span>
                </div>
             </div>
        )}

        {/* Header */}
        <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-3 gap-3 z-30 shrink-0">
            <div className="flex items-center gap-2">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-800 rounded-md text-gray-400">
                    <Menu size={20} />
                </button>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-500 uppercase">{repo.name}</span>
                  <span className="text-sm font-bold text-gray-200 truncate max-w-[120px]">{currentFile?.path.split('/').pop()}</span>
                </div>
                {isWaitingForBuild && (
                    <div className="ml-2 flex items-center gap-2 px-2 py-1 rounded bg-yellow-500/10 text-yellow-500 text-xs border border-yellow-500/20">
                        <Loader2 size={12} className="animate-spin" />
                        Queuing Build...
                    </div>
                )}
            </div>
            
            <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-lg">
                <button onClick={handleUndo} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="Undo"><Undo size={16}/></button>
                <button onClick={handleRedo} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="Redo"><Redo size={16}/></button>
            </div>

            <div className="flex items-center gap-2">
                <a href={repo.html_url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-white" title="Open in GitHub"><Github size={20}/></a>
                <button 
                    className={`p-2 rounded-lg flex items-center gap-2 transition-all ${isSaving ? 'text-gray-500 bg-gray-800' : 'text-primary-400 hover:bg-primary-500/10'}`}
                    onClick={handleSave} 
                    disabled={isSaving}
                >
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  <span className="hidden md:inline text-xs font-bold">{isSaving ? 'Pushing...' : 'Save & Build'}</span>
                </button>
                <button 
                    className={`p-2 rounded-lg transition-colors ${isAIOpen ? 'bg-fuchsia-600 text-white' : 'text-fuchsia-400 hover:bg-fuchsia-500/10'}`} 
                    onClick={handleAiToggle}
                >
                  <Bot size={20} />
                </button>
            </div>
        </div>

        {/* Workspace Container - Crucial for layout fix */}
        <div className="flex-1 flex overflow-hidden relative w-full">
            
            {/* Sidebar (File Manager) */}
            <div className={`fixed md:static inset-y-0 left-0 bg-gray-900 border-r border-gray-800 z-40 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:w-0'} w-[85vw] max-w-xs md:w-72 top-14 md:top-0 h-[calc(100%-3.5rem)] md:h-full flex flex-col shadow-2xl md:shadow-none`}>
                {/* File Toolbar */}
                <div className="p-2 border-b border-gray-800 flex gap-1 justify-around bg-gray-900 shrink-0">
                    <button onClick={() => setupCreate('create_file')} className="p-2 hover:bg-gray-800 rounded text-gray-400" title="New File"><FilePlus size={18}/></button>
                    <button onClick={() => setupCreate('create_folder')} className="p-2 hover:bg-gray-800 rounded text-gray-400" title="New Folder"><FolderPlus size={18}/></button>
                    <button onClick={() => triggerImport("")} className="p-2 hover:bg-gray-800 rounded text-gray-400" title="Import Files"><Upload size={18}/></button>
                    <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded text-gray-400" title="Back"><ArrowLeft size={18}/></button>
                </div>

                <div className="flex-1 overflow-y-auto py-2">
                    {fileTree.map(node => (
                        <FileTreeItem 
                            key={node.path} 
                            node={node} 
                            level={0} 
                            onSelect={handleFileSelect} 
                            expandedFolders={expandedFolders}
                            toggleFolder={(path: string) => {
                                const next = new Set(expandedFolders);
                                if (next.has(path)) next.delete(path); else next.add(path);
                                setExpandedFolders(next);
                            }}
                            selectedPath={selectedNode?.path || currentFile?.path}
                            onMenu={setSelectedNode}
                        />
                    ))}
                </div>
            </div>

            {/* Context Menu Modal */}
            {selectedNode && !modalMode && (
                 <div className="absolute left-0 top-0 z-50 p-2 bg-gray-800 rounded-lg shadow-xl border border-gray-700 m-2 flex flex-col gap-2 min-w-[220px] animate-in zoom-in-95">
                     <div className="flex justify-between items-center px-2 pb-2 border-b border-gray-700">
                        <span className="text-xs font-bold truncate max-w-[150px] text-gray-400">{selectedNode.path.split('/').pop()}</span>
                        <button onClick={() => setSelectedNode(null)}><X size={14}/></button>
                     </div>
                     
                     {selectedNode.type === 'tree' && (
                        <>
                          <button onClick={() => setupCreate('create_file', selectedNode.path)} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded text-sm text-primary-400"><FilePlus size={16}/> New File Here</button>
                          <button onClick={() => setupCreate('create_folder', selectedNode.path)} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded text-sm text-primary-400"><FolderPlus size={16}/> New Folder Here</button>
                          <button onClick={() => triggerImport(selectedNode.path)} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded text-sm text-primary-400"><Upload size={16}/> Import Files Here</button>
                          <div className="h-px bg-gray-700 my-1"></div>
                        </>
                     )}

                     <button onClick={() => setModalMode('rename')} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded text-sm"><Edit2 size={16}/> Rename</button>
                     <button onClick={handleCopy} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded text-sm"><Clipboard size={16}/> Copy</button>
                     {clipboard && <button onClick={handlePaste} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded text-sm"><ClipboardPaste size={16}/> Paste to here</button>}
                     <div className="h-px bg-gray-700 my-1"></div>
                     <button onClick={handleDeleteFile} className="flex items-center gap-2 p-2 hover:bg-red-900/30 text-red-400 rounded text-sm"><Trash2 size={16}/> Delete</button>
                 </div>
            )}

            {/* Create/Rename Modal */}
            <Modal isOpen={!!modalMode} onClose={() => setModalMode(null)} title={modalMode === 'rename' ? 'Rename' : 'Create New'}>
                <div className="space-y-4">
                    <p className="text-xs text-gray-500">
                        {modalMode === 'rename' ? `Renaming: ${selectedNode?.path}` : `Creating in: ${creationContextPath || (selectedNode?.type === 'tree' ? selectedNode.path : 'root')}`}
                    </p>
                    <Input autoFocus value={modalInput} onChange={(e:any) => setModalInput(e.target.value)} placeholder={modalMode === 'rename' ? 'New Name' : 'Name'} />
                    <Button onClick={executeModalAction} className="w-full">Confirm</Button>
                </div>
            </Modal>

            {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>}

            {/* Editor */}
            <div className="flex-1 relative overflow-hidden bg-gray-950 flex flex-col h-full">
                {currentFile ? (
                    <div className="flex-1 relative h-full">
                        {isMobile ? (
                             <div className="flex-1 overflow-auto h-full font-mono text-sm bg-[#1f2937]">
                                <SimpleEditor
                                    value={editorContent}
                                    onValueChange={setEditorContent}
                                    highlight={(code: string) => Prism.highlight(code, Prism.languages.java, 'java')}
                                    padding={15}
                                    style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, minHeight: '100%' }}
                                />
                             </div>
                        ) : (
                            <Editor
                                height="100%"
                                defaultLanguage="java"
                                path={currentFile.path}
                                value={editorContent}
                                onChange={(val) => setEditorContent(val || "")}
                                onMount={(editor) => { editorRef.current = editor; }}
                                theme="vs-dark"
                                options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", padding: { top: 16 } }}
                            />
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-700">
                        <Code2 size={64} className="mb-4 opacity-20" />
                        <p>Select a file to edit</p>
                    </div>
                )}
            </div>

            {/* AI Panel */}
            {isAIOpen && (
                <div className="absolute inset-y-0 right-0 w-full md:w-[400px] bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col z-[60] animate-in slide-in-from-right duration-200">
                    <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                        <span className="font-bold text-fuchsia-400 flex gap-2 items-center"><Bot size={18}/> AI Architect</span>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setShowAiSettings(!showAiSettings)} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="AI Settings">
                                <Settings size={16} />
                            </button>
                            <button onClick={() => setIsAIOpen(false)} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"><X size={18}/></button>
                        </div>
                    </div>

                    {!isAiReady || showAiSettings ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-400 space-y-4">
                            <Bot size={48} className="opacity-20" />
                            <p className="font-medium">{showAiSettings ? "AI Configuration" : "AI Architect is not configured."}</p>
                            
                            <div className="w-full bg-gray-800 p-4 rounded-xl border border-gray-700 space-y-3">
                                <p className="text-xs text-gray-400 text-left">Enter your Gemini API Key to enable AI features.</p>
                                <Input 
                                    placeholder="Paste API Key here..." 
                                    value={inlineApiKey}
                                    onChange={(e:any) => setInlineApiKey(e.target.value)}
                                    type="password"
                                />
                                <div className="flex gap-2">
                                    <Button onClick={handleSaveInlineKey} className="flex-1" disabled={!inlineApiKey}>Save & Enable</Button>
                                    {isAiReady && showAiSettings && (
                                        <Button variant="danger" onClick={handleClearKey} title="Clear Key"><Trash2 size={16}/></Button>
                                    )}
                                </div>
                            </div>
                            
                            <div className="text-xs text-gray-500">
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-primary-400 hover:underline">Get a free API Key</a>
                            </div>
                            
                            {showAiSettings && isAiReady && (
                                <button onClick={() => setShowAiSettings(false)} className="text-xs text-gray-400 hover:text-white underline">Cancel</button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900">
                                {aiHistory.length === 0 && (
                                    <div className="text-center text-gray-600 mt-10 text-sm">
                                        <p>Ready to help!</p>
                                        <p className="text-xs mt-2">Try asking: "Create a new Item class"</p>
                                    </div>
                                )}
                                {aiHistory.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[95%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
                                            <AiMessageRenderer text={msg.parts[0].text} />
                                        </div>
                                    </div>
                                ))}
                                {aiLoading && <Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" />}
                            </div>
                            <div className="p-3 bg-gray-800 border-t border-gray-700 flex gap-2 shrink-0 pb-6 md:pb-3">
                                <input className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-fuchsia-500" 
                                    placeholder="Ask AI to edit files..." 
                                    value={aiMessage} onChange={(e) => setAiMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiSend()} />
                                <button onClick={handleAiSend} className="p-2 bg-fuchsia-600 text-white rounded-lg"><ArrowLeft size={18} className="rotate-90" /></button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default IDE;