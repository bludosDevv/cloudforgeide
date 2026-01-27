import React, { useState, useEffect } from 'react';
import { Plus, Github, Code2, Box, Search, ArrowRight } from 'lucide-react';
import { Repository, NewProjectConfig, ModLoader } from '../types';
import { Button, Input, Select, Modal } from './ui';
import { GitHubService } from '../services/github';
import { 
  FORGE_BUILD_GRADLE, 
  FABRIC_MOD_JSON, 
  FABRIC_BUILD_GRADLE,
  GITHUB_ACTION_YML, 
  FORGE_MODS_TOML,
  SETTINGS_GRADLE,
  GRADLEW_SCRIPT
} from '../constants';

interface ProjectListProps {
  repos: Repository[];
  user: any;
  onSelect: (repo: Repository) => void;
  onRefresh: () => void;
  github: GitHubService;
  onLogout: () => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ repos: initialRepos, user, onSelect, onRefresh, github, onLogout }) => {
  const [repos, setRepos] = useState<Repository[]>(initialRepos);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mcVersions, setMcVersions] = useState<string[]>([]);
  const [isFetchingVersions, setIsFetchingVersions] = useState(false);
  const [errors, setErrors] = useState<any>({});
  
  const [newProject, setNewProject] = useState<NewProjectConfig & { customVersion: boolean }>({
    name: '',
    description: 'My awesome Minecraft Mod',
    loader: ModLoader.FORGE,
    minecraftVersion: '1.20.1',
    modId: 'examplemod',
    packageName: 'com.example.mod',
    customVersion: false
  });

  useEffect(() => {
    setRepos(initialRepos);
  }, [initialRepos]);

  useEffect(() => {
    const interval = setInterval(() => {
        onRefresh(); 
    }, 2000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  useEffect(() => {
    const fetchVersions = async () => {
        setIsFetchingVersions(true);
        try {
            const res = await fetch('https://meta.fabricmc.net/v2/versions/game');
            if (res.ok) {
                const data = await res.json();
                const stable = data.filter((v: any) => v.stable).map((v: any) => v.version);
                setMcVersions(stable);
                if (stable.length > 0) {
                     setNewProject(prev => ({ ...prev, minecraftVersion: stable[0] }));
                }
            }
        } catch (e) {
            console.error("Failed to fetch versions", e);
            setMcVersions(['1.21.4', '1.21.1', '1.20.1', '1.19.2', '1.18.2']);
        } finally {
            setIsFetchingVersions(false);
        }
    };
    fetchVersions();
  }, []);

  const validate = () => {
      const errs: any = {};
      if (!newProject.name.trim()) errs.name = "Project name is required";
      if (!/^[a-z0-9_]+$/.test(newProject.modId)) errs.modId = "Mod ID must be lowercase, numbers, or underscores only (no spaces)";
      if (!/^[a-z0-9_.]+$/.test(newProject.packageName)) errs.packageName = "Invalid package name format";
      
      setErrors(errs);
      return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    
    setLoading(true);
    try {
      const repo = await github.createRepository(newProject.name, newProject.description);
      const mcVer = newProject.minecraftVersion;
      let forgeVer = '47.2.0'; 
      let fabricApi = '0.85.0+1.20.1';
      let yarn = '1.20.1+build.10';
      let fabricLoader = '0.14.21';

      if (mcVer.startsWith('1.21')) {
           forgeVer = '52.0.0'; 
           fabricApi = `0.100.0+${mcVer}`;
           yarn = `${mcVer}+build.1`;
           fabricLoader = '0.16.0';
      } else if (mcVer === '1.20.1') {
           forgeVer = '47.2.0';
      } else if (mcVer === '1.19.2') {
           forgeVer = '43.2.0';
           fabricApi = '0.76.0+1.19.2';
           yarn = '1.19.2+build.28';
      }

      const files: {path: string, content: string}[] = [];
      files.push({ path: 'gradlew', content: GRADLEW_SCRIPT });
      files.push({ path: 'settings.gradle', content: SETTINGS_GRADLE.replace('modid', newProject.modId) });
      files.push({ path: '.github/workflows/build.yml', content: GITHUB_ACTION_YML });

      if (newProject.loader === ModLoader.FORGE) {
        files.push({ 
            path: 'build.gradle', 
            content: FORGE_BUILD_GRADLE.replace(/modid/g, newProject.modId).replace('examplemodsareus', newProject.packageName)
        });
        files.push({ 
            path: 'gradle.properties', 
            content: `minecraft_version=${mcVer}\nmod_id=${newProject.modId}\nforge_version=${forgeVer}` 
        });
        files.push({ 
            path: `src/main/resources/META-INF/mods.toml`, 
            content: FORGE_MODS_TOML.replace(/modid/g, newProject.modId).replace("Example Mod", newProject.name) 
        });
        files.push({ 
            path: `src/main/java/${newProject.packageName.replace(/\./g, '/')}/Main.java`, 
            content: `package ${newProject.packageName};\n\nimport net.minecraftforge.fml.common.Mod;\n\n@Mod("${newProject.modId}")\npublic class Main {\n    public Main() {\n        System.out.println("Hello from ${newProject.name}!");\n    }\n}` 
        });
      } else {
        files.push({ 
            path: 'fabric.mod.json', 
            content: FABRIC_MOD_JSON.replace(/modid/g, newProject.modId).replace(/Example Mod/g, newProject.name).replace('com.example.mod', newProject.packageName)
        });
        files.push({ path: 'build.gradle', content: FABRIC_BUILD_GRADLE });
        files.push({ 
            path: 'gradle.properties', 
            content: `minecraft_version=${mcVer}\nyarn_mappings=${yarn}\nloader_version=${fabricLoader}\nmod_version=1.0.0\nmaven_group=${newProject.packageName}\narchives_base_name=${newProject.modId}\nfabric_version=${fabricApi}` 
        });
        files.push({ 
            path: `src/main/java/${newProject.packageName.replace(/\./g, '/')}/ExampleMod.java`, 
            content: `package ${newProject.packageName};\n\nimport net.fabricmc.api.ModInitializer;\n\npublic class ExampleMod implements ModInitializer {\n    @Override\n    public void onInitialize() {\n        System.out.println("Hello Fabric world!");\n    }\n}` 
        });
        files.push({
            path: `src/main/resources/${newProject.modId}.mixins.json`,
            content: `{\n  "required": true,\n  "package": "${newProject.packageName}.mixin",\n  "compatibilityLevel": "JAVA_17",\n  "mixins": [],\n  "injectors": {\n    "defaultRequire": 1\n  }\n}`
        });
      }

      for (const file of files) {
          await github.updateFile(repo.owner.login, repo.name, file.path, file.content, "Initial commit");
      }

      setIsModalOpen(false);
      onSelect(repo);
      
    } catch (error) {
      alert("Failed to create project: " + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-950 font-sans">
      <div className="flex-1 overflow-y-auto w-full scroll-smooth">
        <div className="flex flex-col items-center py-10 px-4 sm:px-6 min-h-full">
          <div className="w-full max-w-6xl space-y-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 sticky top-0 bg-gray-950/90 backdrop-blur-sm z-20 py-4 -my-4 px-2">
              <div className="animate-slide-up">
                <h1 className="text-3xl font-extrabold text-white flex items-center gap-3 tracking-tight">
                   <div className="p-2.5 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl shadow-lg shadow-primary-500/30">
                     <Box className="text-white" size={24} />
                   </div>
                   CloudForge Studio
                </h1>
                <p className="text-gray-400 mt-2 font-medium flex items-center gap-2">
                   Logged in as <span className="text-gray-200 font-bold bg-gray-800 px-2 py-0.5 rounded-md">{user?.login}</span>
                </p>
              </div>
              <div className="flex gap-3 animate-slide-up items-center justify-end" style={{animationDelay: '0.1s'}}>
                 <Button variant="secondary" onClick={onLogout}>Logout</Button>
                 <Button onClick={() => setIsModalOpen(true)} className="px-6 shadow-primary-500/20"><Plus size={18} /> New Project</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24 animate-slide-up" style={{animationDelay: '0.2s'}}>
              {repos.map(repo => (
                <div 
                  key={repo.id} 
                  onClick={() => onSelect(repo)}
                  className="group bg-gray-900 rounded-2xl border border-gray-800 p-6 shadow-xl hover:shadow-2xl hover:border-primary-500/50 cursor-pointer transition-all duration-300 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-primary-500/20 transition-all duration-500"></div>
                  <div className="flex justify-between items-start mb-5 relative z-10">
                    <div className="p-3 bg-gray-800 rounded-xl text-primary-400 group-hover:bg-primary-500 group-hover:text-white transition-colors duration-300 shadow-lg shadow-black/20">
                      <Code2 size={24} />
                    </div>
                    <ArrowRight className="text-gray-700 group-hover:text-primary-400 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                  </div>
                  <h3 className="font-bold text-xl text-gray-100 mb-2 truncate tracking-tight">{repo.name}</h3>
                  <p className="text-gray-400 text-sm line-clamp-2 h-10 font-medium leading-relaxed">{repo.description || "No description provided."}</p>
                  <div className="mt-5 pt-5 border-t border-gray-800 flex items-center justify-between text-xs font-semibold text-gray-500">
                    <span className="flex items-center gap-1.5"><Github size={12}/> {repo.default_branch}</span>
                    <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              
              {repos.length === 0 && (
                  <div className="col-span-full py-24 text-center text-gray-500 bg-gray-900 border border-dashed border-gray-800 rounded-3xl flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-600">
                         <Search size={32} />
                      </div>
                      <p className="text-xl font-bold text-gray-300">No projects found</p>
                      <p className="text-sm mt-2">Create a new project to get started!</p>
                  </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Mod Project">
        <div className="space-y-5">
            <Input 
                label="Project Name" 
                placeholder="Super Tools" 
                value={newProject.name} 
                onChange={(e: any) => {
                    const val = e.target.value;
                    setNewProject({
                        ...newProject, 
                        name: val, 
                        modId: val.toLowerCase().replace(/[^a-z0-9_]/g, '') 
                    });
                    if (errors.name) setErrors({...errors, name: null});
                }}
                error={errors.name}
            />
             <div className="grid grid-cols-2 gap-5">
                <Input 
                    label="Mod ID" 
                    placeholder="supertools" 
                    value={newProject.modId} 
                    onChange={(e: any) => setNewProject({...newProject, modId: e.target.value})}
                />
                 <Input 
                    label="Package" 
                    placeholder="com.user.mod" 
                    value={newProject.packageName} 
                    onChange={(e: any) => setNewProject({...newProject, packageName: e.target.value})}
                />
            </div>
            <div className="grid grid-cols-2 gap-5">
                <Select 
                    label="Mod Loader" 
                    options={[{value: ModLoader.FORGE, label: 'Forge'}, {value: ModLoader.FABRIC, label: 'Fabric'}]}
                    value={newProject.loader}
                    onChange={(e: any) => setNewProject({...newProject, loader: e.target.value})}
                />
                <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Version</label>
                    {newProject.customVersion ? (
                        <input 
                            className="px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-gray-100"
                            placeholder="e.g., 1.21.11"
                            value={newProject.minecraftVersion}
                            onChange={(e) => setNewProject({...newProject, minecraftVersion: e.target.value})}
                        />
                    ) : (
                        <select 
                            className="px-3 py-2.5 rounded-lg border border-gray-700 bg-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-gray-100"
                            value={newProject.minecraftVersion}
                            onChange={(e) => setNewProject({...newProject, minecraftVersion: e.target.value})}
                            disabled={isFetchingVersions}
                        >
                            {isFetchingVersions && <option>Detecting...</option>}
                            {mcVersions.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    )}
                </div>
            </div>
            <Input 
                label="Description" 
                placeholder="Mod description" 
                value={newProject.description} 
                onChange={(e: any) => setNewProject({...newProject, description: e.target.value})}
            />
            <div className="pt-4">
                <Button className="w-full font-bold py-3 text-lg" onClick={handleCreate} loading={loading}>
                     {loading ? 'Initializing...' : 'Create Project'}
                </Button>
            </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectList;