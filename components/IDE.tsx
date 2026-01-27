import React, { useState, useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
// @ts-ignore
import SimpleEditor from 'react-simple-code-editor';
// @ts-ignore
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-json';

import { FileNode, Repository, WorkflowRun } from '../types';
import { GitHubService } from '../services/github';
import { Folder, FileText, ChevronRight, ChevronDown, Menu, Save, Play, Bot, ArrowLeft, Loader2, X, Code2, Copy, Undo, Redo, CheckCircle2, AlertCircle, ExternalLink, MoreVertical, FilePlus, FolderPlus, Trash2, Edit2, Clipboard, ClipboardPaste, Github, Upload } from 'lucide-react';
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
  const paddingLeft = `${level * 16 + 12}px`; // Increased indentation

  return (
    <div>
      <div 
        className={`flex items-center justify-between py-3 px-2 cursor-pointer text-sm select-none transition-colors border-l-2 ${isSelected ? 'bg-primary-900/20 border-primary-500 text-primary-300' : 'border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
        style={{ paddingLeft }}
        onClick={() => isFolder ? toggleFolder(node.path) : onSelect(node)}
      >
        <div className="flex items-center overflow-hidden">
            <span className="mr-3 opacity-60 flex-shrink-0">
                {isFolder ? (isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>) : <span className="w-4 block"></span>}
            </span>
            <span className="mr-3 opacity-90 flex-shrink-0">
                {isFolder ? <Folder size={18} fill="currentColor" className={isExpanded ? "text-primary-400" : "text-gray-500"} /> : <FileText size={18} className="text-gray-500" />}
            </span>
            <span className="truncate font-medium text-base">{node.path.split('/').pop()}</span>
        </div>
        <button 
            className="p-1.5 hover:bg-gray-700 rounded-md text-gray-500 hover:text-white"
            onClick={(e) => { e.stopPropagation(); onMenu(node); }}
        >
            <MoreVertical size={16} />
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
  // Extract JSON block if present (it shouldn't be rendered directly usually, but if it is)
  if (text.trim().startsWith('```json')) return <span className="text-xs text-gray-500 italic">Executing actions...</span>;

  // Split by code blocks
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
        // Bold parsing
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

const BuildOverlay = ({ status, url, runId, github, repo, onClose }: any) => {
    const [jobs, setJobs] = useState<any[]>([]);
    
    useEffect(() => {
        const fetchJobs = async () => {
             try { const j = await github.getWorkflowJobs(repo.owner.login, repo.name, runId); setJobs(j); } catch (e) {}
        };
        fetchJobs();
        const interval = setInterval(fetchJobs, 2000);
        return () => clearInterval(interval);
    }, [runId]);

    const steps = jobs.length > 0 ? jobs[0].steps : [];
    
    let displayStatus = "Processing...";
    let color = "text-primary-400";
    if(status === 'success') { displayStatus = "Build Success"; color = "text-green-400"; }
    if(status === 'failure') { displayStatus = "Build Failed"; color = "text-red-400"; }

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-gray-950 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                     <h3 className={`font-bold text-xl ${color}`}>{displayStatus}</h3>
                     <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {steps.map((s:any, i:number) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg">
                            <div className={`w-3 h-3 rounded-full ${s.status === 'completed' ? (s.conclusion === 'success' ? 'bg-green-500' : 'bg-red-500') : 'bg-yellow-500 animate-pulse'}`}></div>
                            <span>{s.name}</span>
                        </div>
                    ))}
                </div>
                {url && <a href={url} target="_blank" className="text-center text-primary-400 text-sm hover:underline">View Logs</a>}
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
  const [activeBuild, setActiveBuild] = useState<WorkflowRun | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // File Manager State
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null); // For context menu
  const [clipboard, setClipboard] = useState<{path: string, type: 'copy' | 'cut'} | null>(null);
  const [modalMode, setModalMode] = useState<'create_file' | 'create_folder' | 'rename' | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [creationContextPath, setCreationContextPath] = useState<string>(""); // Used when creating files via context menu
  const [importTargetFolder, setImportTargetFolder] = useState<string>("");

  const gemini = useRef(new GeminiService());

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initial Load & Build Polling
  useEffect(() => {
    let interval: any;
    const checkBuilds = async () => {
        try {
            const runs = await github.getWorkflowRuns(repo.owner.login, repo.name);
            const latest = runs[0]; 
            if (latest && latest.name === 'Build Mod') {
                 if (activeBuild) { if (latest.id === activeBuild.id) setActiveBuild(latest); } 
                 else if (latest.status === 'in_progress' || latest.status === 'queued') setActiveBuild(latest);
            }
        } catch (e) {}
    };
    if (activeBuild && activeBuild.status !== 'completed') interval = setInterval(checkBuilds, 2000);
    checkBuilds();
    return () => clearInterval(interval);
  }, [repo, activeBuild?.id]);

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
      await loadTree(); // To update SHA in tree
      alert("Saved!");
    } catch (e) { alert("Failed to save: " + e); } finally { setIsSaving(false); }
  };

  const handleUndo = () => {
      if (editorRef.current) editorRef.current.trigger('keyboard', 'undo', null);
  };
  const handleRedo = () => {
      if (editorRef.current) editorRef.current.trigger('keyboard', 'redo', null);
  };

  // ---- File Manager Actions ----

  const setupCreate = (mode: 'create_file' | 'create_folder', contextPath?: string) => {
      setCreationContextPath(contextPath || "");
      setModalMode(mode);
  };

  const executeModalAction = async () => {
      if (!modalInput) return;
      
      // Determine base path: 
      // 1. If creationContextPath is set (from context menu), use it.
      // 2. Else if a file/folder is selected, use its parent (or itself if folder).
      // 3. Fallback to root.
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

  const handleCopy = () => {
      if (selectedNode && selectedNode.type === 'blob') setClipboard({ path: selectedNode.path, type: 'copy' });
  };

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
          alert("Import successful!");
      } catch (err: any) {
          alert("Import failed: " + err.message);
      } finally {
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
          setImportTargetFolder("");
          setSelectedNode(null);
      }
  };


  // ---- AI Logic ----

  const handleAiSend = async () => {
      if (!aiMessage.trim()) return;
      const userMsg = aiMessage;
      setAiMessage("");
      setAiHistory(prev => [...prev, { role: "user", parts: [{ text: userMsg }] }]);
      setAiLoading(true);
      
      const context = `Current File: ${currentFile?.path || 'None'}\nFile Tree: ${fileTree.map(f => f.path).join(', ')}`;
      const responseText = await gemini.current.chat(userMsg, context, aiHistory);
      
      // Parse JSON actions
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
    <div className="flex flex-col h-screen w-screen bg-gray-950 overflow-hidden text-gray-200">
        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
        {activeBuild && <BuildOverlay status={activeBuild.status} url={activeBuild.html_url} runId={activeBuild.id} github={github} repo={repo} onClose={() => setActiveBuild(null)} />}

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
            </div>
            
            <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-lg">
                <button onClick={handleUndo} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="Undo"><Undo size={16}/></button>
                <button onClick={handleRedo} className="p-1.5 hover:bg-gray-700 rounded text-gray-400" title="Redo"><Redo size={16}/></button>
            </div>

            <div className="flex items-center gap-2">
                <a href={repo.html_url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-white" title="Open in GitHub"><Github size={20}/></a>
                <button className="p-2 text-primary-400 hover:bg-primary-500/10 rounded-lg" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                </button>
                <button className="p-2 text-fuchsia-400 hover:bg-fuchsia-500/10 rounded-lg" onClick={() => setIsAIOpen(!isAIOpen)}>
                  <Bot size={20} />
                </button>
            </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden relative">
            
            {/* Sidebar (File Manager) */}
            <div className={`fixed md:static inset-y-0 left-0 bg-gray-900 border-r border-gray-800 z-40 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:w-0'} w-[85vw] max-w-xs md:w-72 top-14 md:top-0 h-[calc(100%-3.5rem)] md:h-auto flex flex-col shadow-2xl md:shadow-none`}>
                {/* File Toolbar */}
                <div className="p-2 border-b border-gray-800 flex gap-1 justify-around bg-gray-900">
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

            {/* Context Menu Modal (Mobile friendly) */}
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
            <div className="flex-1 relative overflow-hidden bg-gray-950 flex flex-col">
                {currentFile ? (
                    <div className="flex-1 relative">
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
                        <p>Select a file</p>
                    </div>
                )}
            </div>

            {/* AI Panel */}
            {isAIOpen && (
                <div className="absolute inset-y-0 right-0 w-full md:w-[400px] bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col z-50 animate-in slide-in-from-right duration-200">
                    <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                        <span className="font-bold text-fuchsia-400 flex gap-2 items-center"><Bot size={18}/> AI Architect</span>
                        <button onClick={() => setIsAIOpen(false)}><X size={18}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900">
                        {aiHistory.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[95%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
                                    <AiMessageRenderer text={msg.parts[0].text} />
                                </div>
                            </div>
                        ))}
                        {aiLoading && <Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" />}
                    </div>
                    <div className="p-3 bg-gray-800 border-t border-gray-700 flex gap-2">
                        <input className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-fuchsia-500" 
                               placeholder="Ask AI to edit files..." 
                               value={aiMessage} onChange={(e) => setAiMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiSend()} />
                        <button onClick={handleAiSend} className="p-2 bg-fuchsia-600 text-white rounded-lg"><ArrowLeft size={18} className="rotate-90" /></button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default IDE;