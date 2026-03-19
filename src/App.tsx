import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Plus, 
  Upload, 
  FileText, 
  Search, 
  Sparkles, 
  Trash2, 
  Save, 
  LayoutDashboard, 
  BookOpen, 
  PenTool,
  Loader2,
  Settings as SettingsIcon,
  Key,
  X,
  FileCode,
  FileJson,
  Globe,
  Cpu,
  Eye,
  EyeOff,
  AlertCircle,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Sun,
  Moon,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BidDocument, BidDraft, AppSettings, LLMConfig } from './types';
import { searchKnowledgeBase, generateBidSection } from './services/aiService';
import { parseDocument } from './services/documentService';
import { storage } from './services/storageService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STORAGE_KEYS = {
  DOCS: 'bid_master_docs',
  DRAFTS: 'bid_master_drafts',
  SETTINGS: 'bid_master_settings'
};

const DEFAULT_CONFIGS: LLMConfig[] = [
  { provider: "qwen", apiKey: "", model: "qwen-max" },
  { provider: "doubao", apiKey: "", model: "doubao-pro-32k" },
  { provider: "deepseek", apiKey: "", model: "deepseek-chat", baseUrl: "https://api.deepseek.com" }
];

// Fallback for crypto.randomUUID
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const StatusIndicator = React.memo(({ status, apiError, size = "w-2 h-2" }: { status: 'idle' | 'working' | 'error', apiError: boolean, size?: string }) => {
  const [isFastBlinking, setIsFastBlinking] = useState(false);

  useEffect(() => {
    if (apiError) {
      setIsFastBlinking(true);
      const timer = setTimeout(() => setIsFastBlinking(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [apiError]);

  let lightClass = "status-light-green-solid";
  if (status === 'working') {
    lightClass = "status-light-green-blink";
  } else if (status === 'error' || apiError) {
    lightClass = isFastBlinking ? "status-light-red-blink" : "status-light-red-solid";
  }

  return (
    <div className={cn("rounded-full transition-all duration-300", size, lightClass)} />
  );
});

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'knowledge' | 'basic' | 'editor'>('dashboard');
  const [documents, setDocuments] = useState<BidDocument[]>([]);
  const [drafts, setDrafts] = useState<BidDraft[]>([]);
  const [currentDraft, setCurrentDraft] = useState<BidDraft | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ 
    activeConfig: DEFAULT_CONFIGS[0],
    configs: DEFAULT_CONFIGS
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [generatingSectionId, setGeneratingSectionId] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [searchReasoning, setSearchReasoning] = useState<string | null>(null);
  const [sectionReasoning, setSectionReasoning] = useState<string | null>(null);
  const [isSearchReasoningExpanded, setIsSearchReasoningExpanded] = useState(false);
  const [isSectionReasoningExpanded, setIsSectionReasoningExpanded] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [errorTimer, setErrorTimer] = useState<NodeJS.Timeout | null>(null);

  const appStatus = useMemo(() => {
    if (apiError) return 'error';
    if (isSearchLoading || generatingSectionId !== null) return 'working';
    return 'idle';
  }, [apiError, isSearchLoading, generatingSectionId]);

  useEffect(() => {
    if (apiError) {
      if (errorTimer) clearTimeout(errorTimer);
      const timer = setTimeout(() => setApiError(false), 30000); // Reset error after 30s
      setErrorTimer(timer);
    }
    return () => {
      if (errorTimer) clearTimeout(errorTimer);
    };
  }, [apiError]);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const searchReasoningRef = useRef<HTMLDivElement>(null);
  const sectionReasoningRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Auto-scroll reasoning content
  useEffect(() => {
    if (searchReasoningRef.current) {
      searchReasoningRef.current.scrollTop = searchReasoningRef.current.scrollHeight;
    }
  }, [searchReasoning]);

  useEffect(() => {
    if (sectionReasoningRef.current) {
      sectionReasoningRef.current.scrollTop = sectionReasoningRef.current.scrollHeight;
    }
  }, [sectionReasoning]);
  const [currentReferences, setCurrentReferences] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<BidDocument | null>(null);
  const [highlightQuery, setHighlightQuery] = useState('');
  const [localSearchResults, setLocalSearchResults] = useState<{ docTitle: string, snippet: string, docId: string }[]>([]);
  const [tempConfigs, setTempConfigs] = useState<LLMConfig[]>(DEFAULT_CONFIGS);
  const [activeConfigIndex, setActiveConfigIndex] = useState(0);
  const isInitialized = useRef(false);

  // Load data from Storage
  useEffect(() => {
    const loadData = async () => {
      // 1. Load small settings from localStorage
      const savedSettings = storage.getSmall(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        setSettings(savedSettings);
        setTempConfigs(savedSettings.configs);
        const idx = savedSettings.configs.findIndex((c: LLMConfig) => c.provider === savedSettings.activeConfig.provider);
        setActiveConfigIndex(idx >= 0 ? idx : 0);
      }

      // 2. Load large data from IndexedDB
      let savedDocs = await storage.getLarge(STORAGE_KEYS.DOCS);
      let savedDrafts = await storage.getLarge(STORAGE_KEYS.DRAFTS);

      // 3. Migration from localStorage if needed
      if (!savedDocs) {
        const legacyDocs = localStorage.getItem(STORAGE_KEYS.DOCS);
        if (legacyDocs) {
          try {
            savedDocs = JSON.parse(legacyDocs);
            await storage.setLarge(STORAGE_KEYS.DOCS, savedDocs);
            localStorage.removeItem(STORAGE_KEYS.DOCS);
          } catch (e) { console.error("Migration failed for docs", e); }
        }
      }

      if (!savedDrafts) {
        const legacyDrafts = localStorage.getItem(STORAGE_KEYS.DRAFTS);
        if (legacyDrafts) {
          try {
            savedDrafts = JSON.parse(legacyDrafts);
            await storage.setLarge(STORAGE_KEYS.DRAFTS, savedDrafts);
            localStorage.removeItem(STORAGE_KEYS.DRAFTS);
          } catch (e) { console.error("Migration failed for drafts", e); }
        }
      }

      if (savedDocs) setDocuments(savedDocs);
      if (savedDrafts) setDrafts(savedDrafts);
      
      isInitialized.current = true;
    };

    loadData();
  }, []);

  // Save data to Storage
  useEffect(() => {
    if (!isInitialized.current) return;
    storage.setLarge(STORAGE_KEYS.DOCS, documents);
  }, [documents]);

  useEffect(() => {
    if (!isInitialized.current) return;
    storage.setLarge(STORAGE_KEYS.DRAFTS, drafts);
  }, [drafts]);

  const saveSettings = () => {
    const newSettings = { 
      activeConfig: tempConfigs[activeConfigIndex],
      configs: tempConfigs 
    };
    setSettings(newSettings);
    storage.setSmall(STORAGE_KEYS.SETTINGS, newSettings);
    setShowSettings(false);
  };

  const resetApp = async () => {
    localStorage.clear();
    await storage.clearAllLarge();
    window.location.reload();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'spec' | 'basic') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const content = await parseDocument(file);
      const newDoc: BidDocument = {
        id: generateId(),
        title: file.name,
        content: content,
        uploadDate: new Date().toISOString(),
        fileType: file.name.split('.').pop() || 'txt',
        libraryType: type
      };
      setDocuments(prev => [...prev, newDoc]);
    } catch (error) {
      console.error("File upload failed", error);
      // Use a more robust error message
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      // Avoid alert if possible, but for now let's keep it or use a state
      alert("文件解析失败：" + errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const createNewDraft = () => {
    const newDraft: BidDraft = {
      id: generateId(),
      title: "未命名标书草案",
      sections: [{ title: "项目概况", content: "", prompt: "" }],
      lastModified: new Date().toISOString()
    };
    setDrafts(prev => [...prev, newDraft]);
    setCurrentDraft(newDraft);
    setActiveTab('editor');
  };

  const saveDraft = () => {
    if (!currentDraft) return;
    setDrafts(prev => prev.map(d => d.id === currentDraft.id ? { ...currentDraft, lastModified: new Date().toISOString() } : d));
  };

  const deleteDraft = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
    if (currentDraft?.id === id) setCurrentDraft(null);
  };

  const deleteDoc = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const handleAiSearch = async () => {
    if (!searchQuery) return;
    
    // 0. Clear previous results
    setLocalSearchResults([]);
    setAiResponse('');
    setSearchReasoning(null);

    // 1. Perform Local Fuzzy Search (No API)
    const results: { docTitle: string, snippet: string, docId: string }[] = [];
    const query = searchQuery.toLowerCase();
    
    documents.forEach(doc => {
      // Simple paragraph-based search
      // Strip HTML tags for search if it's HTML
      const plainContent = doc.content.replace(/<[^>]*>/g, ' ');
      const paragraphs = plainContent.split(/\n+/);
      paragraphs.forEach(p => {
        if (p.toLowerCase().includes(query)) {
          // Extract a snippet around the match
          const index = p.toLowerCase().indexOf(query);
          const start = Math.max(0, index - 100);
          const end = Math.min(p.length, index + 200);
          let snippet = p.substring(start, end);
          if (start > 0) snippet = '...' + snippet;
          if (end < p.length) snippet = snippet + '...';
          
          results.push({
            docTitle: doc.title,
            snippet: snippet,
            docId: doc.id
          });
        }
      });
    });
    
    const finalLocalResults = results.slice(0, 10);
    setLocalSearchResults(finalLocalResults); // Limit to top 10 local results

    // 2. Perform AI Summary (Optional/If configured)
    if (!settings.activeConfig.apiKey) {
      if (finalLocalResults.length === 0) {
        setAiResponse("未检索到相关内容。");
      } else {
        setAiResponse("已完成本地检索。如需 AI 深度分析，请先配置 API Key。");
      }
      return;
    }
    
    setIsSearchLoading(true);
    
    // Get relevant documents for animation in sidebar too
    const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const relevantDocs = documents.filter(doc => {
      const content = doc.content.toLowerCase();
      return queryTerms.some(term => content.includes(term)) || content.includes(searchQuery.toLowerCase());
    }).slice(0, 5);
    setCurrentReferences(relevantDocs.map(d => d.title));

    setSearchReasoning(""); // Initialize as empty string to show thinking state

    try {
      await searchKnowledgeBase(searchQuery, documents, settings.activeConfig, (chunk) => {
        if (chunk.reasoning) {
          setSearchReasoning(prev => (prev || "") + chunk.reasoning);
        }
        if (chunk.content) setAiResponse(chunk.content);
      });
    } catch (error) {
      console.error("AI Search failed:", error);
      setApiError(true);
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      setAiResponse(`AI 检索失败：${errorMsg}。请检查 API 配置（Key、模型名称、Base URL）。但本地检索已完成。`);
    } finally {
      setIsSearchLoading(false);
      setLoadingMessage('');
      setCurrentReferences([]);
    }
  };

  const handleAiGenerate = async (sectionIndex: number) => {
    if (!currentDraft) return;
    if (!settings.activeConfig.apiKey) {
      setShowSettings(true);
      return;
    }
    
    const section = currentDraft.sections[sectionIndex];
    setGeneratingSectionId(section.title + sectionIndex);
    setSectionReasoning(""); // Initialize as empty string
    
    const queryTerms = (section.title + " " + section.prompt).toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const relevantDocs = documents.filter(doc => {
      const content = doc.content.toLowerCase();
      return queryTerms.some(term => content.includes(term));
    }).slice(0, 5);
    
    setCurrentReferences(relevantDocs.map(d => d.title));

    try {
      const response = await generateBidSection(
        section.title, 
        section.prompt, 
        section.content, 
        documents, 
        settings.activeConfig,
        (chunk) => {
          if (chunk.reasoning) {
            setSectionReasoning(prev => (prev || "") + chunk.reasoning);
          }
          if (chunk.content) {
            setCurrentDraft(prev => {
              if (!prev) return prev;
              const newSections = [...prev.sections];
              newSections[sectionIndex].content = chunk.content;
              return { ...prev, sections: newSections };
            });
          }
        }
      );
      
      const newSections = [...currentDraft.sections];
      newSections[sectionIndex].content = response.content;
      newSections[sectionIndex].reasoning = response.reasoning || undefined;
      setCurrentDraft({ ...currentDraft, sections: newSections });
    } catch (error) {
      console.error("AI Generation failed", error);
      setApiError(true);
      alert("AI 生成失败，请检查 API 配置。");
    } finally {
      setGeneratingSectionId(null);
      setLoadingMessage('');
      setCurrentReferences([]);
    }
  };

  return (
    <div className="h-screen w-full flex bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300 overflow-hidden selection:bg-indigo-100 dark:selection:bg-indigo-900/30">
      {/* Sidebar */}
      <nav className={cn(
        "bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-all duration-300 relative z-40",
        isSidebarCollapsed ? "w-20" : "w-72"
      )}>
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-10 z-10 w-6 h-6 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm transition-all"
        >
          <motion.div
            animate={{ rotate: isSidebarCollapsed ? 180 : 0 }}
          >
            <Plus size={14} className="rotate-45" />
          </motion.div>
        </button>

        <div className={cn("flex flex-col gap-4 mb-12 px-6 pt-6", isSidebarCollapsed && "px-4 items-center")}>
          <div className={cn("w-32 h-20 flex items-center justify-start", isSidebarCollapsed && "w-12 h-12")}>
            <img src="logo.png" alt="Logo" className="max-w-full max-h-full object-contain opacity-90 hover:opacity-100 transition-opacity logo-glow" referrerPolicy="no-referrer" />
          </div>
          {!isSidebarCollapsed && (
            <div className="space-y-3">
              <span className="text-lg font-serif italic font-bold leading-tight text-zinc-800 dark:text-zinc-200 block">技术标智算AI助手<br/><span className="text-xs font-sans not-italic text-zinc-400 dark:text-zinc-500 font-medium tracking-wide uppercase">(内测版)</span></span>
            </div>
          )}
        </div>

        <div className={cn("flex-1 space-y-1.5 px-6", isSidebarCollapsed && "px-4")}>
          <NavItem 
            icon={<LayoutDashboard size={18} />} 
            label={isSidebarCollapsed ? "" : "仪表盘"} 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            collapsed={isSidebarCollapsed}
          />
          <NavItem 
            icon={<BookOpen size={18} />} 
            label={isSidebarCollapsed ? "" : "技术规范库"} 
            active={activeTab === 'knowledge'} 
            onClick={() => setActiveTab('knowledge')} 
            collapsed={isSidebarCollapsed}
          />
          <NavItem 
            icon={<FileCode size={18} />} 
            label={isSidebarCollapsed ? "" : "基本信息库"} 
            active={activeTab === 'basic'} 
            onClick={() => setActiveTab('basic')} 
            collapsed={isSidebarCollapsed}
          />
          <NavItem 
            icon={<PenTool size={18} />} 
            label={isSidebarCollapsed ? "" : "技术标编辑器"} 
            active={activeTab === 'editor'} 
            onClick={() => setActiveTab('editor')} 
            collapsed={isSidebarCollapsed}
          />
        </div>

        <div className={cn("pt-6 border-t border-zinc-100 dark:border-zinc-800 px-6 pb-6 space-y-1.5", isSidebarCollapsed && "px-4 items-center")}>
          {!isSidebarCollapsed && (
            <div className="mb-4 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-bold tracking-widest mb-2">当前模型</p>
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <StatusIndicator status={appStatus} apiError={apiError} />
                {settings.activeConfig.provider.toUpperCase()} - {settings.activeConfig.model}
              </div>
            </div>
          )}
          
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all group",
              isSidebarCollapsed && "justify-center"
            )}
            title={isSidebarCollapsed ? (darkMode ? "切换至浅色模式" : "切换至深色模式") : ""}
          >
            {darkMode ? <Sun size={18} className="group-hover:rotate-45 transition-transform" /> : <Moon size={18} className="group-hover:-rotate-12 transition-transform" />}
            {!isSidebarCollapsed && <span className="text-sm font-medium">{darkMode ? "浅色模式" : "深色模式"}</span>}
          </button>

          <button 
            onClick={() => setShowSettings(true)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all",
              isSidebarCollapsed && "justify-center"
            )}
            title={isSidebarCollapsed ? "模型与 API 设置" : ""}
          >
            <SettingsIcon size={18} />
            {!isSidebarCollapsed && <span className="text-sm font-medium">模型与 API 设置</span>}
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-zinc-50 dark:bg-zinc-950 scroll-smooth">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-12 max-w-6xl mx-auto"
            >
              <header className="mb-12">
                <h2 className="text-4xl font-serif italic mb-2 text-zinc-900 dark:text-zinc-100">技术标智算助手</h2>
                <p className="text-zinc-500 dark:text-zinc-400">支持 PDF/Word 解析，多模型 API 接入，本地化安全存储。</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                <StatCard title="技术规范文档" value={documents.filter(d => d.libraryType === 'spec').length} icon={<BookOpen className="text-zinc-400 dark:text-zinc-600" />} />
                <StatCard title="基本信息文档" value={documents.filter(d => d.libraryType === 'basic').length} icon={<FileCode className="text-zinc-400 dark:text-zinc-600" />} />
                <StatCard title="技术标草案" value={drafts.length} icon={<PenTool className="text-zinc-400 dark:text-zinc-600" />} />
                <StatCard title="API 状态" value={settings.activeConfig.apiKey ? "已就绪" : "待配置"} icon={<Key className={settings.activeConfig.apiKey ? "text-emerald-500" : "text-red-400"} />} />
              </div>

              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-serif italic text-zinc-900 dark:text-zinc-100">最近的技术标草案</h3>
                  <button 
                    onClick={createNewDraft}
                    className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <Plus size={16} /> 新建技术标
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {drafts.map(draft => (
                    <div 
                      key={draft.id}
                      onClick={() => { setCurrentDraft(draft); setActiveTab('editor'); }}
                      className="p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer group shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <FileText className="text-zinc-400 dark:text-zinc-600" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">{format(new Date(draft.lastModified), 'yyyy-MM-dd')}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteDraft(draft.id); }}
                            className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h4 className="font-medium mb-2 text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{draft.title}</h4>
                      <p className="text-sm text-zinc-400 dark:text-zinc-500">{draft.sections.length} 个章节</p>
                    </div>
                  ))}
                  {drafts.length === 0 && (
                    <div className="col-span-2 p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl text-zinc-400 dark:text-zinc-600">
                      点击右上角新建一个标书草案
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'knowledge' && (
            <motion.div 
              key="knowledge"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-12 max-w-6xl mx-auto"
            >
              <header className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-serif italic mb-2 text-zinc-900 dark:text-zinc-100">技术规范知识库</h2>
                  <p className="text-zinc-500 dark:text-zinc-400">上传 PDF、Word 或 TXT 招标文件，构建您的专属 AI 技术标知识库。</p>
                </div>
                <label className="cursor-pointer bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all flex items-center gap-2 shadow-sm">
                  {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                  上传文档
                  <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'spec')} accept=".pdf,.docx,.doc,.xlsx,.xls,.txt" />
                </label>
              </header>

              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-100 dark:border-zinc-800 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  <div className="col-span-6 px-4">文件名</div>
                  <div className="col-span-3">上传日期</div>
                  <div className="col-span-2">类型</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
                  {documents.filter(d => d.libraryType === 'spec').map(docItem => (
                    <div 
                      key={docItem.id} 
                      onClick={() => setViewingDoc(docItem)}
                      className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all group cursor-pointer"
                    >
                      <div className="col-span-6 px-4 flex items-center gap-3">
                        <FileIcon type={docItem.fileType} />
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{docItem.title}</span>
                      </div>
                      <div className="col-span-3 text-sm text-zinc-500 dark:text-zinc-400">
                        {format(new Date(docItem.uploadDate), 'yyyy-MM-dd')}
                      </div>
                      <div className="col-span-2">
                        <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-bold rounded uppercase">
                          {docItem.fileType}
                        </span>
                      </div>
                      <div className="col-span-1 flex justify-end px-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteDoc(docItem.id); }}
                          className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {documents.filter(d => d.libraryType === 'spec').length === 0 && (
                    <div className="p-20 text-center text-zinc-400 dark:text-zinc-600">
                      <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
                      <p>还没有上传任何技术规范文档</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'basic' && (
            <motion.div 
              key="basic"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-12 max-w-6xl mx-auto"
            >
              <header className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-serif italic mb-2 text-zinc-900 dark:text-zinc-100">公司基本信息库</h2>
                  <p className="text-zinc-500 dark:text-zinc-400">上传公司资质、人员信息、过往业绩等基本资料，供 AI 撰写时参考。</p>
                </div>
                <label className="cursor-pointer bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all flex items-center gap-2 shadow-sm">
                  {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                  上传信息
                  <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'basic')} accept=".pdf,.docx,.doc,.xlsx,.xls,.txt" />
                </label>
              </header>

              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-100 dark:border-zinc-800 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  <div className="col-span-6 px-4">文件名</div>
                  <div className="col-span-3">上传日期</div>
                  <div className="col-span-2">类型</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
                  {documents.filter(d => d.libraryType === 'basic').map(docItem => (
                    <div 
                      key={docItem.id} 
                      onClick={() => setViewingDoc(docItem)}
                      className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all group cursor-pointer"
                    >
                      <div className="col-span-6 px-4 flex items-center gap-3">
                        <FileIcon type={docItem.fileType} />
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{docItem.title}</span>
                      </div>
                      <div className="col-span-3 text-sm text-zinc-500 dark:text-zinc-400">
                        {format(new Date(docItem.uploadDate), 'yyyy-MM-dd')}
                      </div>
                      <div className="col-span-2">
                        <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-bold rounded uppercase">
                          {docItem.fileType}
                        </span>
                      </div>
                      <div className="col-span-1 flex justify-end px-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteDoc(docItem.id); }}
                          className="text-zinc-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {documents.filter(d => d.libraryType === 'basic').length === 0 && (
                    <div className="p-20 text-center text-zinc-400 dark:text-zinc-600">
                      <FileCode size={48} className="mx-auto mb-4 opacity-20" />
                      <p>还没有上传任何基本信息文档</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'editor' && (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex"
            >
              {/* Editor Area */}
              <div className="flex-1 p-12 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                {currentDraft ? (
                  <div className="max-w-3xl mx-auto">
                      <input 
                        type="text" 
                        value={currentDraft.title}
                        onChange={(e) => setCurrentDraft({ ...currentDraft, title: e.target.value })}
                        className="w-full text-4xl font-serif italic bg-transparent border-none focus:ring-0 mb-12 text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-700"
                        placeholder="输入技术标标题..."
                      />

                    <div className="space-y-12">
                      {currentDraft.sections.map((section, idx) => (
                        <div key={idx} className="group relative bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                          <input 
                            type="text"
                            value={section.title}
                            onChange={(e) => {
                              const newSections = [...currentDraft.sections];
                              newSections[idx].title = e.target.value;
                              setCurrentDraft({ ...currentDraft, sections: newSections });
                            }}
                            className="text-xl font-medium text-zinc-900 dark:text-zinc-100 bg-transparent border-none focus:ring-0 mb-6 w-full"
                          />
                          
                          <div className="relative">
                            <div className="grid grid-cols-1 gap-6">
                              <div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-bold tracking-widest mb-2">提示词 / 指令</p>
                                <div className="relative flex gap-4 items-start">
                                  <textarea 
                                    value={section.prompt}
                                    onChange={(e) => {
                                      const newSections = [...currentDraft.sections];
                                      newSections[idx].prompt = e.target.value;
                                      setCurrentDraft({ ...currentDraft, sections: newSections });
                                    }}
                                    className="flex-1 min-h-[100px] bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 focus:border-indigo-300 dark:focus:border-indigo-700 transition-all resize-none text-sm text-zinc-600 dark:text-zinc-400 placeholder-zinc-300 dark:placeholder-zinc-700"
                                    placeholder="输入生成指令，如：'根据基本信息库撰写公司简介' 或 '迭代当前内容，增加技术细节'..."
                                  />
                                </div>
                              </div>
                              
                              <div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-bold tracking-widest mb-2">AI 生成内容</p>
                                <div className="relative group/content">
                                  <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800 min-h-[300px] shadow-inner shadow-zinc-50 dark:shadow-zinc-950">
                                    <AiResponseRenderer 
                                      content={section.content || "*暂无生成内容*"} 
                                      documents={documents}
                                      onSourceClick={(sourceName, snippet) => {
                                        const doc = documents.find(d => d.title.toLowerCase().includes(sourceName.toLowerCase()) || sourceName.toLowerCase().includes(d.title.toLowerCase()));
                                        if (doc) {
                                          setViewingDoc(doc);
                                          setHighlightQuery(snippet || ""); 
                                        }
                                      }} 
                                    />
                                  </div>
                                  <button 
                                    onClick={() => {
                                      const prompt = window.prompt("编辑内容:", section.content);
                                      if (prompt !== null) {
                                        const newSections = [...currentDraft.sections];
                                        newSections[idx].content = prompt;
                                        setCurrentDraft({ ...currentDraft, sections: newSections });
                                      }
                                    }}
                                    className="absolute top-4 right-4 p-2 bg-zinc-900/5 dark:bg-zinc-100/5 text-zinc-400 dark:text-zinc-500 rounded-lg opacity-0 group-hover/content:opacity-100 transition-all hover:bg-zinc-900 dark:hover:bg-zinc-100 hover:text-white dark:hover:text-zinc-900"
                                    title="手动编辑"
                                  >
                                    <PenTool size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="mt-8 flex items-center justify-between min-h-[44px]">
                              <div className="flex-1 overflow-hidden mr-4">
                                {generatingSectionId === (section.title + idx) ? (
                                  <motion.div 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex flex-col gap-3 w-full"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="flex gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 rounded-full border border-zinc-100 dark:border-zinc-800">
                                          <div className="thinking-dot" />
                                          <div className="thinking-dot" />
                                          <div className="thinking-dot" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">深度思考中</span>
                                          <StatusIndicator status={appStatus} apiError={apiError} size="w-1.5 h-1.5" />
                                          <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{settings.activeConfig.model}</span>
                                        </div>
                                      </div>
                                      <button 
                                        onClick={() => setIsSectionReasoningExpanded(!isSectionReasoningExpanded)}
                                        className="text-[9px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors"
                                      >
                                        {isSectionReasoningExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                        {isSectionReasoningExpanded ? '收起' : '展开'}
                                      </button>
                                    </div>
                                    
                                    {sectionReasoning !== null && (
                                      <div 
                                        ref={sectionReasoningRef}
                                        className={cn(
                                          "overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/50 p-3 rounded-xl border border-zinc-100/50 dark:border-zinc-800/50 transition-all duration-300",
                                          isSectionReasoningExpanded ? "max-h-96" : "max-h-20"
                                        )}
                                      >
                                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed font-mono whitespace-pre-wrap">
                                          {sectionReasoning || "正在分析章节要求..."}
                                        </p>
                                      </div>
                                    )}
                                  </motion.div>
                                ) : section.reasoning && (
                                  <div className="flex flex-col gap-2 w-full">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center shrink-0">
                                          <Sparkles size={12} className="text-indigo-500" />
                                        </div>
                                        <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">AI 思考过程</span>
                                      </div>
                                      <button 
                                        onClick={() => setIsSectionReasoningExpanded(!isSectionReasoningExpanded)}
                                        className="text-[9px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors"
                                      >
                                        {isSectionReasoningExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                        {isSectionReasoningExpanded ? '收起' : '展开'}
                                      </button>
                                    </div>
                                    <div 
                                      className={cn(
                                        "overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/50 p-3 rounded-xl border border-zinc-100/50 dark:border-zinc-800/50 transition-all duration-300",
                                        isSectionReasoningExpanded ? "max-h-96" : "max-h-12"
                                      )}
                                    >
                                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic font-mono whitespace-pre-wrap">
                                        {section.reasoning}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => handleAiGenerate(idx)}
                                disabled={!section.prompt || (generatingSectionId !== null)}
                                className="flex-shrink-0 px-8 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-lg shadow-indigo-200 dark:shadow-none"
                              >
                                <Sparkles size={16} className="text-white/80" /> {section.content ? "迭代/继续生成" : "开始生成"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-12 flex items-center gap-4">
                      <button 
                        onClick={() => {
                          const newSections = [...currentDraft.sections, { title: "新章节", content: "", prompt: "" }];
                          setCurrentDraft({ ...currentDraft, sections: newSections });
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
                      >
                        <Plus size={18} /> 添加章节
                      </button>
                      <button 
                        onClick={saveDraft}
                        className="flex items-center gap-2 px-6 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-sm"
                      >
                        <Save size={18} /> 保存草案
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <PenTool size={48} className="mb-4 opacity-20" />
                    <p>请选择或创建一个技术标草案</p>
                    <button onClick={createNewDraft} className="mt-4 text-zinc-900 dark:text-zinc-100 font-medium hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">立即创建</button>
                  </div>
                )}
              </div>

              {/* AI Assistant Panel */}
              <aside className="w-[560px] bg-white dark:bg-zinc-900 flex flex-col border-l border-zinc-200 dark:border-zinc-800">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-lg font-serif italic flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <Sparkles className="text-indigo-500" size={20} />
                    知识库检索与分析
                  </h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={16} />
                    <input 
                      type="text" 
                      placeholder="搜索知识库 (本地模糊匹配)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-0 focus:border-indigo-400 dark:focus:border-indigo-600 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-700"
                    />
                  </div>

                  {/* Local Search Results */}
                  {localSearchResults.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-bold tracking-widest">本地检索结果 ({localSearchResults.length})</p>
                        <button onClick={() => setLocalSearchResults([])} className="text-[10px] text-zinc-300 dark:text-zinc-700 hover:text-zinc-500 dark:hover:text-zinc-400">清除</button>
                      </div>
                      <div className="space-y-3">
                        {localSearchResults.map((res, i) => (
                          <div key={i} className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group shadow-sm">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText size={12} className="text-zinc-400 dark:text-zinc-500" />
                              <button 
                                onClick={() => {
                                  const doc = documents.find(d => d.id === res.docId);
                                  if (doc) {
                                    setViewingDoc(doc);
                                    setHighlightQuery(searchQuery);
                                  }
                                }}
                                className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all truncate max-w-[200px]"
                                title="点击预览源文件"
                              >
                                来源: {res.docTitle}
                              </button>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3 italic">
                              {res.snippet}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Generated Content */}
                  <div className="space-y-4">
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-bold tracking-widest">AI 深度分析与建议</p>
                    {isSearchLoading ? (
                      <div className="flex flex-col py-4 gap-4">
                        <div className="flex flex-col gap-3 w-full">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 rounded-full border border-zinc-100 dark:border-zinc-800">
                                <div className="thinking-dot" />
                                <div className="thinking-dot" />
                                <div className="thinking-dot" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">深度思考中</span>
                                <StatusIndicator status={appStatus} apiError={apiError} size="w-1.5 h-1.5" />
                                <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{settings.activeConfig.model}</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => setIsSearchReasoningExpanded(!isSearchReasoningExpanded)}
                              className="text-[9px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors"
                            >
                              {isSearchReasoningExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                              {isSearchReasoningExpanded ? '收起' : '展开'}
                            </button>
                          </div>
                          
                          {searchReasoning !== null && (
                            <div 
                              ref={searchReasoningRef}
                              className={cn(
                                "overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/50 p-3 rounded-xl border border-zinc-100/50 dark:border-zinc-800/50 transition-all duration-300",
                                isSearchReasoningExpanded ? "max-h-96" : "max-h-20"
                              )}
                            >
                              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed font-mono whitespace-pre-wrap">
                                {searchReasoning || "正在检索知识库..."}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : aiResponse ? (
                      <div className="space-y-4">
                        {searchReasoning && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center shrink-0">
                                  <Sparkles size={12} className="text-indigo-500" />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">AI 检索思路</span>
                                  <StatusIndicator status={appStatus} apiError={apiError} size="w-1.5 h-1.5" />
                                  <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{settings.activeConfig.model}</span>
                                </div>
                              </div>
                              <button 
                                onClick={() => setIsSearchReasoningExpanded(!isSearchReasoningExpanded)}
                                className="text-[9px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-1 transition-colors"
                              >
                                {isSearchReasoningExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                {isSearchReasoningExpanded ? '收起' : '展开'}
                              </button>
                            </div>
                            <div 
                              className={cn(
                                "overflow-y-auto bg-zinc-50/50 dark:bg-zinc-950/50 p-3 rounded-xl border border-zinc-100/50 dark:border-zinc-800/50 transition-all duration-300",
                                isSearchReasoningExpanded ? "max-h-96" : "max-h-12"
                              )}
                            >
                              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic font-mono whitespace-pre-wrap">
                                {searchReasoning}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none bg-indigo-50/30 dark:bg-indigo-950/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30">
                          <AiResponseRenderer 
                            content={aiResponse} 
                            documents={documents}
                            onSourceClick={(sourceName, snippet) => {
                              const doc = documents.find(d => d.title.toLowerCase().includes(sourceName.toLowerCase()) || sourceName.toLowerCase().includes(d.title.toLowerCase()));
                              if (doc) {
                                setViewingDoc(doc);
                                setHighlightQuery(snippet || "");
                              }
                            }} 
                          />
                        </div>
                        <button 
                          onClick={() => setAiResponse('')}
                          className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        >
                          清除 AI 结果
                        </button>
                      </div>
                    ) : !localSearchResults.length && (
                      <div className="text-center py-12">
                        <Search size={32} className="mx-auto mb-4 text-zinc-100 dark:text-zinc-800" />
                        <p className="text-xs text-zinc-400 dark:text-zinc-600 leading-relaxed px-4">
                          输入关键词，系统将首先进行本地模糊匹配，随后由 AI 整理相关条款和参考方案。
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-bold mb-3">常用指令</p>
                  <div className="grid grid-cols-2 gap-2">
                    <QuickAction label="检索技术要求" onClick={() => { setSearchQuery('技术要求'); handleAiSearch(); }} />
                    <QuickAction label="查找商务条款" onClick={() => { setSearchQuery('商务条款'); handleAiSearch(); }} />
                    <QuickAction label="公司资质参考" onClick={() => { setSearchQuery('公司资质'); handleAiSearch(); }} />
                    <QuickAction label="过往响应方案" onClick={() => { setSearchQuery('响应方案'); handleAiSearch(); }} />
                  </div>
                </div>
              </aside>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Document Viewer Modal */}
      <AnimatePresence>
        {viewingDoc && (
          <DocumentViewer 
            key={viewingDoc.id}
            doc={viewingDoc} 
            highlight={highlightQuery} 
            onClose={() => {
              setViewingDoc(null);
              setHighlightQuery('');
            }} 
          />
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 border border-zinc-100 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-serif italic text-zinc-900 dark:text-zinc-100">模型与 API 配置</h3>
                <button onClick={() => setShowSettings(false)} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-8">
                {/* Provider List */}
                <div className="col-span-1 space-y-2 border-r border-zinc-100 dark:border-zinc-800 pr-4">
                  {tempConfigs.map((config, idx) => (
                    <button
                      key={config.provider}
                      onClick={() => setActiveConfigIndex(idx)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                        activeConfigIndex === idx 
                          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" 
                          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      )}
                    >
                      {config.provider === 'qwen' && <Cpu size={16} />}
                      {config.provider === 'doubao' && <Sparkles size={16} />}
                      {config.provider === 'deepseek' && <FileCode size={16} />}
                      {config.provider === 'qwen' ? '通义千问' : config.provider === 'doubao' ? '豆包' : 'DeepSeek'}
                    </button>
                  ))}
                </div>

                {/* Config Form */}
                <div className="col-span-2 space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">API Key</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={16} />
                      <input 
                        type={showApiKey ? "text" : "password"} 
                        value={tempConfigs[activeConfigIndex].apiKey}
                        onChange={(e) => {
                          const newConfigs = [...tempConfigs];
                          newConfigs[activeConfigIndex].apiKey = e.target.value;
                          setTempConfigs(newConfigs);
                        }}
                        placeholder={`输入您的 ${tempConfigs[activeConfigIndex].provider.toUpperCase()} API Key`}
                        className="w-full pl-10 pr-12 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-0 focus:border-indigo-400 dark:focus:border-indigo-600 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-700"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">模型名称</label>
                    <input 
                      type="text" 
                      value={tempConfigs[activeConfigIndex].model}
                      onChange={(e) => {
                        const newConfigs = [...tempConfigs];
                        newConfigs[activeConfigIndex].model = e.target.value;
                        setTempConfigs(newConfigs);
                      }}
                      placeholder="例如: gemini-3-flash-preview, gpt-4o"
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-0 focus:border-indigo-400 dark:focus:border-indigo-600 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Base URL (可选)</label>
                    <input 
                      type="text" 
                      value={tempConfigs[activeConfigIndex].baseUrl || ''}
                      onChange={(e) => {
                        const newConfigs = [...tempConfigs];
                        newConfigs[activeConfigIndex].baseUrl = e.target.value;
                        setTempConfigs(newConfigs);
                      }}
                      placeholder="API 代理地址"
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-0 focus:border-indigo-400 dark:focus:border-indigo-600 transition-all text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-700"
                    />
                  </div>

                  <div className="pt-4 space-y-3">
                    <button 
                      onClick={saveSettings}
                      className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Save size={18} />
                      保存并应用配置
                    </button>
                    
                    <button 
                      onClick={() => setShowResetConfirm(true)}
                      className="w-full py-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      彻底清除所有应用数据
                    </button>

                    <p className="mt-4 text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed text-center">
                      API Key 仅存储在本地浏览器中。
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(false)}
              className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 text-center border border-zinc-100 dark:border-zinc-800"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="text-red-500 dark:text-red-400" size={32} />
              </div>
              <h3 className="text-xl font-serif italic mb-4 text-zinc-900 dark:text-zinc-100">确定要清除所有数据吗？</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed">
                此操作将永久删除所有已上传的文档、生成的草案以及您的 API 配置。该过程不可逆，请谨慎操作。
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={resetApp}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all"
                >
                  确定清除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    pdf: 'text-red-500',
    doc: 'text-blue-500',
    docx: 'text-blue-500',
    xls: 'text-emerald-500',
    xlsx: 'text-emerald-500',
    txt: 'text-stone-400',
    md: 'text-stone-400'
  };

  const IconMap: Record<string, any> = {
    pdf: FileText,
    doc: FileText,
    docx: FileText,
    xls: FileJson,
    xlsx: FileJson,
    txt: FileText,
    md: FileCode
  };

  const Icon = IconMap[type] || FileText;
  const color = colorMap[type] || 'text-stone-400';

  return <Icon size={20} className={color} />;
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
        active 
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40" 
          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? label : ""}
    >
      {icon}
      {!collapsed && label}
    </button>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{title}</span>
        {icon}
      </div>
      <div className="text-3xl font-serif italic text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="text-[11px] text-left p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
    >
      {label}
    </button>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-12 text-center">
          <div className="max-w-md bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-xl border border-red-100 dark:border-red-900/30">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="text-red-500 dark:text-red-400" size={32} />
            </div>
            <h2 className="text-2xl font-serif italic mb-4 text-zinc-900 dark:text-zinc-100">应用运行出错</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6 leading-relaxed">
              很抱歉，系统遇到了一个无法处理的错误。这可能是由于文件解析异常或浏览器兼容性问题导致的。
            </p>
            <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl text-left mb-8 overflow-auto max-h-40 border border-zinc-100 dark:border-zinc-800">
              <code className="text-[10px] text-red-600 dark:text-red-400 font-mono break-all">
                {this.state.error?.toString()}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all"
            >
              刷新页面重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- New Components for UI Improvements ---

function AiResponseRenderer({ content, onSourceClick, documents }: { content: string, onSourceClick: (name: string, snippet: string) => void, documents: BidDocument[] }) {
  // We'll use a more direct approach to rendering source tags to avoid markdown link issues
  // We split the content by source tags and render them as React components mixed with Markdown
  
  const renderedContent = useMemo(() => {
    // Regex to match [来源: 文档名称 | 引用片段] or [来源: 文档名称]
    const sourceRegex = /\[+(来源|参考):\s*(.*?)(?:\s*\|\s*(.*?))?\]+/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = sourceRegex.exec(content)) !== null) {
      // Add text before the match as Markdown
      if (match.index > lastIndex) {
        const textPart = content.substring(lastIndex, match.index);
        parts.push(
          <ReactMarkdown key={`text-${lastIndex}`} remarkPlugins={[remarkGfm]}>
            {textPart}
          </ReactMarkdown>
        );
      }

      // Add the source tag as a custom component on a new line
      const name = match[2].trim();
      const snippet = match[3] ? match[3].trim() : "";
      
      // Check if source is valid (exists in documents and snippet matches)
      const doc = documents.find(d => d.title.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(d.title.toLowerCase()));
      
      // Normalize function for comparison
      const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, '').replace(/\s+/g, ' ').trim();
      const isValid = doc && (!snippet || normalize(doc.content).includes(normalize(snippet)));

      if (isValid) {
        parts.push(
          <div key={`source-${match.index}`} className="my-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div 
              className="ai-source-box group cursor-pointer"
              onClick={() => onSourceClick(name, snippet)}
            >
              <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider">
                <BookOpen size={10} />
                <span>参考来源: {name}</span>
              </div>
              {snippet && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic leading-relaxed pl-4 border-l-2 border-indigo-200 dark:border-indigo-800 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                  “{snippet}”
                </p>
              )}
              <div className="mt-1 text-[9px] text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <ExternalLink size={8} /> 点击定位至原文
              </div>
            </div>
          </div>
        );
      }

      lastIndex = sourceRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      const remainingText = content.substring(lastIndex);
      parts.push(
        <ReactMarkdown key={`text-${lastIndex}`} remarkPlugins={[remarkGfm]}>
          {remainingText}
        </ReactMarkdown>
      );
    }

    return parts;
  }, [content, onSourceClick]);

  return (
    <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-headings:font-serif prose-headings:italic prose-p:leading-relaxed prose-li:my-1">
      {renderedContent}
    </div>
  );
}

function DocumentViewer({ doc, highlight, onClose }: { doc: BidDocument, highlight?: string, onClose: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [localHighlight, setLocalHighlight] = useState(highlight || '');
  const [matchStatus, setMatchStatus] = useState<'searching' | 'found' | 'not-found' | 'none'>(highlight ? 'searching' : 'none');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matchElements, setMatchElements] = useState<HTMLElement[][]>([]);
  const [searchNonce, setSearchNonce] = useState(0);
  const isHtml = doc.content.trim().startsWith('<');

  const scrollToMatch = (index: number) => {
    if (matchElements[index] && matchElements[index][0]) {
      matchElements[index][0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Update active state for animation
      matchElements.forEach((spans, i) => {
        if (i === index) {
          spans.forEach(span => span.classList.add('highlight-active'));
        } else {
          spans.forEach(span => span.classList.remove('highlight-active'));
        }
      });
      
      setCurrentMatchIndex(index);
    }
  };

  const navigateMatch = (direction: 'next' | 'prev') => {
    if (matchCount === 0) return;
    
    let nextIndex;
    if (direction === 'next') {
      nextIndex = (currentMatchIndex + 1) % matchCount;
    } else {
      nextIndex = (currentMatchIndex - 1 + matchCount) % matchCount;
    }
    scrollToMatch(nextIndex);
  };

  useEffect(() => {
    if (highlight) {
      setLocalHighlight(highlight);
    }
  }, [highlight]);

  // Initial content set
  useEffect(() => {
    if (contentRef.current) {
      if (isHtml) {
        contentRef.current.innerHTML = doc.content;
      } else {
        contentRef.current.innerHTML = '';
        const pre = document.createElement('pre');
        pre.className = "whitespace-pre-wrap font-sans text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed tracking-wide";
        pre.textContent = doc.content;
        contentRef.current.appendChild(pre);
      }
    }
  }, [doc.id, isHtml, doc.content]);

  useEffect(() => {
    // Reset matches when localHighlight changes
    setMatchElements([]);
    setMatchCount(0);
    setCurrentMatchIndex(0);
    setMatchStatus(localHighlight ? 'searching' : 'none');

    if (!localHighlight || !contentRef.current) {
      setMatchStatus('none');
      return;
    }

    const performHighlight = () => {
      const container = contentRef.current;
      if (!container) return;

      // Reset content to original before highlighting to avoid nested spans or stale state
      if (isHtml) {
        container.innerHTML = doc.content;
      } else {
        container.innerHTML = '';
        const pre = document.createElement('pre');
        pre.className = "whitespace-pre-wrap font-sans text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed tracking-wide";
        pre.textContent = doc.content;
        container.appendChild(pre);
      }

      const query = localHighlight.trim();
      if (query.length < 2) {
        setMatchStatus('none');
        return;
      }

      // Find all text nodes
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      const textNodes: Text[] = [];
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node as Text);
      }

      const fullText = textNodes.map(n => n.nodeValue || "").join("");
      const lowerFullText = fullText.toLowerCase();
      const lowerQuery = query.toLowerCase();
      
      const matchPositions: number[] = [];
      let pos = lowerFullText.indexOf(lowerQuery);
      while (pos !== -1 && matchPositions.length < 100) {
        matchPositions.push(pos);
        pos = lowerFullText.indexOf(lowerQuery, pos + query.length);
      }

      if (matchPositions.length === 0) {
        // Fuzzy matching fallback
        const normalizeStr = (s: string) => s.replace(/[^\w\u4e00-\u9fa5]/g, "").toLowerCase();
        const normQuery = normalizeStr(query);
        
        if (normQuery.length > 2) {
          const normFullText = textNodes.map(n => normalizeStr(n.nodeValue || "")).join("");
          const normPos = normFullText.indexOf(normQuery);
          
          if (normPos !== -1) {
            let currentNormOffset = 0;
            for (const tNode of textNodes) {
              const nodeNormText = normalizeStr(tNode.nodeValue || "");
              if (currentNormOffset + nodeNormText.length > normPos) {
                const parent = tNode.parentNode;
                if (parent) {
                  const wrapper = document.createElement('span');
                  wrapper.className = 'highlight-flash highlight-active';
                  parent.replaceChild(wrapper, tNode);
                  wrapper.appendChild(tNode);
                  
                  requestAnimationFrame(() => {
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  });
                  
                  setMatchElements([[wrapper]]);
                  setMatchCount(1);
                  setMatchStatus('found');
                  return;
                }
              }
              currentNormOffset += nodeNormText.length;
            }
          }
        }
        setMatchStatus('not-found');
        return;
      }

      // Apply matches in REVERSE order to keep offsets valid
      const foundMatches: HTMLElement[][] = [];
      for (let i = matchPositions.length - 1; i >= 0; i--) {
        const startPos = matchPositions[i];
        let currentOffset = 0;
        let startNodeIndex = -1;
        let startOffset = 0;
        
        for (let j = 0; j < textNodes.length; j++) {
          const nodeLen = textNodes[j].nodeValue?.length || 0;
          if (currentOffset + nodeLen > startPos) {
            startNodeIndex = j;
            startOffset = startPos - currentOffset;
            break;
          }
          currentOffset += nodeLen;
        }

        if (startNodeIndex !== -1) {
          let remainingLength = query.length;
          let currentNodeIndex = startNodeIndex;
          let currentStartOffset = startOffset;
          const matchSpans: HTMLElement[] = [];

          while (remainingLength > 0 && currentNodeIndex < textNodes.length) {
            const currentNode = textNodes[currentNodeIndex];
            const nodeText = currentNode.nodeValue || "";
            const availableInNode = nodeText.length - currentStartOffset;
            const takeFromNode = Math.min(remainingLength, availableInNode);

            if (takeFromNode > 0) {
              const parent = currentNode.parentNode;
              if (parent) {
                const span = document.createElement('span');
                span.className = 'highlight-flash';
                
                const before = nodeText.substring(0, currentStartOffset);
                const match = nodeText.substring(currentStartOffset, currentStartOffset + takeFromNode);
                const after = nodeText.substring(currentStartOffset + takeFromNode);
                
                const frag = document.createDocumentFragment();
                if (before) frag.appendChild(document.createTextNode(before));
                span.textContent = match;
                frag.appendChild(span);
                if (after) frag.appendChild(document.createTextNode(after));
                
                parent.replaceChild(frag, currentNode);
                matchSpans.push(span);
              }
            }

            remainingLength -= takeFromNode;
            currentNodeIndex++;
            currentStartOffset = 0;
          }
          if (matchSpans.length > 0) {
            foundMatches.unshift(matchSpans); // Add to beginning since we are iterating backwards
          }
        }
      }

      if (foundMatches.length > 0) {
        setMatchElements(foundMatches);
        setMatchCount(foundMatches.length);
        setMatchStatus('found');
        
        requestAnimationFrame(() => {
          if (foundMatches[0] && foundMatches[0][0]) {
            foundMatches[0][0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            foundMatches[0].forEach(el => el.classList.add('highlight-active'));
          }
        });
      } else {
        setMatchStatus('not-found');
      }
    };

    const timer = setTimeout(performHighlight, 300);
    return () => clearTimeout(timer);
  }, [localHighlight, doc.id, searchNonce, isHtml, doc.content]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/40 dark:bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-5xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800"
      >
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-100 dark:border-zinc-700">
              <FileIcon type={doc.fileType} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-lg font-serif italic text-zinc-900 dark:text-zinc-100">{doc.title}</h3>
              <div className="flex items-center gap-3 mt-1">
                {matchStatus === 'searching' && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold flex items-center gap-1.5">
                    <Loader2 size={10} className="animate-spin" /> 正在搜索...
                  </span>
                )}
                {matchStatus === 'not-found' && (
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-bold flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                    <AlertCircle size={10} /> 未找到匹配内容
                  </span>
                )}
                {matchStatus === 'found' && (
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                      <Sparkles size={10} /> 已找到 {matchCount} 处匹配
                    </span>
                    <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                      <button 
                        onClick={() => navigateMatch('prev')}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono">
                        {currentMatchIndex + 1} / {matchCount}
                      </span>
                      <button 
                        onClick={() => navigateMatch('next')}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 shadow-sm focus-within:border-red-500 transition-all">
              <Search className="w-4 h-4 text-zinc-400" />
              <input 
                type="text"
                value={localHighlight}
                onChange={(e) => setLocalHighlight(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && navigateMatch('next')}
                placeholder="输入关键词搜索..."
                className="bg-transparent border-none outline-none text-sm w-48 dark:text-zinc-200 font-medium"
                autoFocus
              />
              <button 
                onClick={() => {
                  setMatchStatus('searching');
                  setSearchNonce(n => n + 1);
                }}
                className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-md transition-colors"
              >
                搜索
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  const container = contentRef.current;
                  if (container) {
                    container.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                title="回到顶部"
              >
                <ChevronUp size={20} />
              </button>
              <button 
                onClick={onClose} 
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
        <div 
          className="flex-1 overflow-y-auto p-12 bg-white dark:bg-zinc-950 scroll-smooth doc-content-html prose prose-zinc dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-serif prose-p:text-zinc-700 dark:prose-p:text-zinc-300" 
          ref={contentRef}
        />
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest">
              <Globe size={10} /> {doc.fileType.toUpperCase()} 文档
            </div>
            <div className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest">
              {doc.content.length.toLocaleString()} 字符
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-bold">
            上传于 {format(new Date(doc.uploadDate), 'yyyy-MM-dd HH:mm')}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
