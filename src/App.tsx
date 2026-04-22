import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Trash2, X, Menu, Plus, Sparkles, Edit2, Save, Moon, Check, Loader2,
  GripVertical, LayoutGrid, CalendarDays, PlayCircle, ChevronRight, Star,
} from 'lucide-react';
import { type DayData, type Todo, type ReflectionData, type Habit, ViewMode, type LongTermPlan, type PlanItem } from './types';
import { INITIAL_HABITS } from './constants';
import { generateDayRating } from './services/geminiService';
import { format, isSameDay, parseISO, addDays, subDays } from 'date-fns';
import { saveDay, getDay, getHistory, savePlan, getPlan } from './services/localStorageService';

// ─── Focus request system (id + timestamp to force re-trigger even for same id)
type FocusRequest = { id: string; ts: number } | null;

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
  focusRequest?: FocusRequest;
  todoId?: string;
}> = ({ value, onChange, onIndent, onEnterKey, onDelete, disabled, className = '', placeholder, focusRequest, todoId }) => {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const lastHtml = useRef(value);

  // Init DOM
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync value only when not focused
  useEffect(() => {
    if (!focused.current && ref.current && value !== lastHtml.current) {
      ref.current.innerHTML = value || '';
      lastHtml.current = value;
    }
  }, [value]);

  // Focus when requested
  useEffect(() => {
    if (!focusRequest || focusRequest.id !== todoId || !ref.current) return;
    ref.current.focus();
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [focusRequest, todoId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Backspace') {
      const text = ref.current?.textContent || '';
      if (!text.trim() && onDelete) { e.preventDefault(); onDelete(); return; }
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

type CBVariant = 'slate' | 'rose' | 'sage' | 'violet';
const Checkbox: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; variant?: CBVariant }> = ({ checked, onChange, disabled, variant = 'slate' }) => {
  const colors: Record<CBVariant, string> = {
    rose:   checked ? 'bg-rose-400 border-rose-400'     : 'border-rose-200 hover:border-rose-400 bg-white',
    violet: checked ? 'bg-violet-500 border-violet-500' : 'border-violet-200 hover:border-violet-400 bg-white',
    sage:   checked ? 'bg-emerald-500 border-emerald-500' : 'border-emerald-200 hover:border-emerald-400 bg-white',
    slate:  checked ? 'bg-slate-800 border-slate-800'   : 'border-slate-300 hover:border-slate-500 bg-white',
  };
  return (
    <button onClick={onChange} disabled={disabled}
      className={`shrink-0 w-[18px] h-[18px] rounded-[5px] border-[2px] flex items-center justify-center transition-all duration-150 ${colors[variant]} ${disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}>
      <Check size={10} className={`text-white font-black transition-all duration-150 ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} strokeWidth={3.5} />
    </button>
  );
};

const FocusLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="20" cy="20" r="7" fill="currentColor" />
  </svg>
);

const RocketOverlay: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  useEffect(() => { const t = setTimeout(onComplete, 3000); return () => clearTimeout(t); }, [onComplete]);
  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {[...Array(40)].map((_, i) => (
        <div key={i} className="absolute w-2.5 h-2.5 rounded-full animate-confetti"
          style={{ backgroundColor: ['#FCD34D','#34D399','#F87171','#60A5FA','#C4B5FD'][i%5], left:`${50+(Math.random()*70-35)}%`, top:`${50+(Math.random()*70-35)}%`, animationDelay:`${Math.random()*0.3}s` }} />
      ))}
      <div className="absolute bottom-[-100px] left-[10%] animate-rocket text-[90px] transform rotate-45">🚀</div>
    </div>
  );
};

const ProgressRing: React.FC<{ progress: number }> = ({ progress }) => {
  const r = 16, c = 2 * Math.PI * r;
  return (
    <div className="fixed bottom-6 left-6 z-[60] bg-white/90 backdrop-blur-sm border border-sky-100 px-3 py-2 rounded-2xl flex items-center gap-2.5 shadow-sm">
      <div className="relative w-10 h-10 flex items-center justify-center">
        <svg className="-rotate-90 w-10 h-10">
          <circle cx="20" cy="20" r={r} stroke="#e0f2fe" strokeWidth="3.5" fill="transparent" />
          <circle cx="20" cy="20" r={r} stroke="#0284c7" strokeWidth="3.5" fill="transparent"
            strokeDasharray={c} strokeDashoffset={c - (progress/100)*c}
            strokeLinecap="round" className="transition-all duration-700 ease-out" />
        </svg>
        <span className="absolute text-[9px] font-bold text-sky-700">{Math.round(progress)}%</span>
      </div>
      <div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today</div>
        <div className="text-xs font-bold text-slate-700">{Math.round(progress) >= 80 ? 'Almost there!' : Math.round(progress) >= 40 ? 'Keep going!' : 'Let\'s go!'}</div>
      </div>
    </div>
  );
};

// ─── Modal shell ──────────────────────────────────────────────────────────────
const Modal: React.FC<{ children: React.ReactNode; onClose?: () => void }> = ({ children, onClose }) => (
  <div className="fixed inset-0 z-[100] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden relative">
      {onClose && (
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 text-slate-400 hover:text-slate-600 transition-colors z-10">
          <X size={16} />
        </button>
      )}
      {children}
    </div>
  </div>
);

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.DAY);
  const [history, setHistory] = useState<DayData[]>([]);
  const [todayData, setTodayData] = useState<DayData | null>(null);
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
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);

  const [showRocket, setShowRocket] = useState(false);
  const [reflectionStep, setReflectionStep] = useState<'intro'|'open-todos'|'quick-win'|'form'|'rating'>('intro');
  const [tempReflection, setTempReflection] = useState<Partial<ReflectionData>>({});
  const [isGeneratingRating, setIsGeneratingRating] = useState(false);
  const [morningReviewData, setMorningReviewData] = useState<DayData | null>(null);
  const [showMorningReview, setShowMorningReview] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestFocus = useCallback((id: string) => {
    setFocusRequest({ id, ts: Date.now() });
  }, []);

  // ── Data Loading ──

  useEffect(() => {
    const data = getHistory();
    setHistory(data);
    const yId = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const y = data.find(d => d.id === yId);
    if (y && !y.isReflectionSubmitted) { setMorningReviewData(y); setShowMorningReview(true); }
  }, []);

  useEffect(() => {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const cached = history.find(d => d.id === dateStr);
    if (cached) { setTodayData(cached); return; }
    const stored = getDay(dateStr);
    if (stored) {
      setTodayData(stored);
      setHistory(prev => prev.find(d => d.id === stored.id) ? prev : [...prev, stored].sort((a,b)=>b.id.localeCompare(a.id)));
    } else {
      const recent = [...history].sort((a,b)=>b.id.localeCompare(a.id))[0];
      const habits = recent ? recent.habits.map((h: Habit) => ({ ...h, completed: false })) : INITIAL_HABITS;
      setTodayData({ id: dateStr, date: format(currentDate,'EEEE, MMMM d, yyyy'), focus:'', focusCompleted:false, todos:[], habits, notes:'', reflection:null, aiRating:null, isReflectionSubmitted:false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  useEffect(() => {
    if (viewMode === ViewMode.MONTH) {
      const key = `month-${format(currentDate,'yyyy-MM')}`;
      const p = getPlan(key);
      setMonthlyPlan(p || { id:key, title:format(currentDate,'MMMM yyyy'), oneThing:'', supportingGoals:[], notes:'' });
    }
    if (viewMode === ViewMode.YEAR) {
      const key = `year-${format(currentDate,'yyyy')}`;
      const p = getPlan(key);
      setYearlyPlan(p || { id:key, title:format(currentDate,'yyyy'), oneThing:'', supportingGoals:[], notes:'', quarters:{q1:'',q2:'',q3:'',q4:''} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode]);

  // ── Updaters ──

  const updateTodayData = (updates: Partial<DayData>) => {
    if (!todayData) return;
    const updated = { ...todayData, ...updates };
    setTodayData(updated);
    setHistory(prev => prev.find(d=>d.id===updated.id) ? prev.map(d=>d.id===updated.id?updated:d).sort((a,b)=>b.id.localeCompare(a.id)) : [...prev,updated].sort((a,b)=>b.id.localeCompare(a.id)));
    setIsSaving(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { saveDay(updated); setIsSaving(false); }, 400);
  };

  const updateArbitraryDay = (day: DayData) => {
    saveDay(day);
    setHistory(prev => prev.map(d=>d.id===day.id?day:d).sort((a,b)=>b.id.localeCompare(a.id)));
  };

  const updateMonthlyPlan = (updates: Partial<LongTermPlan>) => {
    if (!monthlyPlan) return;
    const updated = { ...monthlyPlan, ...updates };
    setMonthlyPlan(updated);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => savePlan(updated), 400);
  };

  const updateYearlyPlan = (updates: Partial<LongTermPlan>) => {
    if (!yearlyPlan) return;
    const updated = { ...yearlyPlan, ...updates };
    setYearlyPlan(updated);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => savePlan(updated), 400);
  };

  // ── Milestones ──
  const addMilestone = () => { if (!monthlyPlan) return; updateMonthlyPlan({ supportingGoals: [...monthlyPlan.supportingGoals, { id:Date.now().toString(), text:'', completed:false } as PlanItem] }); };
  const toggleMilestone = (id: string) => { if (!monthlyPlan) return; updateMonthlyPlan({ supportingGoals: monthlyPlan.supportingGoals.map(m=>m.id===id?{...m,completed:!m.completed}:m) }); };
  const updateMilestoneText = (id: string, text: string) => { if (!monthlyPlan) return; updateMonthlyPlan({ supportingGoals: monthlyPlan.supportingGoals.map(m=>m.id===id?{...m,text}:m) }); };
  const deleteMilestone = (id: string) => { if (!monthlyPlan||!confirm('Delete milestone?')) return; updateMonthlyPlan({ supportingGoals: monthlyPlan.supportingGoals.filter(m=>m.id!==id) }); };

  // ── Todos ──

  const handleAddTodo = (cat: 'work' | 'personal') => {
    const input = cat === 'work' ? workInput : personalInput;
    if (!input.trim() || !todayData) return;
    if (todayData.todos.length >= 20) { alert('Max 20 tasks — keep it focused!'); return; }
    const newId = Date.now().toString();
    updateTodayData({ todos: [...todayData.todos, { id:newId, text:input, completed:false, category:cat, indentLevel:0 }] });
    cat === 'work' ? setWorkInput('') : setPersonalInput('');
    requestFocus(newId);
  };

  const addTodoAfter = (afterId: string, category: 'work'|'personal') => {
    if (!todayData) return;
    if (todayData.todos.length >= 20) { alert('Max 20 tasks — keep it focused!'); return; }
    const idx = todayData.todos.findIndex(t=>t.id===afterId);
    const parent = todayData.todos[idx];
    const newId = Date.now().toString();
    const newTodo: Todo = { id:newId, text:'', completed:false, category, indentLevel: parent?.indentLevel || 0 };
    const list = [...todayData.todos];
    list.splice(idx+1, 0, newTodo);
    updateTodayData({ todos: list });
    requestFocus(newId);
  };

  const updateTodoText = (id: string, text: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t=>t.id===id?{...t,text}:t) }); };
  const toggleTodo = (id: string) => { if (!todayData) return; updateTodayData({ todos: todayData.todos.map(t=>t.id===id?{...t,completed:!t.completed}:t) }); };

  const deleteTodo = (id: string) => {
    if (!todayData) return;
    const idx = todayData.todos.findIndex(t=>t.id===id);
    const prev = todayData.todos[idx-1];
    updateTodayData({ todos: todayData.todos.filter(t=>t.id!==id) });
    if (prev) requestFocus(prev.id);
  };

  const changeIndent = (id: string, delta: number) => {
    if (!todayData) return;
    updateTodayData({ todos: todayData.todos.map(t=>t.id===id?{...t,indentLevel:Math.max(0,Math.min(2,(t.indentLevel||0)+delta))}:t) });
    requestFocus(id); // keep focus after indent
  };

  const toggleTodoPriority = (id: string, star: 1 | 2 | 3) => {
    if (!todayData) return;
    updateTodayData({ todos: todayData.todos.map(t => t.id !== id ? t : { ...t, priority: t.priority === star ? undefined : star }) });
  };

  // ── Drag & Drop ──

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTodoId(id);
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, _targetId?: string, targetCat?: 'work'|'personal') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (targetCat) setDragOverColumn(targetCat);
  };

  const handleDrop = (e: React.DragEvent, targetId?: string, targetCat?: 'work'|'personal') => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTodoId || !todayData) return;
    if (targetCat) {
      updateTodayData({ todos: todayData.todos.map(t=>t.id===draggedTodoId?{...t,category:targetCat,indentLevel:0}:t) });
      setDraggedTodoId(null); return;
    }
    if (targetId && targetId !== draggedTodoId) {
      const list = [...todayData.todos];
      const di = list.findIndex(t=>t.id===draggedTodoId);
      if (di < 0) return;
      let bs = 1;
      for (let i=di+1; i<list.length; i++) { if ((list[i].indentLevel||0)>(list[di].indentLevel||0)) bs++; else break; }
      const block = list.splice(di, bs);
      const hi = list.findIndex(t=>t.id===targetId);
      if (hi >= 0) list.splice(hi, 0, ...block);
      updateTodayData({ todos: list });
    }
    setDraggedTodoId(null);
  };

  const handleDragEnd = () => { setDraggedTodoId(null); setDragOverColumn(null); };

  // ── Habits ──
  const toggleHabit = (id: string) => { if (!todayData) return; updateTodayData({ habits: todayData.habits.map(h=>h.id===id?{...h,completed:!h.completed}:h) }); };
  const updateHabitText = (id: string, text: string) => { if (!todayData) return; updateTodayData({ habits: todayData.habits.map(h=>h.id===id?{...h,text}:h) }); };
  const deleteHabit = (id: string) => { if (!todayData||!confirm('Delete habit?')) return; updateTodayData({ habits: todayData.habits.filter(h=>h.id!==id) }); };
  const addHabit = () => { if (!todayData) return; updateTodayData({ habits: [...todayData.habits,{id:Date.now().toString(),text:'New habit',completed:false}] }); };

  // ── Focus toggle ──
  const toggleFocusComplete = () => {
    if (!todayData) return;
    const next = !todayData.focusCompleted;
    updateTodayData({ focusCompleted: next });
    if (next) setShowRocket(true);
  };

  // ── Reflection ──
  const startReflection = () => {
    if (!todayData) return;
    setTempReflection({});
    setReflectionStep(todayData.todos.filter(t=>!t.completed).length > 0 ? 'open-todos' : 'form');
  };

  const closeReflection = () => setReflectionStep('intro');

  const handleMorningReviewAction = (action: 'move'|'discard') => {
    if (!morningReviewData) return;
    if (action === 'move' && todayData) {
      const open = morningReviewData.todos.filter(t=>!t.completed);
      const moved = open.map(t=>({...t,id:Date.now().toString()+Math.random().toString().slice(2,5)}));
      const updated = { ...todayData, todos:[...todayData.todos,...moved] };
      setTodayData(updated); saveDay(updated);
    }
    updateArbitraryDay({ ...morningReviewData, isReflectionSubmitted:true, aiRating:{color:'yellow',score:5,feedback:'Day closed the next morning.',suggestion:'Start fresh today!'} });
    setShowMorningReview(false);
  };

  const handleMoveTodosToTomorrow = () => {
    if (!todayData) return;
    const open = todayData.todos.filter(t=>!t.completed);
    if (open.length === 0) { setReflectionStep('form'); return; }
    const tId = format(addDays(currentDate,1),'yyyy-MM-dd');
    let tData = getDay(tId);
    if (!tData) tData = { id:tId, date:format(addDays(currentDate,1),'EEEE, MMMM d, yyyy'), focus:'', focusCompleted:false, todos:[], habits:todayData.habits.map(h=>({...h,completed:false})), notes:'', reflection:null, aiRating:null, isReflectionSubmitted:false };
    tData.todos = [...tData.todos, ...open.map(t=>({...t,id:Date.now().toString()+Math.random().toString().slice(2,5)}))];
    saveDay(tData);
    updateTodayData({ todos: todayData.todos.filter(t=>t.completed) });
    setReflectionStep('form');
  };

  const handleDiscardOpenTodos = () => {
    if (!todayData) return;
    updateTodayData({ todos: todayData.todos.filter(t=>t.completed) });
    setReflectionStep('form');
  };

  const handleReflectionSubmit = async () => {
    if (!todayData) return;
    setIsGeneratingRating(true);
    const reflection: ReflectionData = { focusAchieved:tempReflection.focusAchieved||false, todosCompletedCount:todayData.todos.filter(t=>t.completed).length, habitsCompletedCount:todayData.habits.filter(h=>h.completed).length, biggestWin:tempReflection.biggestWin||'', betterTomorrow:tempReflection.betterTomorrow||'', selfRating:tempReflection.selfRating as ReflectionData['selfRating'] };
    const withR = { ...todayData, reflection };
    const aiRating = await generateDayRating(withR);
    const final = { ...withR, aiRating: aiRating||{color:'yellow' as const, score:5, feedback:'Day saved.', suggestion:'Tomorrow is a new day!'}, isReflectionSubmitted:true };
    setTodayData(final); saveDay(final);
    setHistory(prev => prev.map(d=>d.id===final.id?final:d));
    setIsGeneratingRating(false);
    setReflectionStep('rating');
  };

  // ── Helpers ──

  const isToday = isSameDay(currentDate, new Date());
  const isReadOnly = viewMode === ViewMode.DAY && !isToday && !!todayData?.isReflectionSubmitted;

  const calcProgress = (data: DayData | null = todayData) => {
    if (!data) return 0;
    const max = data.todos.length + 3;
    const earned = data.todos.filter(t=>t.completed).length + (data.focusCompleted ? 3 : 0);
    return max === 0 ? 0 : Math.min(100, Math.round((earned/max)*100));
  };

  const getScoreColor = (color?: 'green'|'yellow'|'red') => {
    if (color === 'green') return { bg:'bg-emerald-500', light:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200' };
    if (color === 'yellow') return { bg:'bg-amber-400', light:'bg-amber-50', text:'text-amber-700', border:'border-amber-200' };
    return { bg:'bg-rose-500', light:'bg-rose-50', text:'text-rose-700', border:'border-rose-200' };
  };

  const getTodos = (cat: 'work'|'personal') => (todayData?.todos||[]).filter(t => {
    if (t.category !== cat) return false;
    if (todoFilter === 'open') return !t.completed;
    if (todoFilter === 'done') return t.completed;
    return true;
  });

  const getRelativeLabel = (offset: number) => {
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Tomorrow';
    if (offset === -1) return 'Yesterday';
    if (offset === -2) return '2 days ago';
    if (offset === 2) return 'In 2 days';
    if (offset === 3) return 'In 3 days';
    return null;
  };

  const timelineItems = useMemo(() => [-2,-1,0,1,2,3].map(offset => {
    const date = offset===0 ? new Date() : offset<0 ? subDays(new Date(),Math.abs(offset)) : addDays(new Date(),offset);
    const id = format(date,'yyyy-MM-dd');
    const data = history.find(d=>d.id===id);
    return { id, date, offset, isPast:offset<0, isCurrentDay:offset===0, isFuture:offset>0, data };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [history]);

  // ── Todo column renderer ───────────────────────────────────────────────────

  const renderTodoColumn = (category: 'work'|'personal') => {
    const isWork = category === 'work';
    const col = isWork
      ? { bg:'bg-violet-50', headerDot:'bg-violet-400', label:'Work', variant:'violet' as CBVariant, inputFocus:'focus:ring-violet-200', accent:'text-violet-500', addHover:'hover:bg-violet-100' }
      : { bg:'bg-rose-50', headerDot:'bg-rose-400', label:'Personal', variant:'rose' as CBVariant, inputFocus:'focus:ring-rose-200', accent:'text-rose-500', addHover:'hover:bg-rose-100' };
    const isDragTarget = dragOverColumn === category && draggedTodoId !== null;

    return (
      <div
        onDragOver={e => handleDragOver(e, undefined, category)}
        onDrop={e => handleDrop(e, undefined, category)}
        onDragLeave={() => setDragOverColumn(null)}
        className="flex flex-col h-full"
      >
        {/* Column header */}
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className={`w-2 h-2 rounded-full ${col.headerDot}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{col.label}</span>
        </div>

        {/* Column card */}
        <div className={`flex-1 ${col.bg} rounded-2xl p-3 flex flex-col min-h-[300px] transition-all ${isDragTarget ? 'ring-2 ring-indigo-300 ring-offset-2' : ''}`}>
          <div className="space-y-0.5 flex-1">
            {getTodos(category).map(todo => {
              const indent = todo.indentLevel || 0;
              return (
                <div
                  key={todo.id}
                  draggable={!isReadOnly}
                  onDragStart={e => handleDragStart(e, todo.id)}
                  onDragOver={e => handleDragOver(e, todo.id)}
                  onDrop={e => handleDrop(e, todo.id)}
                  onDragEnd={handleDragEnd}
                  className={`group flex items-start gap-2 px-2 py-1.5 rounded-xl hover:bg-white/60 transition-all duration-100 relative ${draggedTodoId===todo.id?'opacity-30':''}`}
                  style={{ paddingLeft: `${8 + indent * 20}px` }}
                >
                  {/* Indent visual */}
                  {indent > 0 && (
                    <div className="absolute left-0 top-0 bottom-0 flex items-stretch" style={{ left: `${indent * 20 - 6}px`, width: '2px' }}>
                      <div className="w-full bg-white/50 rounded-full" />
                    </div>
                  )}

                  {/* Drag handle */}
                  {!isReadOnly && (
                    <div className="mt-[3px] cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <GripVertical size={12} />
                    </div>
                  )}

                  {/* Checkbox */}
                  <div className="mt-[3px] shrink-0">
                    <Checkbox checked={todo.completed} onChange={() => toggleTodo(todo.id)} disabled={isReadOnly} variant={col.variant} />
                  </div>

                  {/* Text */}
                  {isReadOnly ? (
                    <div className={`flex-1 text-sm leading-snug rich-text ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                      dangerouslySetInnerHTML={{ __html: todo.text }} />
                  ) : (
                    <RichTextEditor
                      value={todo.text}
                      onChange={html => updateTodoText(todo.id, html)}
                      onIndent={inc => changeIndent(todo.id, inc ? 1 : -1)}
                      onEnterKey={() => addTodoAfter(todo.id, category)}
                      onDelete={() => deleteTodo(todo.id)}
                      focusRequest={focusRequest}
                      todoId={todo.id}
                      className={`flex-1 text-sm leading-snug ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                      placeholder="Task…"
                    />
                  )}

                  {/* Priority stars */}
                  {!isReadOnly && (
                    <div className={`flex items-center gap-0 mt-[3px] shrink-0 transition-opacity duration-100 ${todo.priority ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {([1, 2, 3] as const).map(star => (
                        <button
                          key={star}
                          onClick={() => toggleTodoPriority(todo.id, star)}
                          title={star === 3 ? 'Top priority' : star === 2 ? 'Medium priority' : 'Low priority'}
                          className="p-0.5 transition-colors"
                        >
                          <Star
                            size={11}
                            className={star <= (todo.priority || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 hover:text-amber-300'}
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Delete on hover */}
                  {!isReadOnly && (
                    <button onClick={() => deleteTodo(todo.id)}
                      className="opacity-0 group-hover:opacity-100 mt-[3px] p-0.5 text-slate-300 hover:text-rose-400 transition-all shrink-0">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add task input */}
          {!isReadOnly && (
            <div className={`mt-2 flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/0 hover:bg-white/50 ${col.addHover} transition-all`}>
              <Plus size={13} className="text-slate-300 shrink-0" />
              <input
                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-600 placeholder:text-slate-300 font-medium"
                placeholder="Add task…"
                value={isWork ? workInput : personalInput}
                onChange={e => isWork ? setWorkInput(e.target.value) : setPersonalInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTodo(category)}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen w-full bg-sky-50 font-sans text-slate-900 relative pb-24">
      {showRocket && <RocketOverlay onComplete={() => setShowRocket(false)} />}
      {viewMode === ViewMode.DAY && todayData && <ProgressRing progress={calcProgress()} />}

      {/* Save indicator */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-sky-100 shadow-sm">
        {isSaving
          ? <><Loader2 size={11} className="animate-spin text-slate-400" /><span className="text-[10px] font-semibold text-slate-400">Saving…</span></>
          : <><Check size={11} className="text-emerald-500" /><span className="text-[10px] font-semibold text-slate-400">Saved locally</span></>
        }
      </div>

      {/* Mobile menu toggle */}
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)}
          className="fixed top-3 right-3 lg:hidden p-2.5 bg-white border border-sky-100 rounded-xl text-slate-500 z-50 shadow-sm">
          <Menu size={18} />
        </button>
      )}

      {/* Sidebar overlay */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/10 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      {/* ── RIGHT SIDEBAR ── */}
      <aside className={`fixed top-0 right-0 h-full w-72 bg-white border-l border-sky-100 z-50 transform transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 flex flex-col shadow-lg lg:shadow-none`}>
        <div className="p-5 h-full flex flex-col">

          {/* Logo */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5">
              <FocusLogo className="text-sky-600" />
              <span className="text-base font-bold text-slate-800 tracking-tight">Listo</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1.5 hover:bg-sky-50 rounded-lg text-slate-400">
              <X size={16} />
            </button>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 px-1">Timeline</p>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 pb-4">
            {timelineItems.map(item => {
              const isActive = isSameDay(currentDate, parseISO(item.id));
              const pct = item.data ? calcProgress(item.data) : null;
              const taskCount = item.data?.todos.length ?? 0;
              const doneCount = item.data?.todos.filter(t=>t.completed).length ?? 0;
              const showClose = item.offset === -1 && item.data && !item.data.isReflectionSubmitted;

              return (
                <div key={item.id}>
                  <button
                    onClick={() => { setCurrentDate(parseISO(item.id)); setViewMode(ViewMode.DAY); setIsSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-left ${
                      isActive ? 'bg-sky-600 text-white' :
                      item.isPast ? 'text-slate-400 hover:bg-sky-50' :
                      'text-slate-600 hover:bg-sky-50'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white' : item.isPast ? 'bg-slate-200' : 'bg-sky-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{getRelativeLabel(item.offset) || format(item.date,'EEE, MMM d')}</div>
                      <div className={`text-[10px] mt-0.5 ${isActive ? 'text-sky-200' : 'text-slate-400'}`}>
                        {taskCount > 0 ? `${doneCount}/${taskCount} tasks · ${pct}%` : item.isFuture ? 'Plan ahead' : 'No tasks'}
                      </div>
                    </div>
                    {pct !== null && taskCount > 0 && pct >= 80 && (
                      <span className={`text-sm ${isActive ? 'text-white' : 'text-emerald-500'}`}>✓</span>
                    )}
                  </button>

                  {showClose && (
                    <button
                      onClick={e => { e.stopPropagation(); if (item.data) { setMorningReviewData(item.data); setShowMorningReview(true); setIsSidebarOpen(false); } }}
                      className="ml-6 mt-1 mb-1 text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-1 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1"
                    >
                      <PlayCircle size={9} /> Close yesterday
                    </button>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-slate-300 px-3 pt-3 pb-1">Plan up to 3 days ahead. Use Month view for more.</p>
          </div>

          {/* View switcher */}
          <div className="pt-4 border-t border-sky-50">
            <div className="flex gap-1 bg-sky-50 rounded-xl p-1">
              {([ViewMode.DAY, ViewMode.MONTH, ViewMode.YEAR] as const).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode===v ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                  {v===ViewMode.DAY?'Day':v===ViewMode.MONTH?'Month':'Year'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="lg:pr-72 min-h-screen">
        <div className="max-w-3xl mx-auto px-5 pt-16 pb-10 md:px-8 md:pt-16">

          {/* ── Month view ── */}
          {viewMode === ViewMode.MONTH && monthlyPlan && (
            <div className="space-y-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800">{monthlyPlan.title}</h2>
                <p className="text-slate-400 text-sm mt-1">Monthly Planning</p>
              </div>
              <div className="bg-white rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-sky-400 rounded-t-2xl" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Theme of the month</p>
                <textarea value={monthlyPlan.oneThing} onChange={e => updateMonthlyPlan({ oneThing:e.target.value })} className="w-full bg-transparent text-xl font-bold text-slate-800 placeholder:text-slate-300 outline-none resize-none leading-relaxed" placeholder="What is the focus for this month?" rows={2} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl p-5 min-h-[320px] flex flex-col">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2"><LayoutGrid size={12} /> Milestones</p>
                  <div className="space-y-3 flex-1">
                    {monthlyPlan.supportingGoals.map(goal => (
                      <div key={goal.id} className="flex items-center gap-3 group">
                        <Checkbox checked={goal.completed} onChange={() => toggleMilestone(goal.id)} variant="violet" />
                        <input value={goal.text} onChange={e => updateMilestoneText(goal.id, e.target.value)} className={`flex-1 bg-transparent outline-none text-sm border-b border-transparent focus:border-slate-200 pb-0.5 ${goal.completed?'text-slate-400 line-through':'text-slate-700'}`} />
                        <button onClick={() => deleteMilestone(goal.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-400"><Trash2 size={13} /></button>
                      </div>
                    ))}
                    <button onClick={addMilestone} className="flex items-center gap-2 text-sm text-slate-300 hover:text-slate-600 mt-2 transition-colors"><Plus size={14} /> Add milestone</button>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-5 min-h-[320px]">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Notes</p>
                  <textarea value={monthlyPlan.notes} onChange={e => updateMonthlyPlan({ notes:e.target.value })} className="w-full h-full bg-transparent resize-none outline-none text-sm leading-7 text-slate-600 placeholder:text-slate-300 min-h-[250px]" placeholder="Thoughts, ideas, plans…" />
                </div>
              </div>
            </div>
          )}

          {/* ── Year view ── */}
          {viewMode === ViewMode.YEAR && yearlyPlan && (
            <div className="space-y-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800">{yearlyPlan.title}</h2>
                <p className="text-slate-400 text-sm mt-1">Year Overview</p>
              </div>
              <div className="bg-sky-700 text-white rounded-2xl p-8 text-center">
                <p className="text-[10px] font-bold text-sky-300 uppercase tracking-widest mb-3">Year motto</p>
                <input value={yearlyPlan.oneThing} onChange={e => updateYearlyPlan({ oneThing:e.target.value })} className="w-full bg-transparent text-center text-2xl md:text-4xl font-bold text-white placeholder:text-sky-400 outline-none" placeholder="Your year motto" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['q1','q2','q3','q4'] as const).map((q, idx) => (
                  <div key={q} className="bg-white rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-slate-800">Q{idx+1}</span>
                      <span className="text-xs text-slate-400">{['Jan–Mar','Apr–Jun','Jul–Sep','Oct–Dec'][idx]}</span>
                    </div>
                    <textarea value={yearlyPlan.quarters?.[q]||''} onChange={e => updateYearlyPlan({ quarters:{...yearlyPlan.quarters,[q]:e.target.value} as LongTermPlan['quarters'] })} className="w-full h-28 bg-sky-50 p-3 rounded-xl resize-none outline-none text-sm text-slate-700 placeholder:text-slate-300" placeholder={`Q${idx+1} focus…`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Day view ── */}
          {viewMode === ViewMode.DAY && todayData && (
            <div className="space-y-5">

              {/* Date header */}
              <div className="mb-6">
                <p className="text-xs font-medium text-sky-400 mb-1">
                  {getRelativeLabel(isSameDay(currentDate,new Date()) ? 0 : currentDate>new Date() ? 1 : -1) || format(currentDate,'EEEE')}
                </p>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{format(currentDate,'MMMM d, yyyy')}</h1>
              </div>

              {/* ── THE ONE THING ── */}
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Sparkles size={12} className="text-amber-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">The One Thing</span>
                    </div>
                    {isReadOnly ? (
                      <div className={`text-xl md:text-2xl font-bold leading-snug rich-text ${todayData.focusCompleted ? 'text-emerald-500 line-through' : 'text-slate-800'}`}
                        dangerouslySetInnerHTML={{ __html: todayData.focus || '<span style="color:#cbd5e1;font-weight:400">What matters most today?</span>' }} />
                    ) : (
                      <RichTextEditor
                        value={todayData.focus}
                        onChange={html => updateTodayData({ focus:html })}
                        placeholder="What matters most today?"
                        className={`text-xl md:text-2xl font-bold leading-snug ${todayData.focusCompleted ? 'text-emerald-500 line-through' : 'text-slate-800'}`}
                      />
                    )}
                  </div>
                  <button onClick={toggleFocusComplete}
                    className={`shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${todayData.focusCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 hover:border-emerald-300 bg-white'}`}>
                    <Check size={18} className={`transition-all duration-200 ${todayData.focusCompleted ? 'text-white' : 'text-slate-200'}`} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* ── TASKS ── */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tasks</span>
                  <div className="flex gap-1">
                    {(['all','open','done'] as const).map(f => (
                      <button key={f} onClick={() => setTodoFilter(f)}
                        className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full transition-all ${todoFilter===f ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{f}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {renderTodoColumn('work')}
                  {renderTodoColumn('personal')}
                </div>
                <p className="text-center text-[10px] text-slate-300 mt-2">Enter = new task · Backspace empty = delete · Tab = indent · ⌘B/I/U = format</p>
              </div>

              {/* ── HABITS + MINDPAD ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Habits */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Habits</span>
                    {!isReadOnly && (
                      <button onClick={() => setIsEditingHabits(!isEditingHabits)}
                        className={`text-[10px] font-bold uppercase flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all ${isEditingHabits ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'}`}>
                        {isEditingHabits ? <><Save size={9}/>Done</> : <><Edit2 size={9}/>Edit</>}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 bg-emerald-50 rounded-2xl p-4 min-h-[220px]">
                    <div className="space-y-3">
                      {todayData.habits.map(habit => (
                        <div key={habit.id} className="flex items-center gap-3">
                          {isEditingHabits
                            ? <button onClick={() => deleteHabit(habit.id)} className="w-4 h-4 flex items-center justify-center rounded-full bg-red-100 text-red-400 hover:bg-red-200 shrink-0"><Trash2 size={9}/></button>
                            : <Checkbox checked={habit.completed} onChange={() => toggleHabit(habit.id)} disabled={isReadOnly} variant="sage" />
                          }
                          {isEditingHabits
                            ? <input value={habit.text} onChange={e => updateHabitText(habit.id, e.target.value)} className="flex-1 bg-white px-2.5 py-1 rounded-lg text-sm border border-emerald-100 outline-none text-slate-700" />
                            : <span className={`text-sm font-medium ${habit.completed ? 'text-emerald-300 line-through' : 'text-slate-700'}`}>{habit.text}</span>
                          }
                        </div>
                      ))}
                      {isEditingHabits && <button onClick={addHabit} className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-600 mt-2 font-medium"><Plus size={12}/>Add habit</button>}
                    </div>
                  </div>
                </div>

                {/* Mindpad */}
                <div className="flex flex-col">
                  <div className="mb-2 px-1"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Mindpad</span></div>
                  <div className="flex-1 bg-amber-50 rounded-2xl overflow-hidden flex flex-col min-h-[220px]">
                    <textarea value={todayData.notes} onChange={e => updateTodayData({ notes:e.target.value })} disabled={isReadOnly} placeholder="Quick thoughts, brain dump…" className="flex-1 p-4 bg-transparent resize-none outline-none text-slate-700 placeholder:text-amber-300 text-sm leading-relaxed min-h-[220px]" />
                  </div>
                </div>
              </div>

              {/* ── REFLECTION RESULT ── */}
              {todayData.isReflectionSubmitted && todayData.aiRating && (() => {
                const sc = getScoreColor(todayData.aiRating.color);
                return (
                  <div className={`rounded-2xl overflow-hidden border ${sc.border}`}>
                    <div className={`${sc.bg} px-5 py-3 flex items-center gap-3`}>
                      <span className="text-3xl font-black text-white">{todayData.aiRating.score}</span>
                      <span className="text-white/70 font-bold">/10</span>
                      <span className="text-white/80 text-sm ml-1">
                        {todayData.aiRating.color==='green'?'🌿 Strong day':todayData.aiRating.color==='yellow'?'⚖️ Mixed day':'🔥 Tough day'}
                      </span>
                    </div>
                    <div className={`${sc.light} p-5 space-y-3`}>
                      <p className="text-sm text-slate-700 leading-relaxed">{todayData.aiRating.feedback}</p>
                      <div className="flex gap-2 items-start">
                        <ChevronRight size={14} className={`mt-0.5 shrink-0 ${sc.text}`} />
                        <p className="text-sm text-slate-600 leading-relaxed"><span className={`font-semibold ${sc.text}`}>Tomorrow:</span> {todayData.aiRating.suggestion}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Close day bar */}
        {viewMode===ViewMode.DAY && todayData && !todayData.isReflectionSubmitted && isToday && (
          <div className="fixed bottom-0 left-0 lg:right-72 right-0 z-40 p-4 bg-white/80 backdrop-blur-sm border-t border-sky-100 flex justify-center">
            <button onClick={startReflection}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 shadow-sm">
              <Moon size={15} /> Close day & reflect
            </button>
          </div>
        )}
      </main>

      {/* ── Morning Review Modal ── */}
      {showMorningReview && morningReviewData && (
        <Modal onClose={() => setShowMorningReview(false)}>
          <div className="p-6">
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 text-amber-500 rounded-2xl mb-3"><CalendarDays size={20}/></div>
              <h2 className="text-lg font-bold text-slate-800">Good morning!</h2>
              <p className="text-slate-400 text-sm mt-1">Yesterday isn't closed yet.</p>
            </div>
            <div className="bg-sky-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Focus achieved?</span>
                {morningReviewData.focusCompleted ? <span className="text-emerald-600 font-bold flex items-center gap-1"><Check size={12}/>Yes</span> : <span className="text-slate-400">No</span>}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Open tasks</span>
                <span className="font-bold text-slate-800">{morningReviewData.todos.filter(t=>!t.completed).length}</span>
              </div>
            </div>
            {morningReviewData.todos.filter(t=>!t.completed).length > 0 ? (
              <div className="space-y-2">
                <p className="text-center text-sm text-slate-600 mb-3">What about the open tasks?</p>
                <button onClick={() => handleMorningReviewAction('move')} className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition-all">Move to today</button>
                <button onClick={() => handleMorningReviewAction('discard')} className="w-full py-3 rounded-xl border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50 transition-all">Leave as is</button>
              </div>
            ) : (
              <button onClick={() => handleMorningReviewAction('discard')} className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all">Let's go! 🚀</button>
            )}
          </div>
        </Modal>
      )}

      {/* ── Reflection Modal ── */}
      {reflectionStep !== 'intro' && reflectionStep !== 'rating' && !todayData?.isReflectionSubmitted && (
        <Modal onClose={closeReflection}>
          {/* Step: open todos */}
          {reflectionStep === 'open-todos' && (
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-1">Wrapping up</h2>
              <p className="text-slate-400 text-sm mb-4">You have unfinished tasks. What should happen to them?</p>
              <div className="bg-sky-50 rounded-xl p-3 mb-5 space-y-1 max-h-[180px] overflow-y-auto">
                {todayData?.todos.filter(t=>!t.completed).map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-sm text-slate-600 bg-white p-2 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                    <span className="rich-text" dangerouslySetInnerHTML={{ __html:t.text }} />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <button onClick={handleMoveTodosToTomorrow} className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition-all">Move all to tomorrow →</button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setReflectionStep('quick-win')} className="py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-sm transition-all">Quick win ⚡</button>
                  <button onClick={handleDiscardOpenTodos} className="py-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 font-semibold text-sm transition-all">Discard all</button>
                </div>
              </div>
            </div>
          )}

          {/* Step: quick win */}
          {reflectionStep === 'quick-win' && (
            <div className="p-6 text-center">
              <div className="text-4xl mb-3">⚡️</div>
              <h2 className="text-lg font-bold text-slate-800 mb-1">5-minute challenge</h2>
              <p className="text-slate-400 text-sm mb-5">Can you knock one task out right now?</p>
              <button onClick={() => setReflectionStep('intro')} className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all mb-3">On it! 💪</button>
              <button onClick={handleMoveTodosToTomorrow} className="text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors">Move to tomorrow instead</button>
            </div>
          )}

          {/* Step: reflection form */}
          {reflectionStep === 'form' && (
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-0.5">End of day</h2>
              <p className="text-slate-400 text-xs mb-5">{todayData?.date}</p>
              <div className="space-y-4">
                {/* One Thing */}
                <div className="bg-sky-50 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Did you achieve your One Thing?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setTempReflection({...tempReflection,focusAchieved:true})}
                      className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all border-2 ${tempReflection.focusAchieved===true ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-500 hover:border-emerald-300'}`}>Yes! ✓</button>
                    <button onClick={() => setTempReflection({...tempReflection,focusAchieved:false})}
                      className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all border-2 ${tempReflection.focusAchieved===false ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>Not quite</button>
                  </div>
                </div>
                {/* Win */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Biggest win today?</p>
                  <textarea value={tempReflection.biggestWin||''} onChange={e => setTempReflection({...tempReflection,biggestWin:e.target.value})} className="w-full bg-sky-50 rounded-xl p-3 text-sm outline-none h-16 resize-none placeholder:text-slate-300 text-slate-700 focus:ring-2 focus:ring-sky-200 transition-all" placeholder="What went really well?" />
                </div>
                {/* Better tomorrow */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">One thing to improve tomorrow?</p>
                  <textarea value={tempReflection.betterTomorrow||''} onChange={e => setTempReflection({...tempReflection,betterTomorrow:e.target.value})} className="w-full bg-sky-50 rounded-xl p-3 text-sm outline-none h-16 resize-none placeholder:text-slate-300 text-slate-700 focus:ring-2 focus:ring-sky-200 transition-all" placeholder="One concrete intention…" />
                </div>
                {/* Self rating */}
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">How was the day overall?</p>
                  <div className="flex gap-3 justify-center">
                    {(['strong','okay','difficult'] as const).map(r => (
                      <button key={r} onClick={() => setTempReflection({...tempReflection,selfRating:r})}
                        className={`flex-1 py-3 rounded-xl border-2 text-2xl transition-all ${tempReflection.selfRating===r ? 'border-sky-300 bg-sky-50 scale-105' : 'border-transparent grayscale opacity-30 hover:opacity-70 hover:grayscale-0'}`}>
                        {r==='strong'?'😊':r==='okay'?'😐':'😞'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleReflectionSubmit} disabled={isGeneratingRating||!tempReflection.selfRating}
                className="mt-5 w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isGeneratingRating ? <><Loader2 size={15} className="animate-spin"/>Evaluating your day…</> : 'Save & close day'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
