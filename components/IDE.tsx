import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Folder, FileText, ChevronRight, ChevronDown, Menu, Save, Play, Bot, ArrowLeft, Loader2, X, Code2, Copy, Undo, Redo, CheckCircle2, AlertCircle, ExternalLink, MoreVertical, FilePlus, FolderPlus, Trash2, Edit2, Clipboard, ClipboardPaste, Github, Upload, Terminal, Download, Minus, KeyRound, Settings, CloudUpload } from 'lucide-react';
import { GeminiService } from '../services/gemini';
import { Button, Modal, Input, Select } from './ui';

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

  // Status Colors
  let statusColor = "text-gray-500";
  if (node.status === 'new') statusColor = "text-green-400";
  else if (node.status === 'modified') statusColor = "text-yellow-400";

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
            <span className={`mr-2 flex-shrink-0 ${statusColor}`}>
                {isFolder ? <Folder size={16} fill="currentColor" className={isExpanded ? "text-primary-400" : ""} /> : <FileText size={16} />}
            </span>
            <span className={`truncate font-medium ${node.status ? 'italic' : ''}`}>
                {node.path.split('/').pop()}
                {node.status && <span className="ml-2 text-[10px] uppercase opacity-60 font-bold tracking-wider">({node.status === 'modified' ? 'M' : 'N'})</span>}
            </span>
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
  if (text.trim().startsWith('{') && text.includes('"actions"')) {
       try {
           const parsed = JSON.parse(text);
           return <span>{parsed.text}</span>;
       } catch (e) {
           return <span className="text-xs text-gray-500 italic">Executing AI actions...</span>;
       }
  }

  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, idx) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);
          
          if (lang === 'json') return null; 

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
                    if (j.length > 0) {
                        const newLogs = j[0].steps.map((s: any) => {
                            const icon = s.status === 'completed' ? (s.conclusion === 'success' ? '✓' : '✗') : '➜';
                            return `${icon} [${new Date().toLocaleTimeString()}] ${s.name} ... ${s.status}`;
                        });
                        setLogs(newLogs);
                    }
                 }
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
                <div className="p-0 bg-black flex flex-col h-[400px]">
                    <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1">
                        {logs.map((log, i) => (
                            <div key={i} className={`flex gap-2 ${log.includes('✗') ? 'text-red-400' : log.includes('✓') ? 'text-green-400' : 'text-gray-400'}`}>
                                <span className="opacity-50">{i + 1}</span>
                                <span>{log}</span>
                            </div>
                        ))}
                        {isActive && <div className="text-primary-500 animate-pulse mt-2">_ Building project...</div>}
                    </div>
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
  
  // -- State --
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  
  // LOCAL CACHE: Map path -> content (string)
  const [fileCache, setFileCache] = useState<Record<string, string>>({});
  
  // TRACKING: Sets of paths
  const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set());
  const [newFiles, setNewFiles] = useState<Set<string>>(new Set());
  
  // Deleted Paths Ref: Suppress these from showing up in tree until confirmed gone from server
  const deletedPathsRef = useRef<Set<string>>(new Set());

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [currentFile, setCurrentFile] = useState<{path: string} | null>(null);
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
  const [inlineModel, setInlineModel] = useState("gemini-3-flash-preview");
  const [showAiSettings, setShowAiSettings] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // File Manager State
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [modalMode, setModalMode] = useState<'create_file' | 'create_folder' | 'rename' | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [creationContextPath, setCreationContextPath] = useState<string>(""); 
  
  // Refs for polling access to state
  const unsavedChangesRef = useRef(unsavedChanges);
  const newFilesRef = useRef(newFiles);
  
  useEffect(() => { unsavedChangesRef.current = unsavedChanges; }, [unsavedChanges]);
  useEffect(() => { newFilesRef.current = newFiles; }, [newFiles]);

  const gemini = useRef<GeminiService | null>(null);

  // -- Initialization --

  useEffect(() => {
      try {
          if (!gemini.current) {
              const storedKey = localStorage.getItem('gemini_api_key');
              gemini.current = new GeminiService(storedKey || undefined);
          }
          if (gemini.current && gemini.current.isConfigured()) setIsAiReady(true);
          const storedModel = localStorage.getItem('gemini_model');
          if (storedModel) setInlineModel(storedModel);
      } catch (e) {
          console.error("Gemini init failed:", e);
      }
  }, []);

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAiToggle = () => setIsAIOpen(!isAIOpen);
  
  const handleSaveInlineKey = () => {
      if (!gemini.current) return;
      if (inlineApiKey.trim()) gemini.current.updateConfiguration(inlineApiKey.trim());
      gemini.current.updateConfiguration(undefined as any, inlineModel);
      setIsAiReady(true);
      setShowAiSettings(false);
  };

  const handleClearKey = () => {
      localStorage.removeItem('gemini_api_key');
      if (gemini.current) gemini.current = new GeminiService(undefined);
      setIsAiReady(false);
      setInlineApiKey("");
  };

  // -- Build & Tree Polling --
  
  // Load tree function that merges server state with local state
  const refreshTree = useCallback(async (isInitial: boolean = false) => {
      try {
        const { tree } = await github.getRepoTree(repo.owner.login, repo.name);
        
        // --- GHOST PREVENTION LOGIC ---
        // Identify paths that are in our deleted suppression list but NOT in the server tree anymore.
        // These are confirmed deletions, so we can remove them from suppression list.
        const serverPathSet = new Set(tree.map((n:any) => n.path));
        deletedPathsRef.current.forEach(path => {
            if (!serverPathSet.has(path)) {
                deletedPathsRef.current.delete(path);
            }
        });
        // ------------------------------

        // Convert flat tree to hierarchical
        const root: any[] = [];
        const map: any = {};
        
        // 1. Process Server Nodes
        tree.forEach((node: any) => { 
            // Block ghosts: if deleted locally (and pending sync) OR recreated locally, ignore server version
            if (deletedPathsRef.current.has(node.path)) return;
            // If we have a local "new" file with same path, ignore server (prevents old version from overwriting new empty file)
            if (newFilesRef.current.has(node.path)) return;

            // If it's modified locally, keep the 'modified' status
            const isUnsaved = unsavedChangesRef.current.has(node.path);
            map[node.path] = { 
                ...node, 
                children: [], 
                status: isUnsaved ? 'modified' : 'synced' 
            }; 
        });

        // 2. Add Local New Files (that aren't on server yet)
        newFilesRef.current.forEach(path => {
             if (!map[path]) {
                 map[path] = {
                     path: path,
                     mode: '100644', // Default
                     type: path.includes('.') ? 'blob' : 'tree', // Simple guess
                     children: [],
                     status: 'new'
                 };
             }
        });

        // 3. Build Hierarchy
        const allPaths = Object.keys(map).sort();
        allPaths.forEach((path: string) => {
             const node = map[path];
             const parts = path.split('/');
             if (parts.length > 1) {
                 const parentPath = parts.slice(0, -1).join('/');
                 if (map[parentPath]) {
                     map[parentPath].children.push(node);
                 } else {
                     // Parent missing (maybe local new folder not tracked in ref yet or git glitch), add to root
                     root.push(node);
                 }
             } else {
                 root.push(node);
             }
        });
        
        // 4. Sorting
        const sortNodes = (nodes: any[]) => {
            nodes.sort((a, b) => {
                if (a.type === b.type) return a.path.localeCompare(b.path);
                return a.type === 'tree' ? -1 : 1;
            });
            nodes.forEach(n => { if (n.children.length) sortNodes(n.children); });
        };
        sortNodes(root);
        setFileTree(root);
        
        // Initial load cleanup
        if (isInitial) {
            setFileCache({});
            setUnsavedChanges(new Set());
            setNewFiles(new Set());
            deletedPathsRef.current.clear();
        }

      } catch (e) { console.error("Poll Error", e); }
  }, [repo, github]);

  // Initial Load
  useEffect(() => { refreshTree(true); }, [repo, github]);

  // Periodic Poll (Every 5s)
  useEffect(() => {
      const interval = setInterval(() => {
          refreshTree(false);
      }, 5000);
      return () => clearInterval(interval);
  }, [refreshTree]);

  // Build polling
  useEffect(() => {
    let interval: any;
    const checkBuilds = async () => {
        try {
            const runs = await github.getWorkflowRuns(repo.owner.login, repo.name);
            const latest = runs[0];
            if (!latest) return;
            if (isWaitingForBuild) {
                if (latest.id > lastBuildId) {
                    setActiveBuild(latest);
                    setIsBuildMinimized(false);
                    setIsWaitingForBuild(false);
                    setLastBuildId(latest.id);
                }
            } else if (activeBuild && activeBuild.id === latest.id) {
                setActiveBuild(latest);
            } else if (!activeBuild && latest.status === 'in_progress' && latest.id > lastBuildId) {
                setActiveBuild(latest);
                setLastBuildId(latest.id);
            }
            if (latest.id > lastBuildId) setLastBuildId(latest.id);
        } catch (e) {}
    };
    const pollRate = isWaitingForBuild ? 2000 : (activeBuild?.status === 'in_progress' ? 3000 : 10000);
    interval = setInterval(checkBuilds, pollRate);
    checkBuilds(); 
    return () => clearInterval(interval);
  }, [repo, activeBuild, isWaitingForBuild, lastBuildId]);

  // -- File System Logic --

  // Helper to safely update tree state recursively
  const updateTreeState = (nodes: FileNode[], path: string, updater: (node: FileNode) => FileNode | null): FileNode[] => {
      return nodes.map(node => {
          if (node.path === path) return updater(node);
          if (node.children) {
              const newChildren = updateTreeState(node.children, path, updater).filter(Boolean) as FileNode[];
              return { ...node, children: newChildren };
          }
          return node;
      }).filter(Boolean) as FileNode[];
  };

  // Helper to add node to tree
  const addNodeToTree = (nodes: FileNode[], parentPath: string, newNode: FileNode): FileNode[] => {
      if (parentPath === "") return [...nodes, newNode].sort((a,b) => a.type === b.type ? a.path.localeCompare(b.path) : a.type === 'tree' ? -1 : 1);
      
      return nodes.map(node => {
          if (node.path === parentPath) {
              const children = node.children ? [...node.children, newNode] : [newNode];
              // Sort
              children.sort((a,b) => a.type === b.type ? a.path.localeCompare(b.path) : a.type === 'tree' ? -1 : 1);
              return { ...node, children };
          }
          if (node.children) {
              return { ...node, children: addNodeToTree(node.children, parentPath, newNode) };
          }
          return node;
      });
  };

  const handleFileSelect = async (node: FileNode) => {
    try {
      if (node.type === 'tree') return; // Should be handled by toggleFolder
      setSelectedNode(node);
      
      // 1. Check Local Cache first
      if (fileCache[node.path] !== undefined) {
          setCurrentFile({ path: node.path });
          if (isMobile) setIsSidebarOpen(false);
          return;
      }

      // 2. Fetch from GitHub if not cached
      const content = await github.getFileContent(repo.owner.login, repo.name, node.path);
      
      // 3. Update Cache (mark as synced initially)
      setFileCache(prev => ({ ...prev, [node.path]: content }));
      setCurrentFile({ path: node.path });
      
      if (isMobile) setIsSidebarOpen(false);
    } catch (e) { alert("Error loading file"); }
  };

  const handleEditorChange = (value: string | undefined) => {
      const val = value || "";
      if (!currentFile) return;
      
      // Update Cache
      setFileCache(prev => ({ ...prev, [currentFile.path]: val }));
      
      // Mark as Modified
      if (!newFiles.has(currentFile.path)) { // If it's new, it stays 'new'
          setUnsavedChanges(prev => new Set(prev).add(currentFile.path));
          
          // Update visual tree status
          setFileTree(prev => updateTreeState(prev, currentFile.path, (node) => ({ ...node, status: node.status === 'new' ? 'new' : 'modified' })));
      }
  };

  const handleSyncToGithub = async () => {
    setIsSaving(true);
    let errorCount = 0;
    try {
        const changes = Array.from(unsavedChanges);
        const creates = Array.from(newFiles);

        if (changes.length === 0 && creates.length === 0) {
            alert("No changes to sync.");
            setIsSaving(false);
            return;
        }

        // Handle Creates & Updates (GitHub treats them similarly via PUT)
        const allModified = new Set([...changes, ...creates]);
        
        for (const path of allModified) {
            const content = fileCache[path];
            if (content === undefined) continue;

            const msg = newFiles.has(path) ? `Create ${path}` : `Update ${path}`;
            try {
                await github.updateFile(repo.owner.login, repo.name, path, content, msg);
            } catch (e) {
                console.error("Update failed for", path, e);
                errorCount++;
            }
        }

        if (errorCount > 0) {
            alert(`Sync finished with ${errorCount} errors.`);
        }
        await refreshTree(true); // Hard refresh after sync
        setIsWaitingForBuild(true);

    } catch (e: any) {
        alert("Sync failed: " + e.message);
    } finally {
        setIsSaving(false);
    }
  };

  // ---- Instant Undo/Redo Fix ----
  const handleUndo = () => {
      if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.trigger('source', 'undo', null);
      }
  };
  const handleRedo = () => {
       if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.trigger('source', 'redo', null);
      }
  };

  // ---- File Manager Actions (Instant) ----

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

      // If we are recreating a file that was "deleted" (suppressed), remove it from suppression list
      if (deletedPathsRef.current.has(targetPath)) {
          deletedPathsRef.current.delete(targetPath);
      }

      // INSTANT UPDATE
      if (modalMode === 'create_file') {
          const newNode: FileNode = {
              path: targetPath,
              type: 'blob',
              mode: '100644',
              status: 'new'
          };
          setFileTree(prev => addNodeToTree(prev, basePath, newNode));
          setNewFiles(prev => new Set(prev).add(targetPath));
          setFileCache(prev => ({ ...prev, [targetPath]: "" }));
          setCurrentFile({ path: targetPath }); // Open it
      } 
      else if (modalMode === 'create_folder') {
          const folderPath = targetPath;
          const keepFile = `${folderPath}/.keep`;
          const newNode: FileNode = {
              path: folderPath,
              type: 'tree',
              mode: '040000',
              status: 'new',
              children: [{ path: keepFile, type: 'blob', mode: '100644', status: 'new' }]
          };
          setFileTree(prev => addNodeToTree(prev, basePath, newNode));
          setNewFiles(prev => new Set(prev).add(keepFile)); // Git tracks files, not folders
          setFileCache(prev => ({ ...prev, [keepFile]: "" }));
          setExpandedFolders(prev => new Set(prev).add(folderPath));
      }
      else if (modalMode === 'rename' && selectedNode) {
          alert("Please sync changes before renaming.");
      }

      setModalMode(null); setModalInput(""); setSelectedNode(null); setCreationContextPath("");
  };

  const handleDeleteFile = async () => {
      const nodeToDelete = selectedNode;
      if (!nodeToDelete) return;

      // Close modal immediately and clear selection
      setSelectedNode(null);
      if (currentFile && (currentFile.path === nodeToDelete.path || nodeToDelete.path.startsWith(currentFile.path + '/'))) {
          setCurrentFile(null);
      }

      // 1. SUPPRESSION & COLLECTION
      // We collect all paths (including children) and add them to the suppression list (deletedPathsRef)
      // This prevents them from "coming back" during polling until they are truly gone from server.
      const filesToDelete: {path: string, sha: string}[] = [];
      
      const collect = (nodes: FileNode[]) => {
          nodes.forEach(n => {
              // Check if this node matches the delete target
              if (n.path === nodeToDelete.path || n.path.startsWith(nodeToDelete.path + '/')) {
                  deletedPathsRef.current.add(n.path); // Suppress
                  if (n.type === 'blob') {
                      filesToDelete.push({ path: n.path, sha: n.sha || "" });
                  }
              }
              // Recursively check children
              if (n.children) collect(n.children);
          });
      };
      // Important: Collect from current fileTree state before it gets updated in next render
      collect(fileTree); 

      // 2. Optimistic UI Update (Instant)
      setFileTree(prev => updateTreeState(prev, nodeToDelete.path, () => null));

      // 3. Update Local Tracking
      setFileCache(prev => {
          const next = {...prev};
          filesToDelete.forEach(f => delete next[f.path]);
          return next;
      });
      setNewFiles(prev => {
          const next = new Set(prev);
          filesToDelete.forEach(f => next.delete(f.path));
          return next;
      });
      setUnsavedChanges(prev => {
           const next = new Set(prev);
           filesToDelete.forEach(f => next.delete(f.path));
           return next;
      });

      // 4. Fire API calls instantly (Background)
      const serverFiles = filesToDelete.filter(f => !newFiles.has(f.path));
      
      if (serverFiles.length > 0) {
          try {
              // Delete in parallel
              await Promise.all(serverFiles.map(async f => {
                   let sha = f.sha;
                   // Fallback: If SHA is missing from tree (rare), fetch it
                   if (!sha) {
                       try {
                           const meta = await github.getFile(repo.owner.login, repo.name, f.path);
                           sha = meta.sha;
                       } catch (e) { return; } 
                   }
                   if (sha) {
                       await github.deleteFile(repo.owner.login, repo.name, f.path, `Delete ${f.path}`, sha);
                   }
              }));
          } catch (e) {
              console.error("Instant deletion error", e);
          }
      }
  };

  // ---- AI Logic (Local First) ----

  const handleAiSend = async () => {
      if (!aiMessage.trim()) return;
      if (!gemini.current || !isAiReady) return;

      const userMsg = aiMessage;
      setAiMessage("");
      setAiHistory(prev => [...prev, { role: "user", parts: [{ text: userMsg }] }]);
      setAiLoading(true);
      
      const context = `Current File: ${currentFile?.path || 'None'}\nFile Tree: ${JSON.stringify(fileTree.map(n => n.path))}`;
      const responseText = await gemini.current.chat(userMsg, context, aiHistory);
      
      const jsonRegex = /```json\n([\s\S]*?)\n```/;
      const match = responseText.match(jsonRegex);
      
      let processedText = responseText;

      if (match) {
        try {
            const data = JSON.parse(match[1]);
            if (data.text) processedText = data.text;
            else processedText = "Executing changes...";

            if (data.actions && Array.isArray(data.actions)) {
                for (const action of data.actions) {
                    const path = action.path;
                    
                    if (action.type === 'create' || action.type === 'update') {
                        // INSTANT AI UPDATE
                        const isNew = action.type === 'create';
                        const parent = path.split('/').slice(0, -1).join('/');
                        
                        if (isNew) {
                             const newNode: FileNode = { path, type: 'blob', mode: '100644', status: 'new' };
                             setFileTree(prev => addNodeToTree(prev, parent, newNode));
                             setNewFiles(prev => new Set(prev).add(path));
                        } else {
                             setFileTree(prev => updateTreeState(prev, path, (n) => ({...n, status: n.status === 'new' ? 'new' : 'modified'})));
                             setUnsavedChanges(prev => new Set(prev).add(path));
                        }
                        
                        setFileCache(prev => ({ ...prev, [path]: action.content }));
                    } 
                    else if (action.type === 'delete') {
                         // AI Deletion: For safety, we treat this as a draft. 
                         // To make it instant, we would call handleDeleteFile logic here, but we lack the node object easily.
                         // We will just do UI update. User must Sync to persist delete or we implement AI Delete later.
                        setFileTree(prev => updateTreeState(prev, path, () => null));
                        if (currentFile?.path === path) setCurrentFile(null);
                    }
                }
            }
        } catch (e) {
            console.error("AI JSON Parse Error", e);
            processedText += "\n\n⚠️ Invalid AI Response.";
        }
      }

      setAiHistory(prev => [...prev, { role: "model", parts: [{ text: processedText }] }]);
      setAiLoading(false);
  };

  const unsavedCount = unsavedChanges.size + newFiles.size;

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-gray-950 overflow-hidden text-gray-200 fixed inset-0">
        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={() => {}} />
        
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
                  <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-200 truncate max-w-[120px]">{currentFile?.path.split('/').pop()}</span>
                      {unsavedCount > 0 && (
                          <span className="flex h-2 w-2 rounded-full bg-yellow-500 animate-pulse" title={`${unsavedCount} unsaved changes`}></span>
                      )}
                  </div>
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
                    className={`p-2 rounded-lg flex items-center gap-2 transition-all ${isSaving ? 'text-gray-500 bg-gray-800' : unsavedCount > 0 ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' : 'text-primary-400 hover:bg-primary-500/10'}`}
                    onClick={handleSyncToGithub} 
                    disabled={isSaving}
                >
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : unsavedCount > 0 ? <CloudUpload size={20} /> : <Save size={20} />}
                  <span className="hidden md:inline text-xs font-bold">
                      {isSaving ? 'Syncing...' : unsavedCount > 0 ? `Push Changes (${unsavedCount})` : 'Synced'}
                  </span>
                </button>
                <button 
                    className={`p-2 rounded-lg transition-colors ${isAIOpen ? 'bg-fuchsia-600 text-white' : 'text-fuchsia-400 hover:bg-fuchsia-500/10'}`} 
                    onClick={handleAiToggle}
                >
                  <Bot size={20} />
                </button>
            </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative w-full">
            <div className={`fixed md:static inset-y-0 left-0 bg-gray-900 border-r border-gray-800 z-40 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:w-0'} w-[85vw] max-w-xs md:w-72 top-14 md:top-0 h-[calc(100%-3.5rem)] md:h-full flex flex-col shadow-2xl md:shadow-none`}>
                <div className="p-2 border-b border-gray-800 flex gap-1 justify-around bg-gray-900 shrink-0">
                    <button onClick={() => setupCreate('create_file')} className="p-2 hover:bg-gray-800 rounded text-gray-400" title="New File"><FilePlus size={18}/></button>
                    <button onClick={() => setupCreate('create_folder')} className="p-2 hover:bg-gray-800 rounded text-gray-400" title="New Folder"><FolderPlus size={18}/></button>
                    <button onClick={() => {}} className="p-2 hover:bg-gray-800 rounded text-gray-400 opacity-50 cursor-not-allowed" title="Import Files (Disabled during edit)"><Upload size={18}/></button>
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

            {selectedNode && !modalMode && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setSelectedNode(null)}>
                     <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-64 overflow-hidden animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                         <div className="flex justify-between items-center p-3 border-b border-gray-800 bg-gray-800/50">
                            <span className="text-xs font-bold truncate max-w-[150px] text-gray-300 flex items-center gap-2">
                                {selectedNode.type === 'tree' ? <Folder size={14} className="text-primary-400"/> : <FileText size={14}/>}
                                {selectedNode.path.split('/').pop()}
                            </span>
                            <button onClick={() => setSelectedNode(null)} className="text-gray-500 hover:text-white"><X size={16}/></button>
                         </div>
                         
                         <div className="p-2 flex flex-col gap-1">
                             {selectedNode.type === 'tree' && (
                                <>
                                  <button onClick={() => setupCreate('create_file', selectedNode.path)} className="flex items-center gap-3 p-2.5 hover:bg-primary-500/10 text-left rounded-lg text-sm text-primary-400 transition-colors">
                                    <FilePlus size={16}/> New File Here
                                  </button>
                                  <button onClick={() => setupCreate('create_folder', selectedNode.path)} className="flex items-center gap-3 p-2.5 hover:bg-primary-500/10 text-left rounded-lg text-sm text-primary-400 transition-colors">
                                    <FolderPlus size={16}/> New Folder Here
                                  </button>
                                  <div className="h-px bg-gray-800 my-1"></div>
                                </>
                             )}
                             <button onClick={() => setModalMode('rename')} className="flex items-center gap-3 p-2.5 hover:bg-gray-800 text-left rounded-lg text-sm text-gray-300 transition-colors">
                                <Edit2 size={16}/> Rename
                             </button>
                             <div className="h-px bg-gray-800 my-1"></div>
                             <button onClick={() => handleDeleteFile()} className="flex items-center gap-3 p-2.5 hover:bg-red-900/20 text-left rounded-lg text-sm text-red-400 transition-colors">
                                <Trash2 size={16}/> Delete
                             </button>
                         </div>
                     </div>
                 </div>
            )}

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

            <div className="flex-1 relative overflow-hidden bg-gray-950 flex flex-col h-full">
                {currentFile ? (
                    <div className="flex-1 relative h-full">
                        {isMobile ? (
                             <div className="flex-1 overflow-auto h-full font-mono text-sm bg-[#1f2937]">
                                <SimpleEditor
                                    value={fileCache[currentFile.path] || ""}
                                    onValueChange={handleEditorChange}
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
                                value={fileCache[currentFile.path] || ""}
                                onChange={handleEditorChange}
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

                                <Select 
                                    label="Model"
                                    value={inlineModel}
                                    onChange={(e: any) => setInlineModel(e.target.value)}
                                    options={[
                                        { value: 'gemini-3-flash-preview', label: 'Gemini 3.0 Flash (Fast)' },
                                        { value: 'gemini-3-pro-preview', label: 'Gemini 3.0 Pro (Logic)' },
                                    ]}
                                />

                                <div className="flex gap-2">
                                    <Button onClick={handleSaveInlineKey} className="flex-1" disabled={!inlineApiKey && !gemini.current}>Save</Button>
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