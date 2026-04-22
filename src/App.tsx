import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2, Trash2, X, Menu, Plus,
  Sparkles, Edit2, Save, Moon, Check, Loader2, LogOut,
  GripVertical, CornerDownRight, LayoutGrid, CalendarDays,
  PlayCircle, AlertTriangle, Copy,
} from 'lucide-react';
import { type DayData, type Todo, type ReflectionData, type Habit, ViewMode, type LongTermPlan, type PlanItem } from './types';
import { INITIAL_HABITS } from './constants';
import { generateDayRating } from './services/geminiService';
import { format, isSameDay, parseISO, addDays, subDays } from 'date-fns';
import { auth, googleProvider } from './firebaseConfig';
import { signInWithPopup, signOut, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  saveDayToCloud, getDayFromCloud, getHistoryFromCloud,
  savePlanToCloud, getPlanFromCloud,
} from './services/firestoreService';

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

const RichTextEditor: React.FC<{
  value: string;
  onChange: (html: string) => void;
  onIndent?: (increase: boolean) => void;
  onEnterKey?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, onIndent, onEnterKey, onDelete, disabled, className = '', placeholder, autoFocus }) => {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const lastHtml = useRef(value);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focused.current && ref.current && value !== lastHtml.current) {
      ref.current.innerHTML = value || '';
      lastHtml.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Backspace') {
      const text = ref.current?.textContent || '';
      if (!text.trim() && onDelete) {
        e.preventDefault();
        onDelete();
        return;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      onIndent?.(!e.shiftKey);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && onEnterKey) {
      e.preventDefault();
      onEnterKey();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
      if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); }
    }
  };

  const handleInput = () => {
    const html = ref.current?.innerHTML || '';
    lastHtml.current = html;
    onChange(html);
  };

  return (
    <div
      ref={ref}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={`outline-none rich-text min-h-[1.2em] ${className}`}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; handleInput(); }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
    />
  );
};

// ─── Micro-components ─────────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white border border-gray-100 rounded-xl p-8 ${className}`}>
    {children}
  </div>
);

const ButtonPrimary: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', ...props }) => (
  <button className={`bg-slate-900 text-white px-8 py-4 rounded-xl font-bold tracking-tight transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${className}`} {...props}>
    {children}
  </button>
);

type CBVariant = 'slate' | 'rose' | 'sage' | 'indigo';
const Checkbox: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; variant?: CBVariant }> = ({ checked, onChange, disabled, variant = 'slate' }) => {
  const colors: Record<CBVariant, string> = {
    rose: checked ? 'bg-rose-500 border-rose-500' : 'border-slate-300 hover:border-rose-400 bg-white',
    indigo: checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 hover:border-indigo-400 bg-white',
    sage: checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400 bg-white',
    slate: checked ? 'bg-slate-900 border-slate-900' : 'border-slate-300 hover:border-slate-500 bg-white',
  };
  return (
    <button onClick={onChange} disabled={disabled} className={`shrink-0 w-5 h-5 rounded-[6px] border-[2px] flex items-center justify-center transition-all duration-200 ${colors[variant]} ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}>
      <CheckCircle2 size={14} className={`text-white transition-all duration-200 ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} strokeWidth={4} />
    </button>
  );
};

const FocusLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
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
      <div className="absolute bottom-[-100px] left-[10%] animate-rocket"><div className="text-[100px] transform rotate-45">🚀</div></div>
    </div>
  );
};

const ProgressFloater: React.FC<{ progress: number }> = ({ progress }) => {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <div className="fixed bottom-6 left-6 z-[60] bg-white border border-gray-100 p-3 rounded-xl flex items-center gap-3 cursor-default group">
      <div className="relative w-12 h-12 flex items-center justify-center">
        <svg className="transform -rotate-90 w-12 h-12">
          <circle cx="24" cy="24" r={r} stroke="#f1f5f9" strokeWidth="4" fill="transparent" />
          <circle cx="24" cy="24" r={r} stroke="#0f172a" strokeWidth="4" fill="transparent" strokeDasharray={c} strokeDashoffset={c - (progress / 100) * c} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
        </svg>
        <span className="absolute text-[10px] font-bold text-slate-700">{Math.round(progress)}%</span>
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

  const [todoFilter, setTodoFilter] = useState<'all' | 'open' | 'done'>('all');
  const [workInput, setWorkInput] = useState('');
  const [personalInput, setPersonalInput] = useState('');
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<'work' | 'personal' | null>(null);
  const [focusNewTodoId, setFocusNewTodoId] = useState<string | null>(null);

  const [showRocket, setShowRocket] = useState(false);

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
        setTodayData({ id: dateStr, date: format(currentDate, 'EEEE, MMMM d, yyyy'), focus: '', focusCompleted: false, todos: [], habits, notes: '', reflection: null, aiRating: null, isReflectionSubmitted: false });
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
    const newId = Date.now().toString();
    updateTodayData({ todos: [...todayData.todos, { id: newId, text: input, completed: false, category: cat, indentLevel: 0 }] });
    cat === 'work' ? setWorkInput('') : setPersonalInput('');
    setFocusNewTodoId(newId);
  };

  const addTodoAfter = (afterId: string, category: 'work' | 'personal') => {
    if (!todayData) return;
    if (todayData.todos.length >= 20) { alert('Keep it simple. Max 20 tasks.'); return; }
    const idx = todayData.todos.findIndex(t => t.id === afterId);
    const parent = todayData.todos[idx];
    const newId = Date.now().toString();
    const newTodo: Todo = { id: newId, text: '', completed: false, category, indentLevel: parent?.indentLevel || 0 };
    const list = [...todayData.todos];
    list.splice(idx + 1, 0, newTodo);
    updateTodayData({ todos: list });
    setFocusNewTodoId(newId);
  };

  const addSubtask = (parentId: string) => {
    if (!todayData) return;
    const pIdx = todayData.todos.findIndex(t => t.id === parentId);
    if (pIdx < 0 || (todayData.todos[pIdx].indentLevel || 0) >= 2) return;
    const parent = todayData.todos[pIdx];
    const newId = Date.now().toString();
    const sub: Todo = { id: newId, text: '', completed: false, category: parent.category, indentLevel: (parent.indentLevel || 0) + 1 };
    const list = [...todayData.todos]; list.splice(pIdx + 1, 0, sub);
    updateTodayData({ todos: list });
    setFocusNewTodoId(newId);
  };

  const updateTodoText = (id: string, text: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t => t.id === id ? { ...t, text } : t) }); };
  const toggleTodo = (id: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t) }); };
  const deleteTodo = (id: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.filter(t => t.id !== id) }); };
  const changeIndent = (id: string, delta: number) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t => t.id === id ? { ...t, indentLevel: Math.max(0, Math.min(2, (t.indentLevel || 0) + delta)) } : t) }); };

  // ── Drag & Drop ──

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTodoId(id);
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, _targetId?: string, targetCat?: 'work' | 'personal') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (targetCat) setDragOverColumn(targetCat);
  };

  const handleDrop = (e: React.DragEvent, targetId?: string, targetCat?: 'work' | 'personal') => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTodoId || !todayData) return;
    if (targetCat) {
      updateTodayData({ todos: todayData.todos.map(t => t.id === draggedTodoId ? { ...t, category: targetCat, indentLevel: 0 } : t) });
      setDraggedTodoId(null);
      return;
    }
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

  const handleDragEnd = () => { setDraggedTodoId(null); setDragOverColumn(null); };

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
    await updateArbitraryDay({ ...morningReviewData, isReflectionSubmitted: true, aiRating: { color: 'yellow', score: 5, feedback: 'Day closed the next morning.', suggestion: 'Start fresh today!' } });
    setShowMorningReview(false);
  };

  const handleMoveTodosToTomorrow = async () => {
    if (!todayData || !user) return;
    const open = todayData.todos.filter(t => !t.completed);
    if (open.length === 0) { setReflectionStep('form'); return; }
    const tomorrow = addDays(currentDate, 1);
    const tId = format(tomorrow, 'yyyy-MM-dd');
    let tData = await getDayFromCloud(user.uid, tId);
    if (!tData) tData = { id: tId, date: format(tomorrow, 'EEEE, MMMM d, yyyy'), focus: '', focusCompleted: false, todos: [], habits: todayData.habits.map(h => ({ ...h, completed: false })), notes: '', reflection: null, aiRating: null, isReflectionSubmitted: false };
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
    const final = { ...withR, aiRating: aiRating || { color: 'yellow' as const, score: 5, feedback: 'Day saved.', suggestion: 'Tomorrow is a new day!' }, isReflectionSubmitted: true };
    setTodayData(final); await saveDayToCloud(user!.uid, final);
    setHistory(prev => prev.map(d => d.id === final.id ? final : d));
    setIsGeneratingRating(false); setReflectionStep('rating');
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
    if (color === 'green') return 'bg-emerald-500';
    if (color === 'yellow') return 'bg-amber-400';
    if (color === 'red') return 'bg-rose-500';
    return 'bg-slate-200';
  };

  const getTodos = (cat: 'work' | 'personal') => (todayData?.todos || []).filter(t => { if (t.category !== cat) return false; if (todoFilter === 'open') return !t.completed; if (todoFilter === 'done') return t.completed; return true; });

  const getRelativeLabel = (offset: number) => {
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Tomorrow';
    if (offset === -1) return 'Yesterday';
    if (offset === -2) return '2 days ago';
    if (offset === 2) return 'In 2 days';
    if (offset === 3) return 'In 3 days';
    return null;
  };

  const timelineItems = useMemo(() => {
    return [-2, -1, 0, 1, 2, 3].map(offset => {
      const date = offset === 0 ? new Date() : offset < 0 ? subDays(new Date(), Math.abs(offset)) : addDays(new Date(), offset);
      const id = format(date, 'yyyy-MM-dd');
      const data = history.find(d => d.id === id);
      const isPast = offset < 0;
      const isCurrentDay = offset === 0;
      const isFuture = offset > 0;
      return { id, date, offset, isPast, isCurrentDay, isFuture, data };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // ── Render TodoCard ────────────────────────────────────────────────────────

  const renderTodoCard = (category: 'work' | 'personal') => {
    const isWork = category === 'work';
    const a = isWork
      ? { dot: 'bg-indigo-500', label: 'text-slate-700', variant: 'indigo' as CBVariant }
      : { dot: 'bg-rose-400', label: 'text-slate-700', variant: 'rose' as CBVariant };
    const isDragTarget = dragOverColumn === category && draggedTodoId !== null;

    return (
      <div
        onDragOver={e => handleDragOver(e, undefined, category)}
        onDrop={e => handleDrop(e, undefined, category)}
        onDragLeave={() => setDragOverColumn(null)}
        className="flex flex-col h-full"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${a.dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wide ${a.label}`}>{isWork ? 'Work' : 'Personal'}</span>
        </div>
        <Card className={`flex-1 flex flex-col min-h-[300px] !p-3 transition-all ${isDragTarget ? 'drag-over-column' : ''}`}>
          <div className="space-y-1 flex-1">
            {getTodos(category).map(todo => (
              <div
                key={todo.id}
                draggable={!isReadOnly}
                onDragStart={e => handleDragStart(e, todo.id)}
                onDragOver={e => handleDragOver(e, todo.id)}
                onDrop={e => handleDrop(e, todo.id)}
                onDragEnd={handleDragEnd}
                className={`group flex items-start gap-2 p-2 rounded-lg border border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all duration-150 relative ${draggedTodoId === todo.id ? 'opacity-30 scale-95' : ''}`}
                style={{ marginLeft: `${(todo.indentLevel || 0) * 24}px` }}
              >
                {/* Drag handle */}
                {!isReadOnly && (
                  <div className="mt-0.5 cursor-grab active:cursor-grabbing text-slate-200 hover:text-slate-400 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <GripVertical size={14} />
                  </div>
                )}

                {/* Checkbox */}
                <div className="mt-0.5 shrink-0">
                  <Checkbox checked={todo.completed} onChange={() => toggleTodo(todo.id)} disabled={isReadOnly} variant={a.variant} />
                </div>

                {/* Text */}
                {isReadOnly ? (
                  <div
                    className={`flex-1 text-sm font-medium pt-[2px] rich-text ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                    dangerouslySetInnerHTML={{ __html: todo.text }}
                  />
                ) : (
                  <RichTextEditor
                    value={todo.text}
                    onChange={html => updateTodoText(todo.id, html)}
                    onIndent={inc => changeIndent(todo.id, inc ? 1 : -1)}
                    onEnterKey={() => addTodoAfter(todo.id, category)}
                    onDelete={() => deleteTodo(todo.id)}
                    autoFocus={focusNewTodoId === todo.id}
                    className={`flex-1 text-sm font-medium pt-[2px] ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                    placeholder="Task…"
                  />
                )}

                {/* Actions */}
                {!isReadOnly && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity absolute right-2 top-2 bg-white rounded-lg p-0.5 border border-gray-100">
                    {(todo.indentLevel || 0) < 2 && (
                      <button onClick={() => addSubtask(todo.id)} title="Add subtask" className="p-1 text-slate-400 hover:text-indigo-600"><Plus size={10} /></button>
                    )}
                    <button onClick={() => changeIndent(todo.id, 1)} title="Indent" className="p-1 text-slate-400 hover:text-slate-700"><CornerDownRight size={11} /></button>
                    <button onClick={() => deleteTodo(todo.id)} title="Delete" className="p-1 text-slate-400 hover:text-rose-500"><Trash2 size={11} /></button>
                  </div>
                )}
              </div>
            ))}

            {/* Add task input */}
            {!isReadOnly && (
              <div className="mt-1 flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                <Plus size={15} className="text-slate-300 shrink-0" />
                <input
                  className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-900 placeholder:text-slate-300"
                  placeholder="Add task…"
                  value={isWork ? workInput : personalInput}
                  onChange={e => isWork ? setWorkInput(e.target.value) : setPersonalInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTodo(category)}
                />
              </div>
            )}
          </div>

          {isDragTarget && (
            <div className="mt-2 py-2 rounded-xl border-2 border-dashed border-slate-300 text-center text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Drop here → {isWork ? 'Work' : 'Personal'}
            </div>
          )}
        </Card>
      </div>
    );
  };

  // ── Screens ────────────────────────────────────────────────────────────────

  if (isAuthLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <Loader2 size={28} className="text-slate-300 animate-spin" />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <div className="text-center mb-10">
          <FocusLogo className="text-slate-900 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Listo</h1>
          <p className="text-slate-400 text-xs mt-1">Your daily focus companion</p>
        </div>
        <div className="border border-gray-100 rounded-xl p-8 text-center">
          <p className="text-slate-500 mb-6 text-sm leading-relaxed">To-Dos, Focus and Clarity.<br />No clutter. No distractions.</p>
          <button onClick={handleLogin} className="w-full bg-slate-900 text-white py-3 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-all mb-3">
            Sign in with Google
          </button>
          <div className="flex items-center gap-3 my-4"><div className="h-px bg-gray-100 flex-1" /><span className="text-gray-300 text-[10px]">OR</span><div className="h-px bg-gray-100 flex-1" /></div>
          <button onClick={handleGuestLogin} className="w-full text-slate-500 border border-gray-100 py-2.5 rounded-lg font-medium text-sm hover:bg-gray-50 transition-all">
            Try Demo — no login needed
          </button>
        </div>
        {authErrorDomain && (
          <div className="mt-5 p-5 bg-red-50 border border-red-200 rounded-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
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

  // ── Main Layout ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-white font-sans text-slate-900 relative selection:bg-indigo-100 selection:text-indigo-900 pb-32">
      {showRocket && <RocketOverlay onComplete={() => setShowRocket(false)} />}
      {viewMode === ViewMode.DAY && todayData && <ProgressFloater progress={calcProgress()} />}

      {/* Cloud sync badge */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-gray-100">
        {isSaving
          ? <><Loader2 size={12} className="animate-spin text-slate-400" /><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saving…</span></>
          : <><Check size={12} className="text-emerald-500" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{(user as GuestUser)?.uid === 'guest' ? 'Local' : 'Cloud'}</span></>
        }
      </div>

      {/* Mobile sidebar toggle */}
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 right-4 lg:hidden p-2.5 bg-white border border-gray-100 rounded-lg text-slate-600 z-50">
          <Menu size={18} />
        </button>
      )}

      {/* ── RIGHT SIDEBAR ── */}
      <aside className={`fixed top-0 right-0 h-full w-72 bg-white border-l border-gray-100 z-50 transform transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 flex flex-col`}>
        <div className="p-6 h-full flex flex-col">

          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5">
              <FocusLogo className="text-slate-900" />
              <span className="text-base font-bold text-slate-900 tracking-tight">Listo</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><X size={16} /></button>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-1">Timeline</div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 pb-4">
            {timelineItems.map(item => {
              const isActive = isSameDay(currentDate, parseISO(item.id));
              const pct = item.data ? calcProgress(item.data) : null;
              const taskCount = item.data?.todos.length ?? 0;
              const doneCount = item.data?.todos.filter(t => t.completed).length ?? 0;
              const showClose = item.offset === -1 && item.data && !item.data.isReflectionSubmitted;

              const bgCls = isActive
                ? 'bg-slate-900 text-white'
                : item.isPast
                  ? 'text-slate-400 hover:bg-gray-50'
                  : 'text-slate-600 hover:bg-gray-50';

              const dateLabel = getRelativeLabel(item.offset) || format(item.date, 'EEE, MMM d');

              return (
                <div key={item.id}>
                  <button
                    onClick={() => { setCurrentDate(parseISO(item.id)); setViewMode(ViewMode.DAY); setIsSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${bgCls}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white' : 'bg-gray-200'}`} />
                    <div className="flex-1 text-left min-w-0">
                      <div className={`text-xs font-bold truncate`}>{dateLabel}</div>
                      {taskCount > 0 && (
                        <div className={`text-[10px] mt-0.5 ${isActive ? 'text-slate-400' : 'text-gray-400'}`}>
                          {doneCount}/{taskCount} tasks · {pct}%
                        </div>
                      )}
                      {taskCount === 0 && (
                        <div className={`text-[10px] mt-0.5 ${isActive ? 'text-slate-400' : 'text-gray-400'}`}>
                          {item.isFuture ? 'Plan ahead' : 'No tasks'}
                        </div>
                      )}
                    </div>
                    {pct !== null && taskCount > 0 && (
                      <div className={`shrink-0 text-[10px] font-medium ${isActive ? 'text-white/60' : 'text-gray-400'}`}>
                        {pct}%
                      </div>
                    )}
                  </button>

                  {showClose && (
                    <button
                      onClick={e => { e.stopPropagation(); if (item.data) { setMorningReviewData(item.data); setShowMorningReview(true); setIsSidebarOpen(false); } }}
                      className="ml-5 mt-1 mb-1 text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 px-2.5 py-1 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1"
                    >
                      <PlayCircle size={10} /> Close yesterday
                    </button>
                  )}
                </div>
              );
            })}

            <div className="mt-3 px-3 py-2">
              <div className="text-[10px] text-gray-300 leading-relaxed">
                Max planning horizon: 3 days. Use Month view for more.
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 space-y-3">
            <div className="flex gap-1">
              {([ViewMode.DAY, ViewMode.MONTH, ViewMode.YEAR] as const).map(v => (
                <button key={v} onClick={() => setViewMode(v)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === v ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-gray-50'}`}>
                  {v === ViewMode.DAY ? 'Day' : v === ViewMode.MONTH ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 text-gray-300 hover:text-rose-500 transition-colors w-full px-1 py-1 text-sm">
              <LogOut size={14} /><span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="lg:pr-72 min-h-screen">
        <div className="max-w-3xl mx-auto px-5 py-10 md:px-10 md:py-12">

          {viewMode === ViewMode.DAY && (
            <div className="mb-8">
              <p className="text-xs text-gray-400 mb-1">{getRelativeLabel(isSameDay(currentDate, new Date()) ? 0 : currentDate > new Date() ? 1 : -1) || format(currentDate, 'EEEE')}</p>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{format(currentDate, 'MMMM d, yyyy')}</h2>
            </div>
          )}

          {/* ── Month view ── */}
          {viewMode === ViewMode.MONTH && monthlyPlan && (
            <div className="space-y-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-slate-900">{monthlyPlan.title}</h2>
                <p className="text-slate-400 font-medium mt-2 text-sm">Monthly Planning</p>
              </div>
              <section className="bg-white border border-gray-100 rounded-xl p-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-slate-900" />
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Theme of the month</h3>
                <textarea value={monthlyPlan.oneThing} onChange={e => updateMonthlyPlan({ oneThing: e.target.value })} className="w-full bg-transparent text-2xl font-bold text-slate-800 placeholder:text-slate-300 outline-none resize-none leading-relaxed" placeholder="What is the focus for this month?" rows={2} />
              </section>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="bg-white border border-gray-100 rounded-xl p-6 min-h-[400px] flex flex-col">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><LayoutGrid size={14} /> Weekly Milestones</h3>
                  <div className="space-y-4 flex-1">
                    {monthlyPlan.supportingGoals.map(goal => (
                      <div key={goal.id} className="flex items-start gap-3 group">
                        <Checkbox checked={goal.completed} onChange={() => toggleMilestone(goal.id)} variant="indigo" />
                        <input value={goal.text} onChange={e => updateMilestoneText(goal.id, e.target.value)} className={`flex-1 bg-transparent border-b border-transparent focus:border-slate-200 outline-none text-sm pb-1 ${goal.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`} />
                        <button onClick={() => deleteMilestone(goal.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button onClick={addMilestone} className="flex items-center gap-2 text-sm text-slate-400 font-bold mt-4 hover:text-slate-900"><Plus size={16} /> Add milestone</button>
                  </div>
                </section>
                <section className="bg-white border border-gray-100 rounded-xl p-6 min-h-[400px]">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Brain dump / Notes</h3>
                  <textarea value={monthlyPlan.notes} onChange={e => updateMonthlyPlan({ notes: e.target.value })} className="w-full h-full bg-transparent resize-none outline-none text-sm leading-8 text-slate-600 placeholder:text-slate-300 pt-1 min-h-[300px]" placeholder="Thoughts, ideas, appointments..." />
                </section>
              </div>
            </div>
          )}

          {/* ── Year view ── */}
          {viewMode === ViewMode.YEAR && yearlyPlan && (
            <div className="space-y-8">
              <div className="text-center mb-8">
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">{yearlyPlan.title}</h2>
                <p className="text-slate-400 font-medium mt-2 text-sm">Year Overview</p>
              </div>
              <section className="bg-slate-900 text-white rounded-2xl p-10 text-center">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Year motto</h3>
                <input value={yearlyPlan.oneThing} onChange={e => updateYearlyPlan({ oneThing: e.target.value })} className="w-full bg-transparent text-center text-3xl md:text-5xl font-bold text-white placeholder:text-slate-600 outline-none" placeholder="Your year motto" />
              </section>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(['q1', 'q2', 'q3', 'q4'] as const).map((q, idx) => (
                  <div key={q} className="bg-white border border-gray-100 p-6 rounded-xl">
                    <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
                      <span>Q{idx + 1}</span>
                      <span className="text-xs font-normal text-slate-400 uppercase tracking-widest">{['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec'][idx]}</span>
                    </h3>
                    <textarea value={yearlyPlan.quarters?.[q] || ''} onChange={e => updateYearlyPlan({ quarters: { ...yearlyPlan.quarters, [q]: e.target.value } as LongTermPlan['quarters'] })} className="w-full h-32 bg-slate-50 p-4 rounded-xl resize-none outline-none text-sm text-slate-700 focus:bg-white focus:ring-1 focus:ring-slate-200 transition-all" placeholder={`Focus for Q${idx + 1}...`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Day view ── */}
          {viewMode === ViewMode.DAY && todayData && (
            <div className="space-y-6">

              {/* The One Thing */}
              <Card className="!p-8">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <Sparkles size={12} className="text-amber-500" /> The One Thing
                    </label>
                    {isReadOnly ? (
                      <div
                        className={`text-2xl md:text-3xl font-bold leading-snug rich-text ${todayData.focusCompleted ? 'text-emerald-600 line-through decoration-4 decoration-emerald-200' : 'text-slate-900'}`}
                        dangerouslySetInnerHTML={{ __html: todayData.focus || '<span class="text-slate-300 font-normal">What is the ONE thing that matters today?</span>' }}
                      />
                    ) : (
                      <RichTextEditor
                        value={todayData.focus}
                        onChange={html => updateTodayData({ focus: html })}
                        placeholder="What is the ONE thing that matters today?"
                        className={`text-2xl md:text-3xl font-bold leading-snug ${todayData.focusCompleted ? 'text-emerald-600 line-through decoration-4 decoration-emerald-200' : 'text-slate-900'}`}
                      />
                    )}
                  </div>
                  <button
                    onClick={toggleFocusComplete}
                    className={`shrink-0 w-14 h-14 md:w-16 md:h-16 border-2 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 ${todayData.focusCompleted ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-200 hover:border-emerald-300'}`}
                  >
                    <Check size={20} className={`transition-all duration-200 ${todayData.focusCompleted ? 'text-white' : 'text-slate-200'}`} strokeWidth={3} />
                  </button>
                </div>
              </Card>

              {/* Tasks */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tasks</h2>
                  <div className="flex gap-1.5">
                    {(['all', 'open', 'done'] as const).map(f => (
                      <button key={f} onClick={() => setTodoFilter(f)} className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border transition-all ${todoFilter === f ? 'bg-white border-slate-300 text-slate-900 shadow-sm' : 'bg-transparent border-transparent text-slate-400 hover:text-slate-600'}`}>{f}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderTodoCard('work')}
                  {renderTodoCard('personal')}
                </div>
                <p className="text-center text-[10px] text-slate-300 mt-2 font-medium">Enter = new item · Backspace empty = delete · Tab = indent · ⌘B/I/U</p>
              </div>

              {/* Habits + Mindpad */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Habits</h2>
                    {!isReadOnly && (
                      <button onClick={() => setIsEditingHabits(!isEditingHabits)} className={`text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 px-2.5 py-1 rounded-full transition-all ${isEditingHabits ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-900'}`}>
                        {isEditingHabits ? <><Save size={10} /> Done</> : <><Edit2 size={10} /> Edit</>}
                      </button>
                    )}
                  </div>
                  <Card className="flex-1 !p-5 min-h-[240px]">
                    <div className="space-y-3.5">
                      {todayData.habits.map(habit => (
                        <div key={habit.id} className="flex items-center gap-3">
                          {isEditingHabits
                            ? <button onClick={() => deleteHabit(habit.id)} className="w-4 h-4 flex items-center justify-center rounded bg-red-50 text-red-400 hover:bg-red-100 shrink-0"><Trash2 size={10} /></button>
                            : <Checkbox checked={habit.completed} onChange={() => toggleHabit(habit.id)} disabled={isReadOnly} variant="sage" />
                          }
                          {isEditingHabits
                            ? <input value={habit.text} onChange={e => updateHabitText(habit.id, e.target.value)} className="flex-1 bg-slate-50 px-2.5 py-1 rounded-lg text-sm border border-slate-200 outline-none" />
                            : <span className={`text-sm font-medium ${habit.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{habit.text}</span>
                          }
                        </div>
                      ))}
                      {isEditingHabits && <button onClick={addHabit} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-900 mt-3"><Plus size={13} /> New habit</button>}
                    </div>
                  </Card>
                </section>

                <section className="flex flex-col">
                  <div className="mb-3 px-1"><h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mindpad</h2></div>
                  <div className="flex-1 bg-white border border-gray-100 rounded-xl overflow-hidden flex flex-col min-h-[240px]">
                    <div className="h-0.5 bg-amber-300 shrink-0" />
                    <textarea value={todayData.notes} onChange={e => updateTodayData({ notes: e.target.value })} disabled={isReadOnly} placeholder="Quick notes…" className="flex-1 p-5 bg-transparent resize-none border-none outline-none text-slate-700 placeholder:text-slate-300 text-sm leading-relaxed" />
                  </div>
                </section>
              </div>

              {/* Completed reflection card */}
              {todayData.isReflectionSubmitted && todayData.aiRating && (
                <div className="mt-4">
                  <Card className={`!border-t-4 overflow-hidden ${todayData.aiRating.color === 'green' ? '!border-t-emerald-500' : todayData.aiRating.color === 'yellow' ? '!border-t-amber-400' : '!border-t-rose-500'}`}>
                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                      <div className="shrink-0 flex flex-col items-center gap-2">
                        <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center ${getTrafficLight(todayData.aiRating.color)}`}>
                          <span className="text-2xl font-black text-white">{todayData.aiRating.score}</span>
                          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">/10</span>
                        </div>
                        <span className="text-xs font-bold text-slate-500">{todayData.aiRating.color === 'green' ? '🌿 Solid' : todayData.aiRating.color === 'yellow' ? '⚖️ Mixed' : '🔥 Tough'}</span>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Feedback</h3>
                          <p className="text-sm text-slate-700 leading-relaxed">{todayData.aiRating.feedback}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                          <h3 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Sparkles size={10} /> Tomorrow</h3>
                          <p className="text-sm text-slate-700 leading-relaxed">{todayData.aiRating.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {isLoadingData && <div className="flex items-center justify-center py-20"><Loader2 size={28} className="text-slate-300 animate-spin" /></div>}
        </div>

        {/* Close day button */}
        {viewMode === ViewMode.DAY && todayData && !todayData.isReflectionSubmitted && isToday && (
          <div className="fixed bottom-0 left-0 lg:right-72 right-0 p-5 bg-white border-t border-gray-100 z-40 flex justify-center">
            <ButtonPrimary onClick={startReflection} className="!px-6 !py-3 !text-sm">
              <Moon size={16} /> Close day & reflect
            </ButtonPrimary>
          </div>
        )}
      </main>

      {/* ── Morning Review Modal ── */}
      {showMorningReview && morningReviewData && (
        <div className="fixed inset-0 z-[110] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md overflow-hidden border border-gray-100">
            <div className="p-7">
              <div className="text-center mb-5">
                <div className="inline-block p-3 bg-amber-100 text-amber-600 rounded-full mb-3"><CalendarDays size={22} /></div>
                <h2 className="text-xl font-bold text-slate-900">Good morning!</h2>
                <p className="text-slate-400 text-sm mt-1">Yesterday's day isn't closed yet.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100 space-y-2.5">
                <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Focus achieved?</span>{morningReviewData.focusCompleted ? <span className="text-emerald-600 font-bold flex items-center gap-1"><Check size={13} /> Yes</span> : <span className="text-slate-400 font-bold">No</span>}</div>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-600">Open tasks</span><span className="font-bold text-slate-900">{morningReviewData.todos.filter(t => !t.completed).length}</span></div>
              </div>
              {morningReviewData.todos.filter(t => !t.completed).length > 0 ? (
                <div>
                  <p className="text-center text-sm font-semibold text-slate-700 mb-3">What to do with {morningReviewData.todos.filter(t => !t.completed).length} open tasks?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => handleMorningReviewAction('move')} className="p-3.5 rounded-xl border border-slate-200 bg-slate-900 text-white font-bold text-sm transition-all hover:bg-slate-800">Move to today</button>
                    <button onClick={() => handleMorningReviewAction('discard')} className="p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 font-bold text-sm transition-colors">Leave as is</button>
                  </div>
                </div>
              ) : (
                <ButtonPrimary onClick={() => handleMorningReviewAction('discard')} className="w-full">Let's go!</ButtonPrimary>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reflection Modal ── */}
      {reflectionStep !== 'intro' && reflectionStep !== 'rating' && !todayData?.isReflectionSubmitted && (
        <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md overflow-hidden border border-gray-100">

            {reflectionStep === 'open-todos' && (
              <div className="p-7">
                <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">Wrapping up</h2>
                <p className="text-slate-400 text-center mb-5 text-sm">You have open tasks. What should happen to them?</p>
                <div className="bg-gray-50 rounded-xl p-3 mb-5 space-y-1.5 max-h-[180px] overflow-y-auto border border-gray-100">
                  {todayData?.todos.filter(t => !t.completed).map(t => (
                    <div key={t.id} className="flex items-center gap-2.5 text-sm text-slate-700 bg-white p-2 rounded-lg border border-slate-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                      <span className="rich-text" dangerouslySetInnerHTML={{ __html: t.text }} />
                    </div>
                  ))}
                </div>
                <div className="space-y-2.5">
                  <ButtonPrimary onClick={handleMoveTodosToTomorrow} className="w-full !py-3 !text-sm">Move all to tomorrow</ButtonPrimary>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button onClick={() => setReflectionStep('quick-win')} className="py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-bold text-sm">Quick win ⚡</button>
                    <button onClick={handleDiscardOpenTodos} className="py-2.5 rounded-xl border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 font-bold text-sm">Discard all</button>
                  </div>
                </div>
              </div>
            )}

            {reflectionStep === 'quick-win' && (
              <div className="p-7 text-center">
                <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚡️</div>
                <h2 className="text-lg font-bold text-slate-900 mb-2">5-minute challenge</h2>
                <p className="text-slate-400 mb-5 text-sm">Can you knock one out right now?</p>
                <ButtonPrimary onClick={() => setReflectionStep('intro')} className="w-full !py-3 !text-sm">On it!</ButtonPrimary>
                <button onClick={handleMoveTodosToTomorrow} className="mt-3 text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-wider">Move to tomorrow instead</button>
              </div>
            )}

            {reflectionStep === 'form' && (
              <div className="p-7">
                <div className="text-center mb-5">
                  <h2 className="text-xl font-bold text-slate-900">End of day</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{todayData?.date}</p>
                </div>
                <div className="space-y-5">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Did you achieve your One Thing?</label>
                    <div className="flex gap-2">
                      <button onClick={() => setTempReflection({ ...tempReflection, focusAchieved: true })} className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all border ${tempReflection.focusAchieved === true ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Yes!</button>
                      <button onClick={() => setTempReflection({ ...tempReflection, focusAchieved: false })} className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all border ${tempReflection.focusAchieved === false ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>Not quite</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Biggest win today?</label>
                    <textarea value={tempReflection.biggestWin || ''} onChange={e => setTempReflection({ ...tempReflection, biggestWin: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:border-slate-300 outline-none h-16 resize-none" placeholder="What went really well?" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">One thing to do better tomorrow?</label>
                    <textarea value={tempReflection.betterTomorrow || ''} onChange={e => setTempReflection({ ...tempReflection, betterTomorrow: e.target.value })} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:border-slate-300 outline-none h-16 resize-none" placeholder="One concrete intention…" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">How was the day?</label>
                    <div className="flex gap-3 justify-center">
                      {(['strong', 'okay', 'difficult'] as const).map(r => (
                        <button key={r} onClick={() => setTempReflection({ ...tempReflection, selfRating: r })} className={`px-4 py-2 rounded-xl border-2 text-2xl transition-all ${tempReflection.selfRating === r ? 'border-slate-300 bg-slate-100 scale-110' : 'border-transparent grayscale opacity-40 hover:opacity-80 hover:grayscale-0'}`}>
                          {r === 'strong' ? '😊' : r === 'okay' ? '😐' : '😞'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <ButtonPrimary onClick={handleReflectionSubmit} disabled={isGeneratingRating || !tempReflection.selfRating} className="w-full !py-3">
                    {isGeneratingRating
                      ? <><Loader2 className="animate-spin" size={16} /> AI is evaluating your day…</>
                      : 'Save & archive day'}
                  </ButtonPrimary>
                  {!import.meta.env.VITE_GEMINI_API_KEY && (
                    <p className="text-center text-[10px] text-slate-400 mt-2">Add VITE_GEMINI_API_KEY to .env to enable AI rating</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
