import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight, BookOpen, Brain, Check, ChevronDown, FileText, GraduationCap,
  LayoutDashboard, Library, Menu, Play, Plus, Search, Settings, Sparkles,
  Target, Upload, Users, X, Youtube, ShieldCheck, Clock3, BarChart3,
} from 'lucide-react'
import './index.css'

type Section = 'home' | 'generate' | 'library' | 'predictions' | 'admin'
type Exam = 'All' | 'NEET' | 'JEE' | 'CBSE 12' | 'CBSE 10'

type Paper = { id: number; title: string; exam: Exclude<Exam, 'All'>; subject: string; year: number; questions: number; status: string }

const papers: Paper[] = [
  { id: 1, title: 'NEET Biology — Cell Structure', exam: 'NEET', subject: 'Biology', year: 2024, questions: 50, status: 'Most attempted' },
  { id: 2, title: 'JEE Main — Mechanics', exam: 'JEE', subject: 'Physics', year: 2024, questions: 30, status: 'New' },
  { id: 3, title: 'CBSE Class 12 — Electrochemistry', exam: 'CBSE 12', subject: 'Chemistry', year: 2023, questions: 35, status: 'Popular' },
  { id: 4, title: 'CBSE Class 10 — Life Processes', exam: 'CBSE 10', subject: 'Science', year: 2023, questions: 40, status: 'Popular' },
  { id: 5, title: 'NEET Chemistry — Organic Reactions', exam: 'NEET', subject: 'Chemistry', year: 2022, questions: 50, status: 'Archive' },
  { id: 6, title: 'JEE Advanced — Coordinate Geometry', exam: 'JEE', subject: 'Mathematics', year: 2022, questions: 25, status: 'Archive' },
]

const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'home', label: 'Overview', icon: LayoutDashboard },
  { id: 'generate', label: 'Generate MCQs', icon: Sparkles },
  { id: 'library', label: 'Paper library', icon: Library },
  { id: 'predictions', label: 'Predictions', icon: Target },
]

export default function App() {
  const [section, setSection] = useState<Section>('home')
  const [mobileNav, setMobileNav] = useState(false)
  const [exam, setExam] = useState<Exam>('All')
  const [notes, setNotes] = useState('')
  const [difficulty, setDifficulty] = useState('Medium')
  const [count, setCount] = useState(10)
  const [subject, setSubject] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [uploadedName, setUploadedName] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [adminPapers, setAdminPapers] = useState(papers)
  const fileRef = useRef<HTMLInputElement>(null)

  const filteredPapers = useMemo(() => adminPapers.filter((paper) => exam === 'All' || paper.exam === exam), [adminPapers, exam])

  const generate = async () => {
    if (notes.trim().length < 20) return
    setGenerating(true)
    await new Promise((resolve) => setTimeout(resolve, 900))
    setGenerated(true)
    setGenerating(false)
  }

  const readFile = (file: File) => {
    setUploadedName(file.name)
    const reader = new FileReader()
    reader.onload = () => setNotes(String(reader.result || ''))
    reader.readAsText(file)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><BookOpen size={18} /></span><span>LOCK <b>iNN</b></span></div>
        <div className="sidebar-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${section === id ? 'active' : ''}`} onClick={() => { setSection(id); setMobileNav(false) }}><Icon size={17} />{label}</button>)}
        </nav>
        <div className="sidebar-label">Account</div>
        <button className={`nav-item ${section === 'admin' ? 'active' : ''}`} onClick={() => { setSection('admin'); setMobileNav(false) }}><ShieldCheck size={17} />Admin console</button>
        <div className="sidebar-spacer" />
        <a className="youtube-card" href="https://www.youtube.com/" target="_blank" rel="noreferrer"><span className="youtube-icon"><Youtube size={18} /></span><span><b>Study with LOCK iNN</b><small>Watch on YouTube</small></span><ArrowRight size={15} /></a>
        <div className="profile"><div className="avatar">A</div><div><b>Student account</b><small>Free workspace</small></div><Settings size={16} /></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb">Workspace <span>/</span> <b>{section === 'home' ? 'Overview' : navItems.find((n) => n.id === section)?.label || 'Admin console'}</b></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={18} /></button><button className="avatar small">A</button></div></header>
        <div className="content-wrap">
          {section === 'home' && <Overview onNavigate={setSection} exam={exam} setExam={setExam} papers={filteredPapers} />}
          {section === 'generate' && <Generator notes={notes} setNotes={setNotes} difficulty={difficulty} setDifficulty={setDifficulty} count={count} setCount={setCount} subject={subject} setSubject={setSubject} uploadedName={uploadedName} generating={generating} generated={generated} setGenerated={setGenerated} onGenerate={generate} onUpload={() => fileRef.current?.click()} />}
          {section === 'library' && <LibraryPage exam={exam} setExam={setExam} papers={filteredPapers} showAll={showAll} setShowAll={setShowAll} onMock={() => setSection('predictions')} />}
          {section === 'predictions' && <PredictionPage exam={exam} setExam={setExam} onStart={() => setGenerated(true)} generated={generated} />}
          {section === 'admin' && <AdminPage papers={adminPapers} onAdd={() => setAdminPapers((current) => [{ id: Date.now(), title: 'Untitled question paper', exam: 'CBSE 12', subject: 'General', year: 2026, questions: 40, status: 'Draft' }, ...current])} />}
        </div>
        <footer className="footer"><span>© 2026 LOCK iNN. Built for focused preparation.</span><span className="footer-links"><a href="#how">How it works</a><a href="#privacy">Privacy</a><a href="https://www.youtube.com/" target="_blank" rel="noreferrer"><Youtube size={14} /> YouTube</a></span></footer>
      </main>
      <input ref={fileRef} type="file" accept=".txt,.md,.csv,.pdf" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function ExamFilters({ exam, setExam }: { exam: Exam; setExam: (value: Exam) => void }) {
  return <div className="filter-row">{(['All', 'NEET', 'JEE', 'CBSE 12', 'CBSE 10'] as Exam[]).map((item) => <button key={item} className={`filter-chip ${exam === item ? 'selected' : ''}`} onClick={() => setExam(item)}>{item}</button>)}</div>
}

function Overview({ onNavigate, exam, setExam, papers }: { onNavigate: (s: Section) => void; exam: Exam; setExam: (e: Exam) => void; papers: Paper[] }) {
  return <>
    <PageHeading eyebrow="Wednesday, 26 September 2026" title="Make your next session count." description="A clear space to turn your notes into practice, find past papers, and prepare with intent." action={<button className="primary-button" onClick={() => onNavigate('generate')}>Create a quiz <ArrowRight size={16} /></button>} />
    <div className="stats-grid"><Stat icon={Target} label="Questions completed" value="248" note="+18% this week" /><Stat icon={Clock3} label="Study time" value="12.4h" note="Across 6 sessions" /><Stat icon={BarChart3} label="Average accuracy" value="78%" note="Keep going" /><Stat icon={Brain} label="Ready for review" value="24" note="Due today" /></div>
    <div className="dashboard-grid"><section className="panel progress-panel"><div className="panel-heading"><div><h2>Your preparation</h2><p>Progress across your active courses</p></div><button className="text-button" onClick={() => onNavigate('predictions')}>View predictions <ArrowRight size={15} /></button></div><div className="progress-item"><div className="progress-title"><b>NEET 2026</b><span>64%</span></div><div className="progress-track"><span style={{ width: '64%' }} /></div><small>Biology is your strongest subject this week.</small></div><div className="progress-item"><div className="progress-title"><b>CBSE Class 12</b><span>42%</span></div><div className="progress-track"><span style={{ width: '42%' }} /></div><small>Focus next on electrochemistry and calculus.</small></div><div className="continue-card"><div className="soft-icon"><Play size={17} /></div><div><b>Continue where you left off</b><p>NEET Biology · Human Physiology</p></div><button className="outline-button" onClick={() => onNavigate('generate')}>Resume</button></div></section><section className="panel"><div className="panel-heading"><div><h2>Recent papers</h2><p>Practice from the archive</p></div><button className="text-button" onClick={() => onNavigate('library')}>See library <ArrowRight size={15} /></button></div><ExamFilters exam={exam} setExam={setExam} /><div className="compact-list">{papers.slice(0, 3).map((paper) => <PaperRow key={paper.id} paper={paper} onClick={() => onNavigate('predictions')} />)}</div></section></div>
    <section className="how-section" id="how"><div className="eyebrow">A simple loop</div><h2>Study less randomly. Learn more deliberately.</h2><div className="how-grid"><How number="01" icon={Upload} title="Bring your material" text="Paste notes, upload a file, or choose a paper from the library." /><How number="02" icon={Sparkles} title="Build practice" text="Set a level and let LOCK iNN create focused MCQs." /><How number="03" icon={Check} title="See what sticks" text="Review your score and return to the topics that need you." /></div></section>
  </>
}

function Stat({ icon: Icon, label, value, note }: { icon: typeof Target; label: string; value: string; note: string }) { return <div className="stat-card"><div className="stat-icon"><Icon size={17} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }
function How({ number, icon: Icon, title, text }: { number: string; icon: typeof Upload; title: string; text: string }) { return <div className="how-item"><span className="how-number">{number}</span><Icon size={20} /><h3>{title}</h3><p>{text}</p></div> }

function Generator({ notes, setNotes, difficulty, setDifficulty, count, setCount, subject, setSubject, uploadedName, generating, generated, setGenerated, onGenerate, onUpload }: any) {
  return <><PageHeading eyebrow="Practice studio" title="Turn notes into questions." description="Generate up to 50 MCQs from your own material. You stay in control of the topic, level, and pace." action={<span className="secure-note"><ShieldCheck size={15} /> Your notes stay private</span>} /><div className="generator-layout"><section className="panel source-panel"><div className="panel-heading"><div><h2>1. Add your material</h2><p>Paste a chapter, revision notes, or a concept summary.</p></div><button className="outline-button" onClick={onUpload}><Upload size={15} /> Upload file</button></div><textarea value={notes} onChange={(e) => { setNotes(e.target.value); setGenerated(false) }} placeholder="Paste your study material here..." aria-label="Study material" /><div className="source-footer"><span>{uploadedName ? <><FileText size={14} /> {uploadedName}</> : 'Minimum 20 words for a useful quiz'}</span><span>{notes.trim() ? `${notes.trim().split(/\s+/).length} words` : '0 words'}</span></div></section><aside className="panel setup-panel"><div className="panel-heading"><div><h2>2. Set your quiz</h2><p>Make it fit today&apos;s session.</p></div></div><label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" /></label><label>Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option><option>Mixed</option></select></label><label>Questions<div className="count-control"><button onClick={() => setCount(Math.max(5, count - 5))}>−</button><b>{count}</b><button onClick={() => setCount(Math.min(50, count + 5))}>+</button></div></label><button className="primary-button full" disabled={generating || notes.trim().length < 20} onClick={onGenerate}>{generating ? 'Building your quiz…' : 'Generate MCQs'}<Sparkles size={16} /></button><small className="helper">You can generate a new set whenever you like.</small></aside></div>{generated && <QuizPreview count={count} difficulty={difficulty} onReset={() => setGenerated(false)} />}</>
}
function QuizPreview({ count, difficulty, onReset }: { count: number; difficulty: string; onReset: () => void }) { return <section className="panel quiz-result"><div><div className="eyebrow">Ready to review</div><h2>Your {difficulty.toLowerCase()} practice set is ready.</h2><p>{count} questions generated from your notes. Start a timed mock test or work through them at your own pace.</p></div><div className="result-actions"><button className="outline-button" onClick={onReset}>Edit source</button><button className="primary-button">Start quiz <ArrowRight size={16} /></button></div></section> }

function LibraryPage({ exam, setExam, papers, showAll, setShowAll, onMock }: any) { return <><PageHeading eyebrow="Question paper archive" title="Practice what has been asked." description="Previous year papers, organized by the exam you are preparing for." action={<button className="primary-button" onClick={onMock}>Take a mock test <Play size={15} /></button>} /><ExamFilters exam={exam} setExam={setExam} /><div className="library-toolbar"><span><b>{papers.length}</b> papers available</span><div className="search-field"><Search size={15} /><input placeholder="Search papers" /></div></div><div className="paper-grid">{(showAll ? papers : papers.slice(0, 4)).map((paper: Paper) => <PaperCard key={paper.id} paper={paper} onStart={onMock} />)}</div>{papers.length > 4 && <button className="outline-button center-button" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : 'Show all papers'} <ChevronDown size={15} /></button>}</> }
function PaperCard({ paper, onStart }: { paper: Paper; onStart: () => void; key?: number }) { return <article className="paper-card"><div className="paper-card-top"><span className="paper-badge">{paper.exam}</span><span className="status">{paper.status}</span></div><h3>{paper.title}</h3><p>{paper.subject} · {paper.year} · {paper.questions} questions</p><div className="paper-card-bottom"><span><FileText size={14} /> Previous year paper</span><button className="icon-text-button" onClick={onStart}>Open <ArrowRight size={14} /></button></div></article> }
function PaperRow({ paper, onClick }: { paper: Paper; onClick: () => void; key?: number }) { return <button className="paper-row" onClick={onClick}><span className="row-icon"><FileText size={15} /></span><span><b>{paper.title}</b><small>{paper.exam} · {paper.year}</small></span><ArrowRight size={15} /></button> }

function PredictionPage({ exam, setExam, onStart, generated }: any) { return <><PageHeading eyebrow="Pattern intelligence" title="Prepare for what comes next." description="LOCK iNN studies recurring concepts and question patterns from the archive to build a prediction paper for your exam." /><ExamFilters exam={exam} setExam={setExam} /><section className="prediction-hero"><div className="prediction-copy"><span className="prediction-mark"><Target size={21} /></span><div className="eyebrow">Prediction paper · {exam === 'All' ? 'Choose an exam' : exam}</div><h2>A focused mock, built from the past.</h2><p>Generate a fresh paper based on topic frequency, recurring formats, and concepts that appear year after year. Predictions are study guidance, not a guarantee.</p><button className="primary-button" onClick={onStart}>Build prediction paper <Sparkles size={16} /></button></div><div className="prediction-visual"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="visual-core"><Brain size={34} /><span>Pattern<br />map</span></div></div></section>{generated && <section className="panel mock-panel"><div><div className="eyebrow">Prediction paper ready</div><h2>{exam === 'All' ? 'Exam' : exam} high-frequency mock</h2><p>30 questions · 45 minutes · Mixed difficulty</p></div><button className="primary-button">Start mock test <Play size={15} /></button></section>}</> }

function AdminPage({ papers, onAdd }: { papers: Paper[]; onAdd: () => void }) { return <><PageHeading eyebrow="Admin console" title="Keep the archive useful." description="Upload, organize, and publish papers for every learner and exam track." action={<button className="primary-button" onClick={onAdd}><Plus size={16} /> Add paper</button>} /><div className="admin-stats"><Stat icon={FileText} label="Published papers" value={papers.length.toString()} note="Across 4 tracks" /><Stat icon={Users} label="Active learners" value="1,284" note="This month" /><Stat icon={Sparkles} label="Predictions run" value="642" note="+24% this month" /></div><section className="panel admin-table"><div className="panel-heading"><div><h2>Paper management</h2><p>Review and organize your question bank.</p></div><button className="outline-button"><Search size={15} /> Search</button></div><div className="table-wrap"><table><thead><tr><th>Paper</th><th>Track</th><th>Year</th><th>Questions</th><th>Status</th><th /></tr></thead><tbody>{papers.map((paper) => <tr key={paper.id}><td><b>{paper.title}</b><small>{paper.subject}</small></td><td><span className="paper-badge">{paper.exam}</span></td><td>{paper.year}</td><td>{paper.questions}</td><td><span className={`table-status ${paper.status === 'Draft' ? 'draft' : ''}`}>{paper.status}</span></td><td><button className="dots" aria-label={`Actions for ${paper.title}`}>•••</button></td></tr>)}</tbody></table></div></section></> }

export { App }
