import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2, Trash2, MessageCircle, X, Send, Menu, Plus, BookOpen,
  ChevronDown, Sparkles, Edit2, Save, Moon, Check, Loader2, LogOut,
  GripVertical, CornerDownRight, LayoutGrid, CalendarDays, History,
  PlayCircle, AlertTriangle, Copy,
} from 'lucide-react';
import { type DayData, type Todo, type ReflectionData, type Habit, ViewMode, type LongTermPlan, type PlanItem } from './types';
import { INITIAL_HABITS, FALLBACK_QUOTE } from './constants';
import { generateDailyQuote, generateDayRating, getStoicChatResponse } from './services/geminiService';
import { format, isSameDay, parseISO, addDays, subDays } from 'date-fns';
import { auth, googleProvider } from './firebaseConfig';
import { signInWithPopup, signOut, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  saveDayToCloud, getDayFromCloud, getHistoryFromCloud,
  savePlanToCloud, getPlanFromCloud,
} from './services/firestoreService';

// ─── Micro-components ────────────────────────────────────────────────────────

const GlassCard: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.04)] rounded-2xl p-8 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)] hover:bg-white/90 ${className}`}>
    {children}
  </div>
);

const ButtonPrimary: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', ...props }) => (
  <button className={`relative overflow-hidden bg-gradient-to-br from-slate-800 to-black text-white px-8 py-4 rounded-xl font-bold tracking-tight transition-all duration-300 shadow-lg hover:shadow-slate-900/25 hover:from-slate-700 hover:to-slate-900 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${className}`} {...props}>
    {children}
  </button>
);

type CBVariant = 'slate' | 'rose' | 'sage' | 'indigo';
const Checkbox: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; variant?: CBVariant }> = ({ checked, onChange, disabled, variant = 'slate' }) => {
  const colors: Record<CBVariant, string> = {
    rose: checked ? 'bg-rose-500 border-rose-500' : 'border-rose-200 hover:border-rose-400 bg-white',
    indigo: checked ? 'bg-indigo-500 border-indigo-500' : 'border-indigo-200 hover:border-indigo-400 bg-white',
    sage: checked ? 'bg-emerald-500 border-emerald-500' : 'border-emerald-200 hover:border-emerald-400 bg-white',
    slate: checked ? 'bg-slate-900 border-slate-900' : 'border-slate-300 hover:border-slate-500 bg-white',
  };
  return (
    <button onClick={onChange} disabled={disabled} className={`shrink-0 w-5 h-5 rounded-[6px] border-[2px] flex items-center justify-center transition-all duration-200 ${colors[variant]} ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer shadow-sm'}`}>
      <CheckCircle2 size={14} className={`text-white transition-all duration-200 ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} strokeWidth={4} />
    </button>
  );
};

const AutoResizeTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px'; }
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} className={`resize-none overflow-hidden ${props.className}`} />;
};

const FocusLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="20" cy="20" r="7" fill="currentColor" />
  </svg>
);

const RocketOverlay: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  useEffect(() => { const t = setTimeout(onComplete, 3000); return () => clearTimeout(t); }, [onComplete]);
  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {[...Array(40)].map((_, i) => (
        <div key={i} className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full animate-confetti"
          style={{ backgroundColor: ['#FCD34D', '#34D399', '#F87171', '#60A5FA', '#A78BFA'][i % 5], left: `${50 + (Math.random() * 60 - 30)}%`, top: `${50 + (Math.random() * 60 - 30)}%`, animationDelay: `${Math.random() * 0.2}s` }} />
      ))}
      <div className="absolute bottom-[-100px] left-[10%] animate-rocket"><div className="text-[100px] transform rotate-45 filter drop-shadow-2xl">🚀</div></div>
    </div>
  );
};

const ProgressFloater: React.FC<{ progress: number }> = ({ progress }) => {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <div className="fixed bottom-6 right-6 z-[60] bg-white/80 backdrop-blur-xl p-3 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/50 flex items-center gap-3 hover:scale-105 transition-all cursor-default group">
      <div className="relative w-12 h-12 flex items-center justify-center">
        <svg className="transform -rotate-90 w-12 h-12">
          <circle cx="24" cy="24" r={r} stroke="#E2E8F0" strokeWidth="4" fill="transparent" />
          <circle cx="24" cy="24" r={r} stroke="url(#pg)" strokeWidth="4" fill="transparent" strokeDasharray={c} strokeDashoffset={c - (progress / 100) * c} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
          <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#10b981" /></linearGradient></defs>
        </svg>
        <span className="absolute text-[10px] font-bold text-slate-700">{Math.round(progress)}%</span>
      </div>
      <div className="w-0 overflow-hidden group-hover:w-auto transition-all duration-300 opacity-0 group-hover:opacity-100 whitespace-nowrap pr-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Day Progress</div>
        <div className="text-xs font-bold text-slate-900">Keep pushing!</div>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────

type GuestUser = { uid: string; displayName: string };

export default function App() {
  const [user, setUser] = useState<FirebaseUser | GuestUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authErrorDomain, setAuthErrorDomain] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.DAY);
  const [history, setHistory] = useState<DayData[]>([]);
  const [todayData, setTodayData] = useState<DayData | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [monthlyPlan, setMonthlyPlan] = useState<LongTermPlan | null>(null);
  const [yearlyPlan, setYearlyPlan] = useState<LongTermPlan | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEditingHabits, setIsEditingHabits] = useState(false);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);

  const [todoFilter, setTodoFilter] = useState<'all' | 'open' | 'done'>('all');
  const [workInput, setWorkInput] = useState('');
  const [personalInput, setPersonalInput] = useState('');
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);

  const [showRocket, setShowRocket] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [reflectionStep, setReflectionStep] = useState<'intro' | 'open-todos' | 'quick-win' | 'form' | 'rating'>('intro');
  const [tempReflection, setTempReflection] = useState<Partial<ReflectionData>>({});
  const [isGeneratingRating, setIsGeneratingRating] = useState(false);

  const [morningReviewData, setMorningReviewData] = useState<DayData | null>(null);
  const [showMorningReview, setShowMorningReview] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth ──

  const handleLogin = async () => {
    setAuthErrorDomain(null);
    try { await signInWithPopup(auth, googleProvider); }
    catch (e: unknown) { if ((e as { code?: string }).code === 'auth/unauthorized-domain') setAuthErrorDomain(window.location.hostname); }
  };
  const handleGuestLogin = () => setUser({ uid: 'guest', displayName: 'Guest' });
  const handleLogout = async () => { await signOut(auth); setUser(null); };

  useEffect(() => {
    if (user && (user as GuestUser).uid === 'guest') { setIsAuthLoading(false); return; }
    return onAuthStateChanged(auth, u => { setUser(u); setIsAuthLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data Loading ──

  useEffect(() => {
    if (!user) return;
    setIsLoadingData(true);
    getHistoryFromCloud(user.uid).then(data => {
      setHistory(data);
      setIsLoadingData(false);
      const yesterdayId = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const yesterday = data.find(d => d.id === yesterdayId);
      if (yesterday && !yesterday.isReflectionSubmitted) { setMorningReviewData(yesterday); setShowMorningReview(true); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const cached = history.find(d => d.id === dateStr);
    if (cached) { setTodayData(cached); return; }
    getDayFromCloud(user.uid, dateStr).then(cloud => {
      if (cloud) {
        setTodayData(cloud);
        setHistory(prev => prev.find(d => d.id === cloud.id) ? prev : [...prev, cloud].sort((a, b) => b.id.localeCompare(a.id)));
      } else {
        const recent = [...history].sort((a, b) => b.id.localeCompare(a.id))[0];
        const habits = recent ? recent.habits.map((h: Habit) => ({ ...h, completed: false })) : INITIAL_HABITS;
        setTodayData({ id: dateStr, date: format(currentDate, 'EEEE, MMMM d, yyyy'), focus: '', focusCompleted: false, todos: [], habits, notes: '', quote: null, reflection: null, aiRating: null, isReflectionSubmitted: false });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, user]);

  useEffect(() => {
    if (!user) return;
    if (viewMode === ViewMode.MONTH) {
      const key = `month-${format(currentDate, 'yyyy-MM')}`;
      getPlanFromCloud(user.uid, key).then(p => setMonthlyPlan(p || { id: key, title: format(currentDate, 'MMMM yyyy'), oneThing: '', supportingGoals: [], notes: '' }));
    }
    if (viewMode === ViewMode.YEAR) {
      const key = `year-${format(currentDate, 'yyyy')}`;
      getPlanFromCloud(user.uid, key).then(p => setYearlyPlan(p || { id: key, title: format(currentDate, 'yyyy'), oneThing: '', supportingGoals: [], notes: '', quarters: { q1: '', q2: '', q3: '', q4: '' } }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode, user]);

  useEffect(() => {
    if (todayData && !todayData.quote && !todayData.isReflectionSubmitted && isSameDay(currentDate, new Date()) && viewMode === ViewMode.DAY)
      generateDailyQuote().then(q => updateTodayData({ quote: q || FALLBACK_QUOTE }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayData?.id, viewMode]);

  // ── Updaters ──

  const updateTodayData = (updates: Partial<DayData>) => {
    if (!todayData || !user) return;
    const updated = { ...todayData, ...updates };
    setTodayData(updated);
    setHistory(prev => prev.find(d => d.id === updated.id) ? prev.map(d => d.id === updated.id ? updated : d).sort((a, b) => b.id.localeCompare(a.id)) : [...prev, updated].sort((a, b) => b.id.localeCompare(a.id)));
    setIsSaving(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => { await saveDayToCloud(user.uid, updated); setIsSaving(false); }, 1000);
  };

  const updateArbitraryDay = async (day: DayData) => {
    if (!user) return;
    await saveDayToCloud(user.uid, day);
    setHistory(prev => prev.map(d => d.id === day.id ? day : d).sort((a, b) => b.id.localeCompare(a.id)));
  };

  const updateMonthlyPlan = (updates: Partial<LongTermPlan>) => {
    if (!monthlyPlan || !user) return;
    const updated = { ...monthlyPlan, ...updates };
    setMonthlyPlan(updated);
    setIsSaving(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => { await savePlanToCloud(user.uid, updated); setIsSaving(false); }, 1000);
  };

  const updateYearlyPlan = (updates: Partial<LongTermPlan>) => {
    if (!yearlyPlan || !user) return;
    const updated = { ...yearlyPlan, ...updates };
    setYearlyPlan(updated);
    setIsSaving(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => { await savePlanToCloud(user.uid, updated); setIsSaving(false); }, 1000);
  };

  // ── Milestones ──

  const addMilestone = () => { if (!monthlyPlan) return; updateMonthlyPlan({ supportingGoals: [...monthlyPlan.supportingGoals, { id: Date.now().toString(), text: '', completed: false } as PlanItem] }); };
  const toggleMilestone = (id: string) => { if (!monthlyPlan) return; updateMonthlyPlan({ supportingGoals: monthlyPlan.supportingGoals.map(m => m.id === id ? { ...m, completed: !m.completed } : m) }); };
  const updateMilestoneText = (id: string, text: string) => { if (!monthlyPlan) return; updateMonthlyPlan({ supportingGoals: monthlyPlan.supportingGoals.map(m => m.id === id ? { ...m, text } : m) }); };
  const deleteMilestone = (id: string) => { if (!monthlyPlan || !confirm('Delete milestone?')) return; updateMonthlyPlan({ supportingGoals: monthlyPlan.supportingGoals.filter(m => m.id !== id) }); };

  // ── Todos ──

  const handleAddTodo = (cat: 'work' | 'personal') => {
    const input = cat === 'work' ? workInput : personalInput;
    if (!input.trim() || !todayData) return;
    if (todayData.todos.length >= 20) { alert('Keep it simple. Max 20 tasks.'); return; }
    updateTodayData({ todos: [...todayData.todos, { id: Date.now().toString(), text: input, completed: false, category: cat, indentLevel: 0 }] });
    cat === 'work' ? setWorkInput('') : setPersonalInput('');
  };

  const addSubtask = (parentId: string) => {
    if (!todayData) return;
    const pIdx = todayData.todos.findIndex(t => t.id === parentId);
    if (pIdx < 0 || (todayData.todos[pIdx].indentLevel || 0) >= 2) return;
    const parent = todayData.todos[pIdx];
    const sub: Todo = { id: Date.now().toString(), text: '', completed: false, category: parent.category, indentLevel: (parent.indentLevel || 0) + 1 };
    const list = [...todayData.todos]; list.splice(pIdx + 1, 0, sub);
    updateTodayData({ todos: list });
  };

  const updateTodoText = (id: string, text: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t => t.id === id ? { ...t, text } : t) }); };
  const toggleTodo = (id: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t) }); };
  const deleteTodo = (id: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.filter(t => t.id !== id) }); };
  const changeIndent = (id: string, delta: number) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t => t.id === id ? { ...t, indentLevel: Math.max(0, Math.min(2, (t.indentLevel || 0) + delta)) } : t) }); };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'; setDraggedTodoId(id);
    const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e: React.DragEvent, targetId?: string, targetCat?: 'work' | 'personal') => {
    e.preventDefault();
    if (!draggedTodoId || !todayData) return;
    if (targetCat) { updateTodayData({ todos: todayData.todos.map(t => t.id === draggedTodoId ? { ...t, category: targetCat, indentLevel: 0 } : t) }); setDraggedTodoId(null); return; }
    if (targetId && targetId !== draggedTodoId) {
      const list = [...todayData.todos];
      const di = list.findIndex(t => t.id === draggedTodoId);
      if (di < 0) return;
      let bs = 1;
      for (let i = di + 1; i < list.length; i++) { if ((list[i].indentLevel || 0) > (list[di].indentLevel || 0)) bs++; else break; }
      const block = list.splice(di, bs);
      const hi = list.findIndex(t => t.id === targetId);
      if (hi >= 0) list.splice(hi, 0, ...block);
      updateTodayData({ todos: list });
    }
    setDraggedTodoId(null);
  };

  // ── Habits ──

  const toggleHabit = (id: string) => { if (!todayData) return; updateTodayData({ habits: todayData.habits.map(h => h.id === id ? { ...h, completed: !h.completed } : h) }); };
  const updateHabitText = (id: string, text: string) => { if (!todayData) return; updateTodayData({ habits: todayData.habits.map(h => h.id === id ? { ...h, text } : h) }); };
  const deleteHabit = (id: string) => { if (!todayData || !confirm('Delete habit?')) return; updateTodayData({ habits: todayData.habits.filter(h => h.id !== id) }); };
  const addHabit = () => { if (!todayData) return; updateTodayData({ habits: [...todayData.habits, { id: Date.now().toString(), text: 'New habit', completed: false }] }); };

  // ── Focus celebration ──

  const toggleFocusComplete = () => {
    if (!todayData) return;
    const next = !todayData.focusCompleted;
    updateTodayData({ focusCompleted: next });
    if (next) setShowRocket(true);
  };

  // ── Reflection ──

  const startReflection = () => {
    if (!todayData) return;
    setReflectionStep(todayData.todos.filter(t => !t.completed).length > 0 ? 'open-todos' : 'form');
  };

  const handleMorningReviewAction = async (action: 'move' | 'discard') => {
    if (!morningReviewData || !user) return;
    if (action === 'move' && todayData) {
      const open = morningReviewData.todos.filter(t => !t.completed);
      const moved = open.map(t => ({ ...t, id: Date.now().toString() + Math.random().toString().slice(2, 5) }));
      const updated = { ...todayData, todos: [...todayData.todos, ...moved] };
      setTodayData(updated); await saveDayToCloud(user.uid, updated);
    }
    await updateArbitraryDay({ ...morningReviewData, isReflectionSubmitted: true, aiRating: { color: 'yellow', feedback: 'Day closed the next morning.', suggestion: 'Start fresh today!' } });
    setShowMorningReview(false);
  };

  const handleMoveTodosToTomorrow = async () => {
    if (!todayData || !user) return;
    const open = todayData.todos.filter(t => !t.completed);
    if (open.length === 0) { setReflectionStep('form'); return; }
    const tomorrow = addDays(currentDate, 1);
    const tId = format(tomorrow, 'yyyy-MM-dd');
    let tData = await getDayFromCloud(user.uid, tId);
    if (!tData) tData = { id: tId, date: format(tomorrow, 'EEEE, MMMM d, yyyy'), focus: '', focusCompleted: false, todos: [], habits: todayData.habits.map(h => ({ ...h, completed: false })), notes: '', quote: null, reflection: null, aiRating: null, isReflectionSubmitted: false };
    tData.todos = [...tData.todos, ...open.map(t => ({ ...t, id: Date.now().toString() + Math.random().toString().slice(2, 5) }))];
    await saveDayToCloud(user.uid, tData);
    updateTodayData({ todos: todayData.todos.filter(t => t.completed) });
    setReflectionStep('form');
  };

  const handleDiscardOpenTodos = () => { if (!todayData) return; updateTodayData({ todos: todayData.todos.filter(t => t.completed) }); setReflectionStep('form'); };

  const handleReflectionSubmit = async () => {
    if (!todayData) return;
    setIsGeneratingRating(true);
    const reflection: ReflectionData = { focusAchieved: tempReflection.focusAchieved || false, todosCompletedCount: todayData.todos.filter(t => t.completed).length, habitsCompletedCount: todayData.habits.filter(h => h.completed).length, biggestWin: tempReflection.biggestWin || '', betterTomorrow: tempReflection.betterTomorrow || '', selfRating: tempReflection.selfRating as ReflectionData['selfRating'] };
    const withR = { ...todayData, reflection };
    const aiRating = await generateDayRating(withR);
    const final = { ...withR, aiRating: aiRating || { color: 'yellow' as const, feedback: 'Day saved.', suggestion: 'Tomorrow is a new day!' }, isReflectionSubmitted: true };
    setTodayData(final); await saveDayToCloud(user!.uid, final);
    setHistory(prev => prev.map(d => d.id === final.id ? final : d));
    setIsGeneratingRating(false); setReflectionStep('rating');
  };

  // ── Chat ──

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !todayData?.quote) return;
    const msg = chatMessage;
    setChatHistory(prev => [...prev, { sender: 'user', text: msg }]);
    setChatMessage(''); setIsChatLoading(true);
    const res = await getStoicChatResponse(msg, todayData.quote);
    setChatHistory(prev => [...prev, { sender: 'ai', text: res }]);
    setIsChatLoading(false);
  };

  // ── Helpers ──

  const isToday = isSameDay(currentDate, new Date());
  const isReadOnly = viewMode === ViewMode.DAY && !isToday && !!todayData?.isReflectionSubmitted;

  const calcProgress = (data: DayData | null = todayData) => {
    if (!data) return 0;
    const max = data.todos.length + 3;
    const earned = data.todos.filter(t => t.completed).length + (data.focusCompleted ? 3 : 0);
    return max === 0 ? 0 : Math.min(100, Math.round((earned / max) * 100));
  };

  const getTrafficLight = (color?: 'green' | 'yellow' | 'red') => {
    if (color === 'green') return 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]';
    if (color === 'yellow') return 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]';
    if (color === 'red') return 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]';
    return 'bg-slate-200';
  };

  const getTodos = (cat: 'work' | 'personal') => (todayData?.todos || []).filter(t => { if (t.category !== cat) return false; if (todoFilter === 'open') return !t.completed; if (todoFilter === 'done') return t.completed; return true; });

  const getRelativeLabel = (date: Date) => { if (isSameDay(date, new Date())) return 'Today'; if (isSameDay(date, addDays(new Date(), 1))) return 'Tomorrow'; if (isSameDay(date, subDays(new Date(), 1))) return 'Yesterday'; if (isSameDay(date, subDays(new Date(), 2))) return '2 days ago'; return null; };

  const getDayTheme = (date: Date) => { if (isSameDay(date, new Date())) return { top: 'from-indigo-200 via-purple-200 to-cyan-200', bottom: 'from-rose-200 via-orange-200 to-amber-200' }; if (date > new Date()) return { top: 'from-emerald-200 via-teal-200 to-cyan-200', bottom: 'from-blue-200 via-indigo-200 to-violet-200' }; return { top: 'from-slate-200 via-gray-200 to-zinc-200', bottom: 'from-stone-200 via-neutral-200 to-gray-200' }; };

  const timelineItems = useMemo(() => {
    const todayId = format(new Date(), 'yyyy-MM-dd');
    const past = [-2, -1].map(offset => { const date = addDays(new Date(), offset); const id = format(date, 'yyyy-MM-dd'); return { id, date, isFuture: false, label: getRelativeLabel(date), data: history.find(d => d.id === id) }; });
    const todayItem = { id: todayId, date: new Date(), isFuture: false, label: 'Today', data: history.find(d => d.id === todayId) };
    const future = [1, 2, 3].map(offset => { const date = addDays(new Date(), offset); const id = format(date, 'yyyy-MM-dd'); return { id, date, isFuture: true, label: null as string | null, data: history.find(d => d.id === id) }; });
    return [...past, todayItem, ...future];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const themeColors = getDayTheme(currentDate);

  // ── TodoCard ─ inner component using closure ──────────────────────────────

  const renderTodoCard = (category: 'work' | 'personal') => {
    const isWork = category === 'work';
    const a = isWork
      ? { dot: 'bg-indigo-500', label: 'text-indigo-900', card: '!bg-indigo-50/40 !border-indigo-100', hover: 'hover:border-indigo-200', plus: 'text-indigo-300', plusHover: 'hover:border-indigo-200', inputCls: 'placeholder:text-indigo-300/70', variant: 'indigo' as CBVariant }
      : { dot: 'bg-rose-500', label: 'text-rose-900', card: '!bg-rose-50/40 !border-rose-100', hover: 'hover:border-rose-200', plus: 'text-rose-300', plusHover: 'hover:border-rose-200', inputCls: 'placeholder:text-rose-300/70', variant: 'rose' as CBVariant };
    const inputVal = isWork ? workInput : personalInput;
    const setInputVal = isWork ? setWorkInput : setPersonalInput;
    return (
      <div onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, undefined, category)} className="flex flex-col h-full">
        <div className="mb-3 flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${a.dot}`} /><span className={`text-xs font-bold uppercase tracking-wide ${a.label}`}>{isWork ? 'Work' : 'Personal'}</span></div>
        <GlassCard className={`flex-1 !border-opacity-60 !shadow-sm flex flex-col min-h-[300px] !p-4 ${a.card}`}>
          <div className="space-y-1 flex-1">
            {getTodos(category).map(todo => (
              <div key={todo.id} draggable={!isReadOnly} onDragStart={e => handleDragStart(e, todo.id)} onDragOver={handleDragOver} onDrop={e => handleDrop(e, todo.id)} onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); changeIndent(todo.id, e.shiftKey ? -1 : 1); } }} className={`group flex items-start gap-3 p-3 rounded-xl bg-white border border-transparent ${a.hover} transition-all duration-200 shadow-sm relative ${draggedTodoId === todo.id ? 'opacity-40' : ''}`} style={{ marginLeft: `${(todo.indentLevel || 0) * 20}px` }}>
                <div className="mt-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-1"><GripVertical size={14} /></div>
                <div className="mt-0.5"><Checkbox checked={todo.completed} onChange={() => toggleTodo(todo.id)} disabled={isReadOnly} variant={a.variant} /></div>
                <AutoResizeTextarea value={todo.text} onChange={e => updateTodoText(todo.id, e.target.value)} disabled={isReadOnly} className={`flex-1 bg-transparent border-none outline-none text-sm pt-[2px] font-medium transition-all ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`} />
                {!isReadOnly && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity bg-slate-50 rounded-lg p-0.5 absolute right-2 top-2">
                    {(todo.indentLevel || 0) < 2 && <button onClick={() => addSubtask(todo.id)} className="p-1 text-slate-400 hover:text-rose-600 flex items-center gap-1 text-[10px] font-bold"><Plus size={10} /> Sub</button>}
                    <div className="w-px h-3 bg-slate-200 mx-1" />
                    <button onClick={() => changeIndent(todo.id, 1)} className="p-1 text-slate-400 hover:text-slate-900"><CornerDownRight size={12} /></button>
                    <button onClick={() => deleteTodo(todo.id)} className="p-1 text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <div className={`mt-2 group flex items-center gap-3 p-3 rounded-xl hover:bg-white/50 border border-transparent ${a.plusHover} transition-all`}>
                <Plus size={16} className={a.plus} />
                <input className={`flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-900 ${a.inputCls}`} placeholder="New task..." value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTodo(category)} />
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isAuthLoading) return <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center"><Loader2 size={32} className="text-slate-400 animate-spin" /></div>;

  if (!user) return (
    <div className="min-h-screen relative flex items-center justify-center bg-[#F8FAFC] overflow-hidden text-slate-900">
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-gradient-to-br from-indigo-200 via-purple-200 to-cyan-200 opacity-60 rounded-full blur-[100px] animate-pulse mix-blend-multiply" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-gradient-to-tl from-rose-200 via-orange-200 to-amber-200 opacity-60 rounded-full blur-[100px] mix-blend-multiply" />
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white/90 backdrop-blur-2xl border border-white/50 shadow-[0_20px_60px_rgba(0,0,0,0.08)] rounded-3xl p-10 text-center">
          <div className="flex justify-center mb-6"><FocusLogo className="text-slate-900 w-16 h-16" /></div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">Listo</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-8">Your daily focus companion</p>
          <p className="text-slate-600 mb-8 text-base leading-relaxed">Your daily app for <span className="text-slate-900 font-bold">To-Dos, Focus and Clarity</span>.<br />No clutter. No distractions.</p>
          <button onClick={handleLogin} className="w-full bg-gradient-to-br from-slate-800 to-black text-white py-4 rounded-xl font-bold text-base hover:from-slate-700 hover:to-slate-900 transition-all shadow-lg flex items-center justify-center gap-3 mb-4 active:scale-[0.98]">Sign in with Google</button>
          <div className="flex items-center gap-4 my-6"><div className="h-px bg-slate-200 flex-1" /><span className="text-slate-400 text-[10px] font-bold">OR</span><div className="h-px bg-slate-200 flex-1" /></div>
          <button onClick={handleGuestLogin} className="w-full bg-purple-50 text-purple-600 border border-purple-200 py-3 rounded-xl font-bold text-sm hover:bg-purple-100 hover:border-purple-300 transition-all uppercase tracking-wide">Try Demo — no login needed</button>
        </div>
        {authErrorDomain && (
          <div className="mt-6 p-5 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <div className="text-left">
                <h3 className="text-red-800 font-bold text-sm mb-1">Preview Domain Blocked</h3>
                <p className="text-red-600 text-xs mb-3">Add this domain to Firebase Auth › Authorized Domains:</p>
                <div className="bg-white p-2 rounded text-xs font-mono flex items-center justify-between border border-red-100">
                  <span className="truncate">{authErrorDomain}</span>
                  <button onClick={() => navigator.clipboard.writeText(authErrorDomain)} className="ml-2 hover:text-red-600"><Copy size={12} /></button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-[#F2F4F7] font-sans text-slate-900 relative selection:bg-indigo-200 selection:text-indigo-900 pb-32">
      {showRocket && <RocketOverlay onComplete={() => setShowRocket(false)} />}
      {viewMode === ViewMode.DAY && todayData && <ProgressFloater progress={calcProgress()} />}

      <div className={`fixed top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-gradient-to-br ${themeColors.top} rounded-full blur-[120px] pointer-events-none mix-blend-multiply opacity-50 transition-all duration-1000`} />
      <div className={`fixed bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-gradient-to-tl ${themeColors.bottom} rounded-full blur-[120px] pointer-events-none mix-blend-multiply opacity-50 transition-all duration-1000`} />

      {/* Cloud sync indicator */}
      <div className="fixed top-6 right-6 z-[60] flex items-center gap-2 bg-white/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/50 shadow-sm hover:bg-white/80 transition-all">
        {isSaving ? <><Loader2 size={14} className="animate-spin text-indigo-500" /><span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Saving</span></> : <><Check size={14} className="text-emerald-500" /><span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{(user as GuestUser)?.uid === 'guest' ? 'Local' : 'Cloud'} Saved</span></>}
      </div>

      <main className="transition-all duration-500 lg:pl-72 min-h-screen">
        {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="fixed top-6 left-6 lg:hidden p-3 bg-white/80 shadow-sm border border-slate-100 rounded-xl text-slate-700 z-50"><Menu size={20} /></button>}

        {/* Sidebar */}
        <aside className={`fixed top-0 left-0 h-full w-80 lg:w-72 bg-white/80 backdrop-blur-2xl border-r border-slate-200/60 z-50 transform transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 shadow-2xl lg:shadow-none flex flex-col`}>
          <div className="p-8 h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2"><FocusLogo className="text-slate-900 w-8 h-8" /><h2 className="text-xl font-bold text-slate-900 tracking-tight">Listo</h2></div>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 relative pl-4 pb-4">
              <div className="absolute left-[27px] top-2 bottom-0 w-[2px] bg-slate-200/80 -z-10" />
              {timelineItems.map(item => {
                const isActive = isSameDay(currentDate, parseISO(item.id));
                const progress = item.data ? calcProgress(item.data) : 0;
                const showClose = isSameDay(parseISO(item.id), subDays(new Date(), 1)) && item.data && !item.data.isReflectionSubmitted;
                return (
                  <div key={item.id} className="relative mb-6 group">
                    <button onClick={() => { setCurrentDate(parseISO(item.id)); setViewMode(ViewMode.DAY); setIsSidebarOpen(false); }} className="flex items-start gap-5 w-full text-left">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 transition-all duration-300 border-[3px] ${isActive ? 'bg-indigo-600 scale-110 shadow-lg ring-2 ring-indigo-200 border-[#F2F4F7]' : item.isFuture ? 'bg-[#F2F4F7] border-slate-400 border-dashed' : 'bg-white border-slate-200'}`}>
                        {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <div className="pt-0.5 flex-1">
                        <div className={`font-bold text-sm ${isActive ? 'text-indigo-900' : item.isFuture ? 'text-slate-400 group-hover:text-emerald-600' : 'text-slate-600'}`}>
                          {item.label || format(item.date, 'EEE, MMM d')}
                        </div>
                        {!item.isFuture && item.data && !showClose && <div className="flex items-center gap-2 mt-1"><div className={`w-2 h-2 rounded-full ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} /><span className="text-[10px] font-bold text-slate-400">{progress}%</span></div>}
                        {item.isFuture && <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Future</div>}
                      </div>
                    </button>
                    {showClose && (
                      <button onClick={e => { e.stopPropagation(); if (item.data) { setMorningReviewData(item.data); setShowMorningReview(true); setIsSidebarOpen(false); } }} className="ml-11 mt-2 text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1 animate-pulse">
                        <PlayCircle size={10} /> Close day
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="my-6 pt-4 border-t border-slate-100 flex items-center gap-4 text-slate-400">
                <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full"><History size={14} /></div>
                <span className="text-xs font-bold uppercase tracking-widest">History ({history.length} days)</span>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100">
              <button onClick={handleLogout} className="flex items-center gap-3 text-slate-500 hover:text-rose-600 transition-colors w-full px-2 py-2 rounded-xl hover:bg-rose-50"><LogOut size={18} /><span className="text-sm font-bold">Sign out</span></button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="max-w-5xl mx-auto p-6 md:p-12 relative">
          {/* View switcher */}
          <div className="flex items-center justify-center mb-8">
            <div className="bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/60 shadow-sm flex gap-1">
              {([ViewMode.DAY, ViewMode.MONTH, ViewMode.YEAR] as const).map(v => (
                <button key={v} onClick={() => setViewMode(v)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === v ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
                  {v === ViewMode.DAY ? 'Day' : v === ViewMode.MONTH ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
          </div>

          {/* Day header */}
          {viewMode === ViewMode.DAY && (
            <div className="mb-4 text-center">
              <div className="inline-block px-4 py-1 rounded-full bg-white/40 backdrop-blur border border-white/50 text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 shadow-sm">{getRelativeLabel(currentDate) || format(currentDate, 'EEEE')}</div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{format(currentDate, 'MMMM d, yyyy')}</h2>
            </div>
          )}

          {/* ── Month view ── */}
          {viewMode === ViewMode.MONTH && monthlyPlan && (
            <div className="space-y-8">
              <div className="text-center mb-8"><h2 className="text-3xl font-bold text-slate-900">{monthlyPlan.title}</h2><p className="text-slate-500 font-medium mt-2">Monthly Planning</p></div>
              <section className="bg-[#FEFCF5] border border-amber-100 shadow-sm rounded-xl p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-amber-200" />
                <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-4">Theme of the month</h3>
                <textarea value={monthlyPlan.oneThing} onChange={e => updateMonthlyPlan({ oneThing: e.target.value })} className="w-full bg-transparent text-2xl font-bold text-slate-800 placeholder:text-slate-300 outline-none resize-none leading-relaxed" placeholder="What is the focus for this month?" rows={2} />
              </section>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 min-h-[400px] flex flex-col">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><LayoutGrid size={14} /> Weekly Milestones</h3>
                  <div className="space-y-4 flex-1">
                    {monthlyPlan.supportingGoals.map(goal => (
                      <div key={goal.id} className="flex items-start gap-3 group">
                        <Checkbox checked={goal.completed} onChange={() => toggleMilestone(goal.id)} variant="indigo" />
                        <input value={goal.text} onChange={e => updateMilestoneText(goal.id, e.target.value)} className={`flex-1 bg-transparent border-b border-transparent focus:border-slate-200 outline-none text-sm pb-1 ${goal.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`} />
                        <button onClick={() => deleteMilestone(goal.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button onClick={addMilestone} className="flex items-center gap-2 text-sm text-indigo-500 font-bold mt-4 hover:text-indigo-700"><Plus size={16} /> Add milestone</button>
                  </div>
                </section>
                <section className="bg-[#fffdf8] border border-slate-200 shadow-sm rounded-xl p-6 relative min-h-[400px]">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Brain dump / Notes</h3>
                  <textarea value={monthlyPlan.notes} onChange={e => updateMonthlyPlan({ notes: e.target.value })} className="w-full h-full bg-transparent resize-none outline-none text-sm leading-8 text-slate-600 placeholder:text-slate-300 pt-1 min-h-[300px]" placeholder="Thoughts, ideas, appointments..." />
                </section>
              </div>
            </div>
          )}

          {/* ── Year view ── */}
          {viewMode === ViewMode.YEAR && yearlyPlan && (
            <div className="space-y-8">
              <div className="text-center mb-8"><h2 className="text-4xl font-black text-slate-900 tracking-tight">{yearlyPlan.title}</h2><p className="text-slate-500 font-medium mt-2">Year Overview</p></div>
              <section className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-xl rounded-2xl p-10 text-center">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Year motto</h3>
                <input value={yearlyPlan.oneThing} onChange={e => updateYearlyPlan({ oneThing: e.target.value })} className="w-full bg-transparent text-center text-3xl md:text-5xl font-bold text-white placeholder:text-slate-600 outline-none" placeholder="Your year motto" />
              </section>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(['q1', 'q2', 'q3', 'q4'] as const).map((q, idx) => (
                  <div key={q} className="bg-white border border-slate-200 p-6 rounded-xl hover:shadow-md transition-shadow">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center justify-between"><span>Q{idx + 1}</span><span className="text-xs font-normal text-slate-400 uppercase tracking-widest">{['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec'][idx]}</span></h3>
                    <textarea value={yearlyPlan.quarters?.[q] || ''} onChange={e => updateYearlyPlan({ quarters: { ...yearlyPlan.quarters, [q]: e.target.value } as LongTermPlan['quarters'] })} className="w-full h-32 bg-slate-50/50 p-4 rounded-lg resize-none outline-none text-sm text-slate-700 focus:bg-white focus:ring-1 focus:ring-slate-200 transition-all" placeholder={`Focus for Q${idx + 1}...`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Day view ── */}
          {viewMode === ViewMode.DAY && todayData && (
            <div className="space-y-8">
              {/* One Thing */}
              <section>
                <GlassCard className="!p-10 !border-white/70 bg-white/60">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Sparkles size={14} className="text-amber-500" /> The One Thing</label>
                      {isReadOnly
                        ? <div className={`text-2xl md:text-4xl font-bold leading-snug ${todayData.focusCompleted ? 'text-emerald-600 line-through decoration-4 decoration-emerald-200' : 'text-slate-900'}`}>{todayData.focus || <span className="text-slate-300 font-normal">What is the ONE thing that matters today?</span>}</div>
                        : <textarea placeholder="What is the ONE thing that matters today?" value={todayData.focus} onChange={e => updateTodayData({ focus: e.target.value })} className={`w-full bg-transparent text-2xl md:text-4xl font-bold placeholder:text-slate-300 outline-none border-none p-0 focus:ring-0 leading-snug resize-none ${todayData.focusCompleted ? 'text-emerald-600 line-through decoration-4 decoration-emerald-200' : 'text-slate-900'}`} rows={2} />
                      }
                    </div>
                    <button onClick={toggleFocusComplete} className={`shrink-0 w-16 h-16 md:w-20 md:h-20 border rounded-3xl shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 ${todayData.focusCompleted ? 'bg-emerald-500 border-emerald-400' : 'bg-white border-slate-100 hover:shadow-xl hover:border-emerald-200'}`}>
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-[3px] flex items-center justify-center transition-colors ${todayData.focusCompleted ? 'border-white' : 'border-slate-200'}`}>
                        <Check size={24} className={`transition-all duration-300 ${todayData.focusCompleted ? 'text-white opacity-100 scale-100' : 'text-emerald-500 opacity-0 scale-50'}`} strokeWidth={4} />
                      </div>
                    </button>
                  </div>
                </GlassCard>
              </section>

              {/* Tasks */}
              <section>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tasks</h2>
                  <div className="flex gap-2">
                    {(['all', 'open', 'done'] as const).map(f => (
                      <button key={f} onClick={() => setTodoFilter(f)} className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full border transition-all ${todoFilter === f ? 'bg-white border-slate-300 text-slate-900 shadow-sm' : 'bg-transparent border-transparent text-slate-400 hover:bg-white/50'}`}>{f}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {renderTodoCard('work')}
                  {renderTodoCard('personal')}
                </div>
              </section>

              {/* Habits + Mindpad */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-6 px-2">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Habits</h2>
                    {!isReadOnly && (
                      <button onClick={() => setIsEditingHabits(!isEditingHabits)} className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${isEditingHabits ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:text-slate-900 shadow-sm'}`}>
                        {isEditingHabits ? <><Save size={12} /> Done</> : <><Edit2 size={12} /> Edit</>}
                      </button>
                    )}
                  </div>
                  <GlassCard className="flex-1 !p-6 flex flex-col justify-center min-h-[320px]">
                    <div className="space-y-4">
                      {todayData.habits.map(habit => (
                        <div key={habit.id} className="flex items-center gap-4">
                          {isEditingHabits ? <button onClick={() => deleteHabit(habit.id)} className="w-5 h-5 flex items-center justify-center rounded bg-rose-50 text-rose-500 hover:bg-rose-100"><Trash2 size={12} /></button> : <Checkbox checked={habit.completed} onChange={() => toggleHabit(habit.id)} disabled={isReadOnly} variant="sage" />}
                          {isEditingHabits ? <input value={habit.text} onChange={e => updateHabitText(habit.id, e.target.value)} className="flex-1 bg-slate-50 px-3 py-1.5 rounded-md text-sm border border-slate-200 outline-none" /> : <span className={`text-sm font-medium transition-colors ${habit.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{habit.text}</span>}
                        </div>
                      ))}
                      {isEditingHabits && <button onClick={addHabit} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-slate-900 mt-4 px-2"><Plus size={14} /> New habit</button>}
                    </div>
                  </GlassCard>
                </section>

                <section className="flex flex-col h-full">
                  <div className="mb-6 px-2"><h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Mindpad</h2></div>
                  <GlassCard className="flex-1 !p-0 overflow-hidden flex flex-col relative !bg-[#fffdf8] !border-amber-100/50 min-h-[320px]">
                    <div className="absolute top-0 left-0 w-full h-1 bg-amber-200/40" />
                    <textarea value={todayData.notes} onChange={e => updateTodayData({ notes: e.target.value })} disabled={isReadOnly} placeholder="Quick notes..." className="w-full h-full p-6 bg-transparent resize-none border-none outline-none text-slate-700 placeholder:text-slate-300 text-sm leading-relaxed" />
                  </GlassCard>
                </section>
              </div>

              {/* Quote */}
              <section>
                <button onClick={() => setIsQuoteOpen(!isQuoteOpen)} className="w-full flex items-center justify-between px-6 py-4 bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl shadow-sm hover:bg-white/80 hover:shadow-md transition-all group">
                  <div className="flex items-center gap-3"><div className="bg-amber-100 p-2 rounded-lg text-amber-600 group-hover:scale-110 transition-transform"><BookOpen size={18} /></div><span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Quote of the Day</span></div>
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider group-hover:text-indigo-500 transition-colors"><span>{isQuoteOpen ? 'Collapse' : 'Show'}</span><ChevronDown size={18} className={`transition-transform duration-300 ${isQuoteOpen ? 'rotate-180' : ''}`} /></div>
                </button>
                {isQuoteOpen && (
                  <div className="mt-4">
                    <GlassCard className="!bg-white/40 !border-white/60 !shadow-sm">
                      {todayData.quote ? (
                        <div className="flex flex-col md:flex-row gap-8">
                          <div className="flex-1">
                            <blockquote className="text-xl text-slate-900 mb-4 leading-relaxed font-medium">"{todayData.quote.text}"</blockquote>
                            <div className="flex items-center gap-2 mb-6"><span className="h-px w-8 bg-slate-300" /><span className="text-xs font-bold uppercase tracking-widest text-slate-500">{todayData.quote.author}</span></div>
                            <div className="bg-white/50 rounded-xl p-4 border border-white/50 text-sm text-slate-600 leading-relaxed"><strong className="text-slate-900 block mb-1 text-xs uppercase tracking-wide">Takeaway:</strong>{todayData.quote.explanation}</div>
                          </div>
                          <div className="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-slate-200/50 pt-6 md:pt-0 md:pl-8 flex flex-col">
                            {!isChatOpen ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-4 opacity-60 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => setIsChatOpen(true)}>
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><MessageCircle size={20} className="text-slate-400" /></div>
                                <p className="text-xs font-bold text-slate-500 max-w-[150px]">Chat with your coach about this</p>
                              </div>
                            ) : (
                              <div className="flex flex-col h-[300px]">
                                <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-3">
                                  {chatHistory.map((msg, i) => <div key={i} className={`p-3 rounded-xl text-xs leading-relaxed ${msg.sender === 'user' ? 'bg-slate-100 text-slate-700 ml-8' : 'bg-slate-900 text-slate-100 mr-8'}`}>{msg.text}</div>)}
                                  {isChatLoading && <div className="flex gap-1 justify-center py-2"><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" /><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '75ms' }} /><div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /></div>}
                                </div>
                                <div className="flex gap-2 relative">
                                  <input className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-slate-400" placeholder="How do I apply this today?" value={chatMessage} onChange={e => setChatMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                                  <button onClick={handleSendMessage} disabled={!chatMessage.trim() || isChatLoading} className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"><Send size={14} /></button>
                                  <button onClick={() => setIsChatOpen(false)} className="absolute -top-10 right-0 p-1 text-slate-300 hover:text-slate-500"><X size={14} /></button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : <div className="text-center py-8 text-slate-400 italic text-sm">Loading quote...</div>}
                    </GlassCard>
                  </div>
                )}
              </section>

              {/* Completed reflection */}
              {todayData.isReflectionSubmitted && todayData.aiRating && (
                <div className="mt-16 mb-20">
                  <div className="flex flex-col items-center text-center mb-8"><h2 className="text-2xl font-bold text-slate-900 mb-2">Day Summary</h2><p className="text-slate-500 text-sm">{todayData.date}</p></div>
                  <GlassCard className="!border-t-4 !border-t-slate-900 overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-10 items-center">
                      <div className="flex flex-col items-center gap-4 shrink-0">
                        <div className={`w-32 h-32 rounded-full flex items-center justify-center ${getTrafficLight(todayData.aiRating.color)}`}><span className="text-4xl">{todayData.aiRating.color === 'green' ? '🌿' : todayData.aiRating.color === 'yellow' ? '⚖️' : '🔥'}</span></div>
                      </div>
                      <div className="flex-1 text-left space-y-6">
                        <div><h3 className="font-bold text-slate-900 mb-2">Feedback</h3><p className="text-slate-600 text-sm leading-relaxed">{todayData.aiRating.feedback}</p></div>
                        <div><h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Sparkles size={14} className="text-amber-500" /> Tip for Tomorrow</h3><p className="text-slate-600 text-sm leading-relaxed bg-amber-50/50 p-4 rounded-xl border border-amber-100/50">{todayData.aiRating.suggestion}</p></div>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              )}
            </div>
          )}

          {isLoadingData && <div className="flex items-center justify-center py-20"><Loader2 size={28} className="text-slate-300 animate-spin" /></div>}
        </div>

        {/* Reflection sticky button */}
        {viewMode === ViewMode.DAY && todayData && !todayData.isReflectionSubmitted && isToday && (
          <div className="fixed bottom-0 left-0 lg:left-72 right-0 p-6 bg-gradient-to-t from-[#F2F4F7] via-[#F2F4F7]/90 to-transparent z-40 flex justify-center pointer-events-none pb-8">
            <ButtonPrimary onClick={startReflection} className="pointer-events-auto shadow-2xl hover:scale-105"><Moon size={18} /> Close day & reflect</ButtonPrimary>
          </div>
        )}
      </main>

      {/* Morning review modal */}
      {showMorningReview && morningReviewData && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-8">
              <div className="text-center mb-6"><div className="inline-block p-3 bg-amber-100 text-amber-600 rounded-full mb-4"><CalendarDays size={24} /></div><h2 className="text-2xl font-bold text-slate-900">Good morning!</h2><p className="text-slate-500 text-sm mt-2">You didn't close yesterday's day yet.</p></div>
              <div className="bg-slate-50 rounded-xl p-6 mb-6 border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Yesterday</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Daily focus achieved?</span>{morningReviewData.focusCompleted ? <span className="text-emerald-600 font-bold flex items-center gap-1"><Check size={14} /> Yes</span> : <span className="text-slate-400 font-bold">No</span>}</div>
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Open tasks</span><span className="font-bold text-slate-900">{morningReviewData.todos.filter(t => !t.completed).length}</span></div>
                </div>
              </div>
              {morningReviewData.todos.filter(t => !t.completed).length > 0 ? (
                <div><p className="text-center text-sm font-bold text-slate-700 mb-4">What do you want to do with the {morningReviewData.todos.filter(t => !t.completed).length} open tasks?</p><div className="grid grid-cols-2 gap-3"><button onClick={() => handleMorningReviewAction('move')} className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm transition-colors">Move to today</button><button onClick={() => handleMorningReviewAction('discard')} className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 font-bold text-sm transition-colors">Leave as is</button></div></div>
              ) : (
                <ButtonPrimary onClick={() => handleMorningReviewAction('discard')} className="w-full">Let's go!</ButtonPrimary>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reflection modal */}
      {reflectionStep !== 'intro' && reflectionStep !== 'rating' && !todayData?.isReflectionSubmitted && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            {reflectionStep === 'open-todos' && (
              <div className="p-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">Day closing</h2>
                <p className="text-slate-500 text-center mb-6 text-sm">You still have open tasks. What do you want to do?</p>
                <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2 max-h-[200px] overflow-y-auto">
                  {todayData?.todos.filter(t => !t.completed).map(t => <div key={t.id} className="flex items-center gap-3 text-sm text-slate-700 bg-white p-2 rounded border border-slate-100"><div className="w-1.5 h-1.5 rounded-full bg-slate-400" />{t.text}</div>)}
                </div>
                <div className="space-y-3">
                  <ButtonPrimary onClick={handleMoveTodosToTomorrow} className="w-full">Move all to tomorrow</ButtonPrimary>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setReflectionStep('quick-win')} className="py-3 rounded-xl border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-bold text-sm">Quick win now</button>
                    <button onClick={handleDiscardOpenTodos} className="py-3 rounded-xl border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 font-bold text-sm">Discard them</button>
                  </div>
                </div>
              </div>
            )}
            {reflectionStep === 'quick-win' && (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚡️</div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">5-minute challenge</h2>
                <p className="text-slate-600 mb-6 text-sm">Can you knock out one of these tasks right now in under 5 minutes?</p>
                <ButtonPrimary onClick={() => setReflectionStep('intro')} className="w-full">On it!</ButtonPrimary>
                <button onClick={handleMoveTodosToTomorrow} className="mt-4 text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-wider">Move to tomorrow instead</button>
              </div>
            )}
            {reflectionStep === 'form' && (
              <div className="p-8">
                <div className="text-center mb-6"><h2 className="text-xl font-bold text-slate-900">Reflection</h2><p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{todayData?.date}</p></div>
                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Did you achieve your One Thing?</label>
                    <div className="flex gap-2">
                      <button onClick={() => setTempReflection({ ...tempReflection, focusAchieved: true })} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all border ${tempReflection.focusAchieved === true ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Yes!</button>
                      <button onClick={() => setTempReflection({ ...tempReflection, focusAchieved: false })} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all border ${tempReflection.focusAchieved === false ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Not quite</button>
                    </div>
                  </div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Your biggest win today?</label><textarea value={tempReflection.biggestWin || ''} onChange={e => setTempReflection({ ...tempReflection, biggestWin: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:border-slate-400 outline-none h-20 resize-none" placeholder="What went really well?" /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">What will you do better tomorrow?</label><textarea value={tempReflection.betterTomorrow || ''} onChange={e => setTempReflection({ ...tempReflection, betterTomorrow: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:border-slate-400 outline-none h-20 resize-none" placeholder="One concrete intention..." /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">How do you rate the day?</label><div className="flex gap-2 justify-center">{(['strong', 'okay', 'difficult'] as const).map(r => <button key={r} onClick={() => setTempReflection({ ...tempReflection, selfRating: r })} className={`px-4 py-2 rounded-full border text-2xl transition-all ${tempReflection.selfRating === r ? 'bg-slate-100 border-slate-300 scale-110' : 'bg-transparent border-transparent grayscale opacity-50 hover:opacity-100 hover:grayscale-0'}`}>{r === 'strong' ? '😊' : r === 'okay' ? '😐' : '😞'}</button>)}</div></div>
                </div>
                <div className="mt-8"><ButtonPrimary onClick={handleReflectionSubmit} disabled={isGeneratingRating || !tempReflection.selfRating} className="w-full">{isGeneratingRating ? <><Loader2 className="animate-spin" size={18} /> Analyzing day...</> : 'Save & close day'}</ButtonPrimary></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
