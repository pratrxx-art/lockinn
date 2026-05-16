import React, { useState, useEffect } from 'react';
import { BookOpen, Sparkles, AlertCircle, CheckCircle2, ChevronRight, RotateCcw, PenTool, Save, Download, Calendar, Clock, UploadCloud, Loader2, Sun, Moon, Palette, FileText, X, SkipForward, LogOut, Mail, Github, Instagram, Youtube, LogIn, Activity, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import PrivacyPolicy from "./PrivacyPolicy";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface MCQ {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  nextReviewDate?: number;
  interval?: number;
  repetitions?: number;
  easeFactor?: number;
}

interface QuestionFeedback {
  mcqId: string;
  isHelpful?: boolean;
  isFlagged?: boolean;
  comment?: string;
}

const tutorialSteps = [
  {
    title: "Welcome to LOCK iNN",
    content: "An adaptive framework designed for mastering complex subjects through high-fidelity spaced repetition.",
    icon: <BookOpen className="w-8 h-8 text-app-accent" />
  },
  {
    title: "Data Acquisition",
    content: "Import your raw documentation or technical papers. Our engine performs deep structural analysis to extract core concepts.",
    icon: <UploadCloud className="w-8 h-8 text-app-accent" />
  },
  {
    title: "Construct & Calibrate",
    content: "Define your depth and complexity parameters. Initialize sessions with dynamic feedback loops for maximum retention.",
    icon: <Activity className="w-8 h-8 text-app-accent" />
  },
  {
    title: "Adaptive Review",
    content: "Our system identifies knowledge gaps and re-sequences material to ensure structural mastery over time.",
    icon: <Clock className="w-8 h-8 text-app-accent" />
  }
];

const InfoTooltip = ({ content }: { content: string }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block ml-2 group">
      <div 
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-4 h-4 rounded-full border border-app-muted/30 flex items-center justify-center text-[8px] text-app-muted cursor-help hover:border-app-accent hover:text-app-accent transition-all"
      >
        ?
      </div>
      <AnimatePresence>
        {show && (
          <motion.div 
            initial={{ opacity: 0, y: 5, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.9 }}
            className="absolute z-[300] bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-app-surface border border-app-border rounded-xl shadow-2xl pointer-events-none"
          >
            <p className="text-[10px] font-medium text-app-fg leading-relaxed">
              {content}
            </p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-app-border" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [notes, setNotes] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('Medium');
  const [subject, setSubject] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState('Analyzing Content...');
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [error, setError] = useState('');
  const [hasSavedNotes, setHasSavedNotes] = useState(false);
  const [srsPool, setSrsPool] = useState<MCQ[]>([]);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [isFlashcardMode, setIsFlashcardMode] = useState(false);
  const [parsingStatus, setParsingStatus] = useState<{ current: number, total: number } | null>(null);
  const [isParsingPDF, setIsParsingPDF] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pdfParsingError, setPdfParsingError] = useState<string | null>(null);
  const [uploadedPdfText, setUploadedPdfText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [questionFeedbacks, setQuestionFeedbacks] = useState<Record<string, QuestionFeedback>>({});
  const [sessionRating, setSessionRating] = useState<number | null>(null);
  const [sessionComment, setSessionComment] = useState('');
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [showTutorial, setShowTutorial] = useState(false);
  const [theme, setTheme] = useState<'default' | 'swiss' | 'paper'>(() => {
    return (localStorage.getItem('studyEngineTheme') as any) || 'default';
  });
  const [showSrsModal, setShowSrsModal] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('studyEngineTheme', theme);
  }, [theme]);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialProgress, setTutorialProgress] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showTutorial) {
      interval = setInterval(() => {
        setTutorialProgress(prev => {
          if (prev >= 100) {
            if (tutorialStep >= tutorialSteps.length - 1) {
              return 100; // Stay at 100% on the final step
            }
            setTutorialStep(s => s + 1);
            return 0;
          }
          return prev + 1.5; // Slightly faster progress
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [showTutorial, tutorialStep, tutorialSteps.length]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchHistory(currentUser.uid);
        
        // Load other user data from localStorage ONLY when signed in
        const savedNotes = localStorage.getItem('studyEngineNotes');
        if (savedNotes) {
          setNotes(savedNotes);
          setHasSavedNotes(true);
        }
        const savedSrs = localStorage.getItem('studyEngineSRS');
        if (savedSrs) setSrsPool(JSON.parse(savedSrs));
        const savedFeedback = localStorage.getItem('studyEngineFeedback');
        if (savedFeedback) setQuestionFeedbacks(JSON.parse(savedFeedback));
      } else {
        // Reset local state if signed out
        setNotes('');
        setHasSavedNotes(false);
        setSrsPool([]);
        setQuestionFeedbacks({});
        setQuizHistory([]);
        setMcqs([]);
        setIsTestComplete(false);
        setIsReviewMode(false);
      }
    });

    const tutorialSeen = localStorage.getItem('studyEngineTutorialSeen_v3');
    if (!tutorialSeen) {
      setShowTutorial(true);
    }

    return () => unsubscribe();
  }, []);

  const fetchHistory = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'quiz_sessions'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const history = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt
      }));
      setQuizHistory(history);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'quiz_sessions');
      // Fallback to local
      const savedHistory = localStorage.getItem('studyEngineHistory');
      if (savedHistory) setQuizHistory(JSON.parse(savedHistory));
    }
  };

  const handleSignIn = async () => {
    setShowAuthModal(true);
    setAuthMode('login');
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setShowAuthModal(false);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        console.log('Sign-in cancelled by user');
      } else {
        console.error('Sign-in error:', err);
      }
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await sendEmailVerification(userCredential.user);
        setShowAuthModal(false);
      } else if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        setShowAuthModal(false);
      } else if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, authEmail);
        setAuthError('Password reset email sent! Check your inbox.');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  useEffect(() => {
    if (user && Object.keys(questionFeedbacks).length > 0) {
      localStorage.setItem('studyEngineFeedback', JSON.stringify(questionFeedbacks));
    }
  }, [questionFeedbacks, user]);

  useEffect(() => {
    const trackVisit = async () => {
      try {
      const visitData: any = {
        sessionId,
        userAgent: navigator.userAgent,
        createdAt: serverTimestamp()
      };
      if (user) visitData.userId = user.uid;

      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      
      await addDoc(collection(db, 'visits'), {
        ...visitData,
        ip: data.ip || 'unknown',
        city: data.city || 'unknown',
        region: data.region || 'unknown',
        country: data.country_name || 'unknown',
        org: data.org || 'unknown'
      });
    } catch (err) {
      // Background analytics fail silently or with warnings
      console.warn('Analytics mapping failed:', err);
      // Fallback if IP API fails or is blocked
      try {
        const fallbackData: any = {
          sessionId,
          userAgent: navigator.userAgent,
          createdAt: serverTimestamp(),
          error: 'Failed to fetch geo data'
        };
        if (user) fallbackData.userId = user.uid;
        await addDoc(collection(db, 'visits'), fallbackData);
      } catch (innerErr) {
        // We don't use handleFirestoreError here to avoid crashing user flow for background visits
        console.error('Failed to track visit safely:', innerErr);
      }
    }
  };
  
  trackVisit();
}, [sessionId, user]);

  const saveNotes = () => {
    if (notes.trim() && user) {
      localStorage.setItem('studyEngineNotes', notes);
      setHasSavedNotes(true);
    }
  };

  const loadNotes = () => {
    if (!user) return;
    const saved = localStorage.getItem('studyEngineNotes');
    if (saved) {
      setNotes(saved);
    }
  };
  
  // Test State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isTestComplete, setIsTestComplete] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ strengths: string[], weaknesses: string[], suggestions: string[] } | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      const messages = [
        'Parsing Source Documentation...',
        'Identifying Key Themes...',
        'Extracting Core Concepts...',
        'Constructing Distractors...',
        'Verifying Technical Accuracy...',
        'Refining Framework...',
        'Finalizing Session...'
      ];
      let i = 0;
      interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setGeneratingMessage(messages[i]);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const invokeGemini = async (args: { prompt: string; systemInstruction?: string; config?: any }) => {
    // For Vercel or static deployments: Use client-side if VITE_GEMINI_API_KEY is provided via environment
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (viteKey) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: viteKey });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
          config: {
            systemInstruction: args.systemInstruction,
            ...args.config
          }
        });
        
        return response.text;
      } catch (err: any) {
        console.error('Client-side Gemini error:', err);
        throw new Error('Failed to generate with VITE_GEMINI_API_KEY. ' + (err.message || ''));
      }
    }

    // Default: use the Express backend proxy for security
    try {
      const response = await fetch('/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        console.error('API responded with error:', response.status, errorData);
        if (errorData.error && errorData.error.includes('API_KEY_INVALID')) {
          throw new Error('Your Gemini API key is invalid. Please check your AI Studio project settings or Vercel Environment Variables.');
        }
        throw new Error(`API Error (${response.status}): ${errorData.error || 'Failed to call backend'}`);
      }

      const data = await response.json();
      return data.text;
    } catch (err: any) {
      console.error('Gemini invocation error:', err);
      throw err;
    }
  };

  const generateMCQs = async () => {
    const combinedContent = (notes + '\n\n' + uploadedPdfText).trim();
    const wordCount = combinedContent ? combinedContent.split(/\s+/).length : 0;

    if (wordCount < 20) {
      setError('Please provide at least 20 words of study material for a quality quiz.');
      return;
    }
    
    setIsGenerating(true);
    setGeneratingMessage('Analyzing Content...');
    setError('');
    
    try {
      const { Type } = await import('@google/genai');
      
      const systemInstruction = `You are a senior subject matter expert and pedagogical researcher. Your goal is to construct high-fidelity multiple choice questions (MCQs) that rigorously evaluate mastery of the provided documentation.
${subject ? `The domain area is: ${subject}.` : ''}
Follow these directives strictly:
- Distractors MUST be plausible and based on common misconceptions within the domain.
- Avoid 'all of the above' or 'none of the above' options.
- Questions should be clear, unambiguous, and focused on a single technical concept.
- Complexity Level: ${difficulty}.
  - If EASY: Focus on basic recall, fundamental definitions, and direct facts from the text.
  - If MEDIUM: Focus on conceptual understanding, simple application, and connecting related ideas.
  - If HARD: Focus on synthesis, complex application, and critical analysis of nuances.
- Domain Coverage: Identify the structural themes in the source first, then ensure questions are distributed across those themes.
- Verification: Before outputting, verify that each correct answer is supported by the text and that the explanations provide technical depth.`;

      const promptText = `Construct exactly ${numQuestions} evaluation units based on the following documentation. Ensure they are varied and robust.
      
Source Documentation:
${combinedContent}`;
    
      const text = await invokeGemini({
        prompt: promptText,
        systemInstruction,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING, description: "The question text" },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "Exactly 4 plausible options"
                },
                correctIndex: { type: Type.INTEGER, description: "0-based index of the correct answer" },
                explanation: { type: Type.STRING, description: "A detailed explanation of why the correct answer is right and why popular distractors are wrong." }
              },
              required: ["question", "options", "correctIndex", "explanation"]
            }
          }
        }
      });
      
      const parsed = JSON.parse(text || '[]');
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        const parsedWithIds = parsed.map(mcq => {
          // Shuffle options logic
          const optionsWithCorrectness = mcq.options.map((opt: string, i: number) => ({
            text: opt,
            isCorrect: i === mcq.correctIndex
          }));
          
          // Fisher-Yates shuffle
          for (let i = optionsWithCorrectness.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithCorrectness[i], optionsWithCorrectness[j]] = [optionsWithCorrectness[j], optionsWithCorrectness[i]];
          }
          
          return { 
            id: crypto.randomUUID(),
            question: mcq.question,
            explanation: mcq.explanation,
            options: optionsWithCorrectness.map((o: any) => o.text),
            correctIndex: optionsWithCorrectness.findIndex((o: any) => o.isCorrect)
          };
        });

        setMcqs(parsedWithIds);
        setIsReviewMode(false);
        setCurrentQuestionIndex(0);
        setUserAnswers({});
        setIsTestComplete(false);
        setAiFeedback(null);
      } else {
        throw new Error('Invalid format returned');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to generate high-quality quiz. Please ensure your notes are comprehensive and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectOption = (optionIndex: number) => {
    if (isTestComplete) return;
    setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: optionIndex }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < mcqs.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      handleCompleteTest();
    }
  };

  const handleCompleteTest = async () => {
    setIsTestComplete(true);
    
    // Generate AI Feedback based on incorrect attempts
    const incorrectMcqs = mcqs.filter((mcq, idx) => userAnswers[idx] !== mcq.correctIndex);
    if (incorrectMcqs.length > 0) {
      generateFeedback(incorrectMcqs);
    } else {
      setAiFeedback({
        strengths: ["Mastery of all topics in this quiz!", "No gaps identified."],
        weaknesses: [],
        suggestions: ["Try increasing the difficulty or count for a greater challenge."]
      });
    }

    // Save to History
    const score = mcqs.reduce((acc, mcq, idx) => acc + (userAnswers[idx] === mcq.correctIndex ? 1 : 0), 0);
    const newSession: any = {
      sessionId,
      subject: subject || 'General Study',
      score,
      totalQuestions: mcqs.length,
      mcqs,
      userAnswers,
      createdAt: new Date().toISOString()
    };
    if (user) newSession.userId = user.uid;
    
    setQuizHistory(prev => {
      const updated = [newSession, ...prev].slice(0, 20);
      if (user) {
        localStorage.setItem('studyEngineHistory', JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await addDoc(collection(db, 'quiz_sessions'), {
        ...newSession,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quiz_sessions');
    }
    
    // Update SRS data
    if (mcqs.length > 0) {
      setSrsPool(prevPool => {
        const poolCopy = [...prevPool];
        
        mcqs.forEach((mcq, idx) => {
          if (userAnswers[idx] === undefined) return; // Didn't answer this one
          const isCorrect = userAnswers[idx] === mcq.correctIndex;
          
          const existingRecordIndex = poolCopy.findIndex(item => item.id === mcq.id);
          let record: MCQ = existingRecordIndex >= 0 ? { ...poolCopy[existingRecordIndex] } : {
             ...mcq,
             interval: 0,
             repetitions: 0,
             easeFactor: 2.5,
             nextReviewDate: Date.now()
          };
          
          if (isCorrect) {
            if (record.repetitions === 0) {
              record.interval = 1;
            } else if (record.repetitions === 1) {
              record.interval = 6;
            } else {
              record.interval = Math.round((record.interval || 1) * (record.easeFactor || 2.5));
            }
            record.repetitions = (record.repetitions || 0) + 1;
          } else {
            record.interval = 1;
            record.repetitions = 0;
            record.easeFactor = Math.max(1.3, (record.easeFactor || 2.5) - 0.2);
          }
          
          record.nextReviewDate = Date.now() + (record.interval * 24 * 60 * 60 * 1000);
          
          if (existingRecordIndex >= 0) {
            poolCopy[existingRecordIndex] = record;
          } else {
            poolCopy.push(record);
          }
        });
        
        if (user) {
          localStorage.setItem('studyEngineSRS', JSON.stringify(poolCopy));
        }
        return poolCopy;
      });
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const processPdf = async (file: File, password?: string) => {
    setIsParsingPDF(true);
    setParsingStatus(null);
    setError('');
    setPdfParsingError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        password: password
      });
      
      const pdf = await loadingTask.promise;
      
      if (pdf.numPages === 0) {
        throw new Error('EmptyPDF');
      }

      setParsingStatus({ current: 0, total: pdf.numPages });
      let tempExtractedText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        setParsingStatus({ current: i, total: pdf.numPages });
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        tempExtractedText += pageText + '\n';
      }

      if (!tempExtractedText.trim()) {
        // Start OCR
        setParsingStatus({ current: 0, total: pdf.numPages });
        setGeneratingMessage('Scanning document images for text (OCR)... this may take a moment.');
        
        let ocrText = '';
        const worker = await Tesseract.createWorker('eng');
        
        try {
          for (let i = 1; i <= pdf.numPages; i++) {
            setParsingStatus({ current: i, total: pdf.numPages });
            const page = await pdf.getPage(i);
            
            // Render page to canvas for OCR
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            if (context) {
              await (page.render({ canvasContext: context, viewport } as any) as any).promise;
              const { data: { text } } = await worker.recognize(canvas);
              ocrText += text + '\n';
            }
          }
          
          if (!ocrText.trim()) {
            setError('No readable text found, even with OCR. The document might be a low-quality scan or containing non-English text.');
            setUploadedFileName('');
            setUploadedPdfText('');
          } else {
            setUploadedPdfText(ocrText);
            setUploadedFileName(file.name);
            setError(''); 
          }
        } finally {
          await worker.terminate();
        }
      } else {
        setUploadedPdfText(tempExtractedText);
        setUploadedFileName(file.name);
      }
      setShowPasswordModal(false);
      setPdfPassword('');
      setPdfFile(null);
    } catch (err: any) {
      console.error('PDF Parsing Error:', err);
      if (err.name === 'PasswordException') {
        if (password) {
           setPdfParsingError('Incorrect password. Please try again.');
        }
        setPdfFile(file);
        setShowPasswordModal(true);
      } else if (err.name === 'InvalidPDFException' || err.message === 'EmptyPDF') {
        setError('Format Error: The file you uploaded is not a valid PDF or is empty. Please check the document.');
        setUploadedFileName('');
        setUploadedPdfText('');
      } else if (err.name === 'MissingPDFException') {
        setError('Network/Access Error: The PDF file is missing or could not be accessed by the browser.');
        setUploadedFileName('');
        setUploadedPdfText('');
      } else if (err.message?.includes('stream')) {
        setError('Corruption Detected: The PDF stream appears corrupted. Try re-saving the document or using a different PDF tool.');
        setUploadedFileName('');
        setUploadedPdfText('');
      } else {
        setError(`Processing Error: ${err.message || 'An unexpected error occurred while reading the PDF.'}`);
        setUploadedFileName('');
        setUploadedPdfText('');
      }
    } finally {
      setIsParsingPDF(false);
      setParsingStatus(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic size check (e.g., 20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      setError('File is too large. Please upload a PDF smaller than 20MB.');
      return;
    }

    await processPdf(file);
    // Reset the input so the same file could be uploaded again if needed
    e.target.value = '';
  };

  const generateFeedback = async (incorrectMcqs: MCQ[]) => {
    setIsGeneratingFeedback(true);
    try {
      const prompt = `Based on the following explanations for multiple choice questions the user answered incorrectly, analyze their performance.
Output ONLY valid JSON in this exact structure:
{
  "strengths": ["Identify 1-2 areas where they did well, even if overall score was low"],
  "weaknesses": ["Identify specific technical or conceptual gaps demonstrated"],
  "suggestions": ["Specific, actionable study advice or review topics"]
}
Explanations of missed questions:
${incorrectMcqs.map(m => m.explanation).join('\n')}`;

      const text = await invokeGemini({ prompt });
      const cleanJson = text?.replace(new RegExp('```json\\n?|```', 'g'), '').trim() || '{}';
      const parsed = JSON.parse(cleanJson);
      
      setAiFeedback(parsed);
    } catch (err) {
      setAiFeedback({
        strengths: ['Keep going! Practice makes perfect.'],
        weaknesses: ['Review the specific questions below.'],
        suggestions: ['Try generating a quiz with more questions on the topics you missed.']
      });
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleQuestionFeedback = async (mcqId: string, helpful: boolean) => {
    setQuestionFeedbacks(prev => ({
      ...prev,
      [mcqId]: { ...prev[mcqId], mcqId, isHelpful: helpful }
    }));

    try {
      const data: any = {
        mcqId,
        sessionId,
        isHelpful: helpful,
        createdAt: serverTimestamp()
      };
      if (user) data.userId = user.uid;
      await addDoc(collection(db, 'question_feedback'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'question_feedback');
    }
  };

  const handleFlagQuestion = async (mcqId: string) => {
    const isNowFlagged = !questionFeedbacks[mcqId]?.isFlagged;
    setQuestionFeedbacks(prev => ({
      ...prev,
      [mcqId]: { ...prev[mcqId], mcqId, isFlagged: isNowFlagged }
    }));

    try {
      const data: any = {
        mcqId,
        sessionId,
        isFlagged: isNowFlagged,
        createdAt: serverTimestamp()
      };
      if (user) data.userId = user.uid;
      await addDoc(collection(db, 'question_feedback'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'question_feedback');
    }
  };

  const handleSessionRating = async (rating: number) => {
    setSessionRating(rating);
    try {
      const data: any = {
        sessionId,
        rating,
        comment: sessionComment,
        createdAt: serverTimestamp()
      };
      if (user) data.userId = user.uid;
      await addDoc(collection(db, 'session_feedback'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'session_feedback');
    }
  };

  const handleSubmitFeedback = async () => {
    if (sessionRating === null) return;
    try {
      const data: any = {
        sessionId,
        rating: sessionRating,
        comment: sessionComment,
        createdAt: serverTimestamp()
      };
      if (user) data.userId = user.uid;
      await addDoc(collection(db, 'session_feedback'), data);
      setSessionRating(null);
      setSessionComment('');
      setShowFeedbackModal(false); // or show a toast
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'session_feedback');
    }
  };

  const handleViewSession = (session: any) => {
    setMcqs(session.mcqs);
    setUserAnswers(session.userAnswers);
    setIsTestComplete(true);
    setIsReviewMode(true);
    setShowHistoryModal(false);
  };

  const retakeQuiz = () => {
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setIsTestComplete(false);
    setAiFeedback(null);
    setSessionRating(null);
    setSessionComment('');
    setSessionId(crypto.randomUUID());
  };

  const resetAll = () => {
    setNotes('');
    setUploadedPdfText('');
    setUploadedFileName('');
    setMcqs([]);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setIsTestComplete(false);
    setIsReviewMode(false);
    setAiFeedback(null);
    setIsGeneratingFeedback(false);
    setSessionRating(null);
    setSessionComment('');
    setSessionId(crypto.randomUUID());
  };

  const dueQuestions = srsPool.filter(record => record.nextReviewDate && record.nextReviewDate <= Date.now());

  const startReview = () => {
    const toReview = dueQuestions.slice(0, 20); // review up to 20 at a time
    if (toReview.length > 0) {
      setMcqs(toReview);
      setCurrentQuestionIndex(0);
      setUserAnswers({});
      setIsTestComplete(false);
      setIsReviewMode(true);
      setError('');
      setAiFeedback(null);
    }
  };

  const calculateScore = () => {
    let score = 0;
    mcqs.forEach((mcq, idx) => {
      if (userAnswers[idx] === mcq.correctIndex) score++;
    });
    return score;
  };

  const updateSrsItem = (id: string, updates: Partial<MCQ>) => {
    setSrsPool(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          const newItem = { ...item, ...updates };
          if ('interval' in updates && !('nextReviewDate' in updates)) {
            newItem.nextReviewDate = Date.now() + (newItem.interval || 0) * 24 * 60 * 60 * 1000;
          }
          return newItem;
        }
        return item;
      });
      if (user) {
        localStorage.setItem('studyEngineSRS', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const resetSrsItem = (id: string) => {
    setSrsPool(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            interval: 0,
            repetitions: 0,
            easeFactor: 2.5,
            nextReviewDate: Date.now()
          };
        }
        return item;
      });
      if (user) {
        localStorage.setItem('studyEngineSRS', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const removeSrsItem = (id: string) => {
    setSrsPool(prev => {
      const updated = prev.filter(item => item.id !== id);
      if (user) {
        localStorage.setItem('studyEngineSRS', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const resetAllSrs = () => {
    if (confirm('Are you sure you want to reset all SRS data? This cannot be undone.')) {
      setSrsPool([]);
      if (user) {
        localStorage.setItem('studyEngineSRS', JSON.stringify([]));
      }
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-app-bg)] text-[var(--color-app-fg)] selection:bg-white/20 flex flex-col font-sans">
      
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 px-4 sm:px-6 py-6 md:py-12">
        
        {/* Global Cinematic Filter */}
      <style>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .cinematic-scanline {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(to bottom, transparent, rgba(56,189,248,0.03) 50%, transparent);
          pointer-events: none;
          z-index: 1000;
          animation: scanline 8s linear infinite;
        }
      `}</style>
      {showTutorial && <div className="cinematic-scanline" />}
      
      <header className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-12 sm:mb-16 border-b border-white/[0.03] pb-8 relative group">
          {/* Subtle accent light */}
          <div className="absolute bottom-0 left-0 w-24 h-[1px] bg-gradient-to-r from-app-accent to-transparent" />
          
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-5 cursor-default"
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-app-surface border border-white/5 flex items-center justify-center text-app-accent shadow-2xl overflow-hidden">
                <BookOpen size={22} strokeWidth={1.5} />
                <motion.div 
                  animate={{ opacity: [0.1, 0.3, 0.1] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute inset-0 bg-app-accent/20 blur-xl"
                />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-app-accent rounded-full border-2 border-app-bg" />
            </div>
            
            <div>
              <h1 className="text-2xl font-black italic tracking-tighter text-[var(--color-app-fg)] leading-none mb-1 text-glow">
                LOCK <span className="text-app-accent non-italic font-medium opacity-80">iNN</span>
              </h1>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse" />
                <p className="text-[9px] text-app-muted font-bold uppercase tracking-[0.3em]">
                  Autonomous Node <span className="opacity-40">v2.4.0</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                <span className="text-[7px] font-black uppercase tracking-[0.1em] text-emerald-500 opacity-80">Security: Proxy & Rules Active</span>
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => {
                setTutorialStep(0);
                setTutorialProgress(0);
                setShowTutorial(true);
              }}
              className="flex items-center gap-2 p-2 hover:bg-app-accent/10 border border-transparent hover:border-app-accent/20 rounded-xl transition-all group"
              title="Systems Intelligence Guide"
            >
              <Sparkles size={18} className="text-app-accent group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.5)] transition-all" />
            </button>

            <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-full border border-white/5">
              {[
                { id: 'default', icon: <Moon size={14} />, label: 'Tech' },
                { id: 'swiss', icon: <Sun size={14} />, label: 'Swiss' },
                { id: 'paper', icon: <Palette size={14} />, label: 'Paper' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as any)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                    theme === t.id 
                    ? 'bg-app-accent text-app-accent-fg shadow-lg' 
                    : 'text-app-muted hover:text-white hover:bg-white/5'
                  }`}
                  title={`${t.label} Theme`}
                >
                  {t.icon}
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              ))}
            </div>

            {user ? (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 bg-[var(--color-app-surface)] hover:bg-app-accent/10 border border-app-border rounded-2xl pl-3 pr-2 py-2 transition-colors group/user"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-black text-[var(--color-app-fg)] uppercase tracking-wider leading-none mb-0.5">{user.displayName}</p>
                  <p className="text-[8px] text-app-accent/60 font-mono uppercase tracking-[0.2em] flex items-center justify-end gap-1">
                    <span className="w-1 h-1 rounded-full bg-app-accent" />
                    Verified
                  </p>
                </div>
                <div className="relative">
                  <img 
                    src={user.photoURL || undefined} 
                    alt={user.displayName || 'User'} 
                    className="w-9 h-9 rounded-xl border border-app-border group-hover/user:border-app-accent/40 transition-colors object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button 
                    onClick={handleSignOut}
                    className="absolute -bottom-1 -right-1 w-5 h-5 bg-[var(--color-app-bg)] border border-app-border rounded-lg flex items-center justify-center text-app-muted hover:text-red-400 hover:border-red-400/50 transition-all opacity-0 group-hover/user:opacity-100 scale-90 group-hover/user:scale-100"
                    title="Terminate Session"
                  >
                    <LogOut size={10} />
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSignIn}
                className="flex items-center gap-2 px-6 py-2.5 bg-app-surface border border-app-border hover:border-app-accent/50 text-[10px] font-bold text-app-fg rounded-full uppercase tracking-widest transition-all"
              >
                Sign In
              </motion.button>
            )}
          </div>
        </header>

        <div className="flex-1">
        <AnimatePresence mode="wait">
          {mcqs.length === 0 ? (
            <motion.div 
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {dueQuestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 bg-[var(--color-app-surface)] border border-[var(--color-app-border)] rounded shadow-[4px_4px_0_0_var(--color-app-border)] flex flex-col sm:flex-row items-center justify-between gap-4 mb-8"
                >
                  <div className="space-y-1 text-center sm:text-left">
                     <h2 className="text-xs font-bold text-[var(--color-app-accent)] flex items-center justify-center sm:justify-start gap-2 uppercase tracking-wider">
                      <Clock size={14} />
                      Daily Review Ready
                    </h2>
                    <p className="text-xs text-[var(--color-app-fg)] opacity-70">
                      You have <strong className="text-[var(--color-app-accent)]">{dueQuestions.length}</strong> questions ready for review.
                    </p>
                  </div>
                  <button
                    onClick={startReview}
                    className="flex-shrink-0 flex items-center gap-2 px-6 py-2 bg-[var(--color-app-accent)] hover:opacity-90 text-white text-xs font-bold rounded-full transition-all uppercase"
                  >
                    Start Review <ChevronRight size={14} />
                  </button>
                </motion.div>
              )}

                <div className="space-y-10">
                <div className="space-y-2">
                  <h2 className="text-lg font-bold flex items-center gap-2 uppercase tracking-tight text-app-accent">
                    <Activity size={18} />
                    Source Input
                  </h2>
                  <p className="text-xs text-app-muted font-medium">
                    Import your study material to construct a review session.
                  </p>
                </div>

                <motion.div 
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: {
                        staggerChildren: 0.1
                      }
                    }
                  }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                  <motion.div 
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 }
                    }}
                    className="space-y-3"
                  >
                    <label htmlFor="num-questions" className="flex items-center text-[10px] font-bold text-app-muted uppercase tracking-widest">
                      Evaluation Depth
                      <InfoTooltip content="Determines the number of generated assessment nodes. Higher depth provides more comprehensive coverage." />
                    </label>
                    <motion.input
                      whileFocus={{ scale: 1.01, borderColor: 'var(--color-app-accent)', boxShadow: '0 0 25px rgba(56,189,248,0.15)' }}
                      id="num-questions"
                      type="number"
                      min="1"
                      max="50"
                      value={numQuestions}
                      onChange={(e) => setNumQuestions(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                      className="w-full bg-app-surface border border-app-border rounded-xl px-4 py-3 text-sm focus:border-app-accent outline-none transition-all no-spin text-app-fg"
                      disabled={isGenerating}
                    />
                  </motion.div>
                  
                  <motion.div 
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 }
                    }}
                    className="space-y-3"
                  >
                    <label htmlFor="difficulty" className="flex items-center text-[10px] font-bold text-app-muted uppercase tracking-widest">
                      Structural Complexity
                      <InfoTooltip content="Calibrates the linguistic and conceptual difficulty of the exercise." />
                    </label>
                    <motion.select
                      whileFocus={{ scale: 1.01, borderColor: 'var(--color-app-accent)', boxShadow: '0 0 25px rgba(56,189,248,0.15)' }}
                      id="difficulty"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="w-full bg-app-surface border border-app-border rounded-xl px-4 py-3 text-sm focus:border-app-accent outline-none transition-all cursor-pointer text-app-fg hover:border-white/20"
                      disabled={isGenerating}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </motion.select>
                  </motion.div>

                  <motion.div 
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 }
                    }}
                    className="space-y-3"
                  >
                    <label htmlFor="subject" className="block text-[10px] font-bold text-app-muted uppercase tracking-widest">Domain Area (Optional)</label>
                    <motion.input
                      whileFocus={{ scale: 1.01, borderColor: 'var(--color-app-accent)', boxShadow: '0 0 25px rgba(56,189,248,0.15)' }}
                      id="subject"
                      type="text"
                      placeholder="e.g. Biology, Law..."
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-app-surface border border-app-border rounded-xl px-4 py-3 text-sm focus:border-app-accent outline-none transition-all text-app-fg"
                      disabled={isGenerating}
                    />
                  </motion.div>

                  <motion.div 
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 }
                    }}
                    className="space-y-3"
                  >
                    <label className="flex items-center text-[10px] font-bold text-app-muted uppercase tracking-widest">
                      Review Logic
                      <InfoTooltip content="Diagnostic Mode provides instant feedback. Flashcards focus on memorization and retention analysis." />
                    </label>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setIsFlashcardMode(!isFlashcardMode)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                        isFlashcardMode 
                          ? 'border-app-accent bg-app-accent/10 text-app-accent shadow-[0_0_15px_rgba(56,189,248,0.1)]' 
                          : 'border-app-border bg-app-surface text-app-muted'
                      }`}
                      disabled={isGenerating}
                    >
                      <span className="text-sm font-bold">{isFlashcardMode ? 'Flashcards Enabled' : 'Diagnostic Mode'}</span>
                      <Activity size={16} className={isFlashcardMode ? 'opacity-100' : 'opacity-30'} />
                    </motion.button>
                  </motion.div>
                </motion.div>

                   <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <label className="block text-[10px] font-bold text-app-muted uppercase tracking-widest">Enter Notes</label>
                    <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
                      {Object.keys(questionFeedbacks).length > 0 && (
                        <button
                          onClick={() => setShowFeedbackModal(true)}
                          className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-app-fg hover:text-app-accent bg-app-surface border border-app-border rounded-full transition-all uppercase"
                        >
                          <AlertCircle size={12} />
                          My Reports ({Object.values(questionFeedbacks).filter((f: QuestionFeedback) => f.isFlagged).length})
                        </button>
                      )}
                      <input 
                        type="file" 
                        accept="application/pdf"
                        id="pdf-upload"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isParsingPDF || isGenerating}
                      />
                      <label 
                        htmlFor="pdf-upload"
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-bold text-app-fg hover:text-app-accent bg-app-surface border border-app-border rounded-xl transition-all uppercase"
                      >
                        {isParsingPDF ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                        <span className="truncate">
                          {isParsingPDF 
                            ? (parsingStatus ? `Page ${parsingStatus.current}/${parsingStatus.total}` : 'Parsing...') 
                            : 'PDF'}
                        </span>
                      </label>
                      {hasSavedNotes && (
                        <button
                          onClick={loadNotes}
                          disabled={isGenerating || isParsingPDF}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-bold text-app-fg hover:text-app-accent bg-app-surface border border-app-border rounded-xl transition-all uppercase"
                        >
                          <Download size={12} />
                          Load
                        </button>
                      )}
                      <button
                        onClick={saveNotes}
                        disabled={isGenerating || isParsingPDF || !notes.trim()}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-bold text-app-fg hover:text-app-accent bg-app-surface border border-app-border rounded-xl transition-all uppercase"
                      >
                        <Save size={12} />
                        Save
                      </button>
                    </div>
                  </div>

                  {isParsingPDF && parsingStatus && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 bg-app-surface border border-app-border rounded-xl space-y-3"
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                        <span className="flex items-center gap-2 text-app-accent text-xs">
                          <Loader2 size={12} className="animate-spin" />
                          {parsingStatus.current === parsingStatus.total ? 'Finalizing...' : 'Parsing Document'}
                        </span>
                        <span className="text-app-fg">
                          {Math.round((parsingStatus.current / parsingStatus.total) * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-app-bg rounded-full overflow-hidden border border-app-border">
                        <motion.div 
                          className="h-full bg-app-accent shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${(parsingStatus.current / parsingStatus.total) * 100}%` }}
                          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-app-muted font-mono uppercase">
                        <span>Page {parsingStatus.current} of {parsingStatus.total}</span>
                        <span>{uploadedFileName || 'Processing...'}</span>
                      </div>
                    </motion.div>
                  )}

                  {uploadedFileName && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center justify-between p-3 bg-app-surface border border-app-border rounded-xl"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="bg-app-accent p-1.5 rounded-lg text-black">
                          <FileText size={14} />
                        </div>
                        <span className="text-xs font-bold text-app-accent truncate">
                          {uploadedFileName}
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          setUploadedFileName('');
                          setUploadedPdfText('');
                        }}
                        className="text-app-muted hover:text-red-500 transition-colors p-1"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  )}

                  <div className="relative group">
                    <motion.textarea
                      whileFocus={{ scale: 1.002 }}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Paste your study material here (at least 20 words)..."
                      className="w-full h-64 md:h-80 bg-app-surface border border-app-border rounded-2xl p-5 text-sm focus:border-app-accent focus:shadow-[0_0_20px_rgba(56,189,248,0.05)] outline-none transition-all resize-none shadow-sm text-app-fg leading-relaxed"
                      disabled={isGenerating || isParsingPDF}
                    />
                    <div className="absolute bottom-4 right-5 flex items-center gap-2 text-[10px] font-bold text-app-muted uppercase tracking-wider bg-app-bg/80 backdrop-blur px-2 py-1 rounded-md border border-app-border group-focus-within:border-app-accent transition-colors">
                      <BookOpen size={10} />
                      {notes.trim() ? notes.trim().split(/\s+/).length : 0} Words
                    </div>
                  </div>
                </div>
                
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs flex items-center gap-2 font-mono"
                  >
                    <AlertCircle size={14} />
                    [ERR]: {error}
                  </motion.div>
                )}

                <div className="flex flex-col sm:flex-row justify-end pt-4 gap-4">
                    <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={generateMCQs}
                    disabled={isGenerating || (!notes.trim() && !uploadedPdfText.trim())}
                    className="w-full sm:w-auto flex items-center gap-3 px-10 py-4 bg-app-accent text-app-accent-fg rounded-full font-bold hover:opacity-90 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(56,189,248,0.2)] active:scale-95 uppercase tracking-wider justify-center"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>{generatingMessage}...</span>
                      </>
                    ) : (
                      <>
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        >
                          <Activity size={18} />
                        </motion.div>
                        <span>Initialize Session</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : !isTestComplete ? (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8 flex-1 flex flex-col"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="w-full sm:flex-1">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-[10px] font-bold text-app-muted uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-app-accent animate-pulse" />
                      Session Node: {currentQuestionIndex + 1} / {mcqs.length}
                    </h2>
                    <span className="text-[10px] font-bold text-[var(--color-app-accent)] uppercase tracking-widest">
                      {mcqs.length - currentQuestionIndex - 1} pending
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[var(--color-app-border)] rounded-full overflow-hidden">
                    <motion.div 
                      className="bg-[var(--color-app-accent)] h-full rounded-full"
                      initial={{ width: `${(currentQuestionIndex / mcqs.length) * 100}%` }}
                      animate={{ width: `${((currentQuestionIndex + 1) / mcqs.length) * 100}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                </div>
                
                <motion.button 
                  whileHover={{ scale: 1.05, backgroundColor: 'rgba(239, 68, 68, 0.15)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={resetAll}
                  className="w-full sm:w-auto px-4 py-2 text-[10px] font-bold text-app-muted hover:text-red-500 transition-all uppercase tracking-widest flex items-center justify-center gap-2 border border-transparent hover:border-red-900/20 bg-red-900/10 rounded-xl"
                >
                  <LogOut size={12} />
                  End Early
                </motion.button>
              </div>

              <div className="space-y-6 flex-1">
                <div className="bg-[var(--color-app-surface)] border border-[var(--color-app-border)] rounded-3xl p-6 md:p-10 shadow-xl shadow-white/5">
                  <h3 className="text-lg md:text-xl font-bold text-[var(--color-app-fg)] leading-relaxed mb-8">
                    {mcqs[currentQuestionIndex].question}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {mcqs[currentQuestionIndex].options.map((option, idx) => {
                      const userAnswer = userAnswers[currentQuestionIndex];
                      const isSelected = userAnswer === idx;
                      const isAnswered = userAnswer !== undefined;
                      const isCorrect = mcqs[currentQuestionIndex].correctIndex === idx;
                      
                      let appearanceClass = 'bg-[var(--color-app-bg)] border-[var(--color-app-border)] text-[var(--color-app-muted)] hover:border-white/20 hover:text-[var(--color-app-fg)]';
                      let iconClass = 'bg-transparent border-[var(--color-app-border)] text-[var(--color-app-muted)]';
                      
                      if (isFlashcardMode && isAnswered) {
                        if (isCorrect) {
                          appearanceClass = 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400';
                          iconClass = 'bg-emerald-500 border-emerald-500 text-black';
                        } else if (isSelected) {
                          appearanceClass = 'bg-red-500/10 border-red-500/50 text-red-400';
                          iconClass = 'bg-red-500 border-red-500 text-black';
                        }
                      } else if (isSelected) {
                        appearanceClass = 'bg-white/10 border-[var(--color-app-accent)] text-[var(--color-app-fg)]';
                        iconClass = 'bg-[var(--color-app-accent)] border-[var(--color-app-accent)] text-black';
                      }

                      return (
                        <motion.button
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.03)' }}
                          whileTap={{ scale: 0.995 }}
                          onClick={() => handleSelectOption(idx)}
                          disabled={isAnswered && isFlashcardMode}
                          className={`w-full text-left p-4 border-2 rounded-2xl transition-all flex items-center gap-4 relative overflow-hidden group ${appearanceClass}`}
                        >
                          <div className={`w-7 h-7 flex items-center justify-center shrink-0 border-2 rounded-lg text-xs font-bold transition-colors ${iconClass}`}>
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <span className="text-sm font-medium flex-1 relative z-10">{option}</span>
                          {isFlashcardMode && isAnswered && isCorrect && <CheckCircle2 size={18} className="text-emerald-500 relative z-10" />}
                          
                          {isFlashcardMode && isAnswered && isSelected && !isCorrect && <X size={18} className="text-red-500 relative z-10" />}
                          
                          {isSelected && (
                            <motion.div 
                              layoutId="active-option-bg"
                              className="absolute inset-0 bg-white/[0.03] pointer-events-none"
                            />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  <AnimatePresence>
                    {isFlashcardMode && userAnswers[currentQuestionIndex] !== undefined && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="mt-8 p-6 bg-white/5 border border-white/10 rounded-2xl space-y-3 shadow-2xl shadow-black/20"
                      >
                        <div className="flex items-center gap-2 text-[var(--color-app-accent)] text-[10px] font-bold uppercase tracking-widest">
                          <Activity size={14} className="animate-pulse" />
                          Detailed Analysis
                        </div>
                        <p className="text-sm leading-relaxed opacity-80 italic">
                          {mcqs[currentQuestionIndex].explanation}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between px-2 gap-6">
                  <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                    {currentQuestionIndex > 0 ? (
                      <button
                        onClick={handlePrevious}
                        className="px-4 py-3 text-[10px] font-bold text-app-muted hover:text-app-accent transition-all uppercase tracking-widest border border-app-border rounded-xl"
                      >
                        Back
                      </button>
                    ) : <div className="hidden sm:block w-16" />}
                    
                    <motion.button
                      whileHover={{ scale: 1.05, color: '#fff' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNext}
                      className="px-4 py-3 text-[10px] font-bold text-app-muted transition-all uppercase tracking-widest flex items-center gap-2"
                    >
                      <SkipForward size={14} />
                      Skip
                    </motion.button>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(56,189,248,0.25)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleNext}
                    disabled={userAnswers[currentQuestionIndex] === undefined}
                    className="w-full sm:w-auto px-10 py-4 bg-app-accent text-app-accent-fg text-xs font-bold hover:opacity-90 transition-all disabled:opacity-30 uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(56,189,248,0.2)] rounded-full group"
                  >
                     <span>{currentQuestionIndex === mcqs.length - 1 ? 'Finish Quiz' : 'Next Question'}</span>
                     <motion.div
                       animate={{ x: [0, 4, 0] }}
                       transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                     >
                       <ChevronRight size={16} />
                     </motion.div>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12 pb-20"
            >
              <div className="text-center space-y-8">
                <div className="inline-block px-3 py-1 bg-app-surface text-app-accent border border-app-border rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
                  {isReviewMode ? 'Operational Review' : 'Performance Data'}
                </div>
                
                <div className="relative w-48 h-48 mx-auto">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                    <circle
                      cx="60"
                      cy="60"
                      r="54"
                      className="fill-none stroke-app-border"
                      strokeWidth="6"
                    />
                    <motion.circle
                      cx="60"
                      cy="60"
                      r="54"
                      className="fill-none stroke-app-accent"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 54}
                      initial={{ strokeDashoffset: 2 * Math.PI * 54 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 54 * (1 - calculateScore() / mcqs.length) }}
                      transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-extrabold tracking-tighter text-app-fg">{Math.round((calculateScore() / mcqs.length) * 100)}%</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-app-fg">
                    {calculateScore()} / {mcqs.length} Correct
                  </h2>
                  <p className="max-w-md mx-auto text-app-muted text-sm leading-relaxed px-4 font-medium">
                    {(() => {
                      const percentage = Math.round((calculateScore() / mcqs.length) * 100);
                      if (percentage === 100) return 'Phenomenal! You have mastered the material.';
                      if (percentage >= 90) return 'Outstanding work! Almost perfect retention.';
                      if (percentage >= 80) return 'Great job! You have a solid grasp of the concepts.';
                      if (percentage >= 70) return 'Good effort! Some review will help solidify your understanding.';
                      if (percentage >= 50) return 'Passable. Let\'s focus on the areas you missed.';
                      return 'Take this as a learning opportunity. Review the explanations below.';
                    })()}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-app-muted uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <Clock size={12} />
                    Adaptive Logic Active
                  </div>
                </div>
              </div>

              <div className="max-w-3xl mx-auto space-y-8 sm:space-y-12">
                {isGeneratingFeedback ? (
                  <div className="p-8 text-center bg-app-surface border border-app-border rounded-3xl flex flex-col items-center justify-center space-y-4 shadow-xl">
                    <Activity className="w-8 h-8 text-app-accent animate-pulse" />
                    <div className="text-[10px] font-bold text-app-muted uppercase tracking-[0.3em]">Synthesizing Performance Metrics...</div>
                  </div>
                ) : aiFeedback ? (
                  <div className="space-y-8 sm:space-y-12">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {/* Strengths */}
                      <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                          <CheckCircle2 size={12} />
                          Strengths
                        </div>
                        <ul className="space-y-2">
                          {aiFeedback.strengths.map((s, i) => (
                            <li key={i} className="text-sm font-medium text-emerald-200/80 leading-snug">• {s}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Weaknesses */}
                      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-red-400 uppercase tracking-widest">
                          <AlertCircle size={12} />
                          Target Gaps
                        </div>
                        <ul className="space-y-2">
                          {aiFeedback.weaknesses.map((w, i) => (
                            <li key={i} className="text-sm font-medium text-red-200/80 leading-snug">• {w}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Suggestions */}
                      <div className="p-6 bg-app-fg text-app-bg rounded-3xl space-y-3 shadow-xl">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-80">
                          <Activity size={12} />
                          Strategy
                        </div>
                        <ul className="space-y-2">
                          {aiFeedback.suggestions.map((s, i) => (
                            <li key={i} className="text-sm font-bold leading-snug">• {s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="p-8 bg-app-surface border border-app-border rounded-3xl space-y-6">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                        <div className="space-y-1 text-center sm:text-left">
                          <h4 className="text-xs font-bold text-app-fg">Session Integrity</h4>
                          <p className="text-[10px] text-app-muted uppercase tracking-wider">Your feedback helps refine sequencing</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => handleSessionRating(star)}
                              className={`p-2 transition-all hover:scale-110 ${sessionRating && sessionRating >= star ? 'text-app-accent' : 'text-app-muted opacity-40'}`}
                            >
                              <Activity size={20} fill={sessionRating && sessionRating >= star ? 'currentColor' : 'none'} />
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {sessionRating !== null && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-4 pt-4 border-t border-app-border"
                        >
                          <textarea
                            value={sessionComment}
                            onChange={(e) => setSessionComment(e.target.value)}
                            placeholder="Any suggestions or thoughts on how we can improve?"
                            className="w-full bg-app-bg border border-app-border rounded-2xl p-4 text-xs text-app-fg focus:border-app-accent outline-none transition-all resize-none h-24"
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={handleSubmitFeedback}
                              className="px-6 py-2 bg-app-accent text-app-accent-fg text-[10px] font-bold rounded-full uppercase tracking-widest hover:opacity-90 transition-all"
                            >
                              Confirm Feedback
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col sm:flex-row justify-between items-center bg-app-surface/50 border-b border-app-border pb-4 gap-4 px-2">
                  <h3 className="text-[10px] font-bold text-app-muted uppercase tracking-widest">Question Summary</h3>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button 
                      onClick={retakeQuiz}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 hover:bg-app-accent hover:text-white text-app-accent bg-app-surface border border-app-accent/30 rounded-full transition-all text-[10px] font-bold uppercase tracking-widest"
                    >
                      <RotateCcw size={14} />
                      Retake
                    </button>
                    <button 
                      onClick={resetAll}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 hover:bg-red-500/10 hover:text-red-500 text-app-muted bg-app-surface border border-app-border rounded-full transition-all text-[10px] font-bold uppercase tracking-widest"
                    >
                      <X size={14} />
                      Reset
                    </button>
                  </div>
                </div>

                <div className="space-y-10">
                  {mcqs.map((mcq, idx) => {
                    const userAnswer = userAnswers[idx];
                    const isCorrect = userAnswer === mcq.correctIndex;
                    const isUnanswered = userAnswer === undefined;

                    return (
                      <div key={idx} className="bg-app-surface border border-app-border rounded-3xl p-8 space-y-6 shadow-sm">
                        <div className="flex gap-6">
                          <div className={`mt-1 shrink-0 ${isCorrect ? 'text-emerald-500' : isUnanswered ? 'text-app-muted' : 'text-red-500'}`}>
                            {isCorrect ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                          </div>
                          <div className="space-y-6 w-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                               <div>
                                 <span className="text-[10px] font-bold text-app-muted uppercase tracking-widest mb-2 block">Node Data {idx+1}</span>
                                 <p className="text-base sm:text-lg font-bold text-app-fg leading-relaxed">{mcq.question}</p>
                               </div>
                               <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                 <button 
                                   onClick={() => handleQuestionFeedback(mcq.id, true)}
                                   className={`p-2 rounded-lg border transition-all ${questionFeedbacks[mcq.id]?.isHelpful === true ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-app-bg border-app-border text-app-muted hover:text-emerald-500 hover:border-emerald-500/50'}`}
                                   title="Helpful"
                                 >
                                   <CheckCircle2 size={14} />
                                 </button>
                                 <button 
                                   onClick={() => handleFlagQuestion(mcq.id)}
                                   className={`p-2 rounded-lg border transition-all ${questionFeedbacks[mcq.id]?.isFlagged ? 'bg-red-500 border-red-500 text-white' : 'bg-app-bg border-app-border text-app-muted hover:text-red-500 hover:border-red-500/50'}`}
                                   title="Report Error"
                                 >
                                   <AlertCircle size={14} />
                                 </button>
                               </div>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-2">
                              {mcq.options.map((opt, oIdx) => {
                                const isThisCorrect = mcq.correctIndex === oIdx;
                                const isThisSelected = userAnswer === oIdx;
                                
                                let style = "border-app-border text-app-muted bg-app-bg";
                                if (isThisCorrect) style = "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-bold";
                                else if (isThisSelected) style = "border-red-500/50 bg-red-500/10 text-red-400 font-bold";

                                return (
                                  <div key={oIdx} className={`px-5 py-3 border rounded-xl text-sm flex items-center gap-3 transition-all ${style}`}>
                                    <span className="text-[10px] opacity-50 font-bold">[{String.fromCharCode(65 + oIdx)}]</span>
                                    {opt}
                                    {isThisSelected && !isThisCorrect && (
                                      <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-red-500/20 text-red-500 rounded-full">INCORRECT</span>
                                    )}
                                    {isThisCorrect && (
                                      <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-500/20 text-emerald-500 rounded-full">CORRECT</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <div className="p-5 bg-app-bg rounded-2xl border border-app-border">
                              <span className="font-bold text-app-accent uppercase text-[10px] tracking-widest block mb-2">Explanation</span>
                              <div className="text-sm text-app-fg font-medium leading-relaxed">{mcq.explanation}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          100% {
            transform: translateX(200%);
          }
        }
      `}</style>

      {/* Feedback Modal */}
      <AnimatePresence>
        {showFeedbackModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFeedbackModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-app-bg border border-app-border rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-app-border flex justify-between items-center bg-app-surface">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-red-500/20 text-red-500 flex items-center justify-center">
                    <AlertCircle size={16} />
                  </div>
                  <h3 className="font-bold text-app-fg">Flagged Content</h3>
                </div>
                <button 
                  onClick={() => setShowFeedbackModal(false)}
                  className="p-2 text-app-muted hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {Object.values(questionFeedbacks).filter((f: QuestionFeedback) => f.isFlagged).length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <CheckCircle2 size={40} className="mx-auto text-app-muted opacity-20" />
                    <p className="text-sm text-app-muted">No flagged questions yet. Your reports will appear here.</p>
                  </div>
                ) : (
                  (Object.values(questionFeedbacks) as QuestionFeedback[])
                    .filter((f: QuestionFeedback) => f.isFlagged)
                    .map((item: QuestionFeedback, i: number) => {
                      // Attempt to find the question in SRS pool if available
                      const relatedMcq = srsPool.find(m => m.id === item.mcqId);
                      return (
                        <div key={i} className="p-4 bg-app-surface border border-app-border rounded-2xl space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Flagged Question</span>
                            <button 
                              onClick={() => {
                                setQuestionFeedbacks(prev => {
                                  const next = { ...prev };
                                  delete next[item.mcqId];
                                  return next;
                                });
                              }}
                              className="text-[10px] text-app-muted hover:text-red-500 underline"
                            >
                              Remove
                            </button>
                          </div>
                          <p className="text-xs font-medium text-app-fg leading-relaxed italic opacity-80">
                            {relatedMcq ? relatedMcq.question : `Question ID: ${item.mcqId.substring(0, 8)}...`}
                          </p>
                          <div className="text-[10px] text-app-muted flex items-center gap-2">
                             <Clock size={10} /> Reported on {new Date().toLocaleDateString()}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
              <div className="p-6 border-t border-app-border bg-app-surface text-center">
                <p className="text-[10px] text-app-muted uppercase tracking-widest">
                  Reports help refine the structural sequencing logic in your personal session
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mt-auto py-12 border-t border-app-border bg-app-surface/30 backdrop-blur-sm futuristic-border">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-3 justify-center md:justify-start"
            >
              <div className="w-6 h-6 rounded bg-app-accent flex items-center justify-center text-app-accent-fg shadow-[0_0_10px_rgba(56,189,248,0.2)]">
                <BookOpen size={12} />
              </div>
              <span className="text-sm font-bold tracking-tight text-app-fg uppercase">LOCK iNN</span>
            </motion.div>
            <p className="text-[10px] text-app-muted font-bold uppercase tracking-[0.2em] max-w-xs leading-relaxed">
              Empowering students with <span className="text-app-accent">autonomous</span> learning nodes.
            </p>
          </div>

          <div className="flex flex-col items-center md:items-end gap-6">
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-x-8 gap-y-4">
              <motion.a 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                href="mailto:contact@pratrxx.com" 
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              >
                <Mail size={14} />
                Contact
              </motion.a>
              <motion.a 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                href="https://github.com/pratrxx" 
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              >
                <Github size={14} />
                Source
              </motion.a>
              <motion.a 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                href="https://youtube.com/@pratrxx" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
              >
                <Youtube size={14} />
                Videos
              </motion.a>
              <motion.button 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                onClick={() => setShowTutorial(true)}
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              >
                <Activity size={14} className="text-app-accent hover:animate-pulse" />
                Tutorial
              </motion.button>
              <motion.button 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                onClick={() => setShowHistoryModal(true)}
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              >
                <Clock size={14} />
                History
              </motion.button>
              <motion.button 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                onClick={() => {
                  setTutorialStep(0);
                  setTutorialProgress(0);
                  setShowTutorial(true);
                }}
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              >
                <Sparkles size={14} className="text-app-accent" />
                Systems Guide
              </motion.button>
              <motion.button 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                onClick={() => setShowSrsModal(true)}
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              >
                <Activity size={14} className="text-secondary-500" />
                Adaptive Pool
              </motion.button>
              <motion.button 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                onClick={() => setShowTermsModal(true)}
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              >
                <FileText size={14} />
                Terms
              </motion.button>
              <motion.button 
                whileHover={{ y: -2, color: 'var(--color-app-accent)' }}
                onClick={() => setShowAboutModal(true)}
                className="text-app-muted transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              >
                <PenTool size={14} />
                About
              </motion.button>
            </div>
            <div className="text-[48px] font-black italic text-app-accent/5 select-none pointer-events-none tracking-tighter pr-2 leading-none uppercase">
              pratrxx
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 pt-12 mt-8 border-t border-app-border/20 text-center">
          <p className="text-[9px] text-app-muted font-bold uppercase tracking-[0.4em] opacity-30">
            Node Systems &copy; {new Date().getFullYear()} • encrypted via pratrxx-alpha
          </p>
        </div>
      </footer>
      
      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center px-4 py-6 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#020202] backdrop-blur-2xl"
            />
            
            {/* Cinematic Background Narrative */}
            <div className="absolute inset-0 pointer-events-none">
               <motion.div 
                 animate={{ 
                   scale: [1, 1.2, 1],
                   opacity: [0.1, 0.2, 0.1]
                 }}
                 transition={{ duration: 10, repeat: Infinity }}
                 className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-app-accent/20 rounded-full blur-[150px]" 
               />
               <motion.div 
                 animate={{ 
                   scale: [1.2, 1, 1.2],
                   opacity: [0.05, 0.15, 0.05]
                 }}
                 transition={{ duration: 15, repeat: Infinity }}
                 className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-500/10 rounded-full blur-[150px]" 
               />
               
               {/* Noise Overlay */}
               <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] blend-overlay" />
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full min-h-screen flex flex-col items-center justify-center px-4 py-6 sm:px-6 overflow-y-auto"
            >
              <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
                
                {/* Visual Projection Side */}
                <div className="relative aspect-square max-w-[280px] sm:max-w-none mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 bg-app-accent/5 rounded-full blur-3xl animate-pulse" />
                  
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tutorialStep}
                      initial={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
                      transition={{ duration: 0.6 }}
                      className="relative z-10"
                    >
                      <div className="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 rounded-[4rem] bg-[#111] border border-white/5 flex items-center justify-center shadow-2xl relative overflow-hidden group">
                        {/* Internal Glow */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-app-accent/10 to-transparent pointer-events-none" />
                        
                        <motion.div 
                          animate={{ 
                            y: [0, -10, 0],
                          }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                          className="relative z-30"
                        >
                          {tutorialSteps[tutorialStep].icon && React.cloneElement(tutorialSteps[tutorialStep].icon as React.ReactElement, { size: window.innerWidth < 640 ? 70 : 120, strokeWidth: 0.5, className: 'drop-shadow-[0_0_20px_rgba(56,189,248,0.4)]' })}
                        </motion.div>
                        
                        {/* Glitch Overlay */}
                        <motion.div 
                           animate={{ opacity: [0, 0.1, 0] }}
                           transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3 }}
                           className="absolute inset-0 bg-app-accent z-40 mix-blend-overlay"
                        />

                        {/* Scanner Beam */}
                        <motion.div 
                          animate={{ top: ['-10%', '110%'] }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-app-accent/50 to-transparent z-20 blur-sm"
                        />
                      </div>
                    </motion.div>
                  </AnimatePresence>
                  
                  {/* Rotating HUD Elements */}
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                    className="absolute w-[110%] h-[110%] border border-app-accent/10 rounded-full border-dashed"
                  />
                </div>

                {/* Information Delivery Side */}
                <div className="space-y-12">
                  <header id="tutorial-header" className="space-y-6">
                    <div className="flex items-center gap-4">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: 48 }}
                        className="h-[2px] bg-app-accent shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                      />
                      <span className="text-[11px] font-black uppercase tracking-[0.6em] text-app-accent/80">Transmission {tutorialStep + 1}</span>
                    </div>
                    
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={tutorialStep}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="space-y-6"
                      >
                        <h2 className="text-3xl sm:text-5xl md:text-7xl font-black italic text-white tracking-tighter leading-[0.9]">
                          {tutorialSteps[tutorialStep].title.split(' ').map((word, i) => (
                            <span key={i} className={i === tutorialSteps[tutorialStep].title.split(' ').length - 1 ? 'text-app-accent drop-shadow-[0_0_15px_rgba(56,189,248,0.3)]' : ''}>
                              {word}{' '}
                            </span>
                          ))}
                        </h2>
                        <p className="text-base sm:text-xl text-app-muted font-medium leading-relaxed max-w-md">
                          {tutorialSteps[tutorialStep].content}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </header>

                  {/* Progress Controls */}
                  <div className="space-y-6">
                    <div className="flex gap-2 h-1.5 w-full bg-app-border/20 rounded-full overflow-hidden">
                      {tutorialSteps.map((_, i) => (
                        <div key={i} className="flex-1 overflow-hidden">
                          <div className={`h-full transition-colors ${i < tutorialStep ? 'bg-app-accent opacity-40' : 'bg-transparent'}`}>
                            {i === tutorialStep && (
                              <motion.div 
                                className="h-full bg-app-accent shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                                style={{ width: `${tutorialProgress}%` }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex gap-6">
                        <button 
                          onClick={() => {
                            localStorage.setItem('studyEngineTutorialSeen_v3', 'true');
                            setShowTutorial(false);
                          }}
                          className="text-[10px] font-bold text-app-muted uppercase tracking-[0.3em] hover:text-white transition-colors"
                        >
                          Terminate Playback
                        </button>
                      </div>

                      <div className="flex gap-3">
                        {tutorialStep > 0 && (
                          <button 
                             onClick={() => {
                               setTutorialStep(tutorialStep - 1);
                               setTutorialProgress(0);
                             }}
                             className="w-10 h-10 rounded-full border border-app-border flex items-center justify-center text-app-muted hover:border-app-accent hover:text-app-accent transition-all"
                             title="Previous Step"
                          >
                            <ChevronRight className="rotate-180" size={16} />
                          </button>
                        )}
                        
                        {tutorialStep < tutorialSteps.length - 1 ? (
                          <button 
                             onClick={() => {
                               setTutorialStep(tutorialStep + 1);
                               setTutorialProgress(0);
                             }}
                             className="px-6 h-10 rounded-full bg-app-accent text-app-accent-fg text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 hover:opacity-90 transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                          >
                            Proceed
                            <ChevronRight size={14} />
                          </button>
                        ) : (
                          <button 
                             onClick={() => {
                               localStorage.setItem('studyEngineTutorialSeen_v3', 'true');
                               setShowTutorial(false);
                             }}
                             className="px-6 h-10 rounded-full bg-app-accent text-app-accent-fg text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 hover:opacity-90 transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                          >
                            Initialize Environment
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistoryModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-app-bg border border-app-border rounded-3xl overflow-hidden shadow-2xl p-8 space-y-8"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-app-accent flex items-center justify-center text-app-accent-fg shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-app-fg">Quiz History</h3>
                    <p className="text-[10px] text-app-accent font-bold uppercase tracking-widest">{user ? `${user.displayName}'s Nodes` : 'Revisit your learning nodes'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!user && (
                    <span className="text-[8px] text-red-400 font-bold uppercase tracking-widest mr-4">Sign in to sync history</span>
                  )}
                  <button 
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 text-app-muted hover:text-white transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {quizHistory.length === 0 ? (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-12 h-12 rounded-full border-2 border-app-border flex items-center justify-center mx-auto opacity-20">
                      <Clock size={24} />
                    </div>
                    <p className="text-sm text-app-muted font-medium">No saved sessions yet. Start a quiz to see it here!</p>
                    {!user && (
                      <button 
                        onClick={() => { setShowHistoryModal(false); handleSignIn(); }}
                        className="text-[10px] text-app-accent font-bold uppercase tracking-widest hover:underline"
                      >
                        Sign in to sync your account
                      </button>
                    )}
                  </div>
                ) : (
                  quizHistory.map((session, idx) => (
                    <motion.div 
                      key={session.id || session.sessionId || idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ scale: 1.01, x: 4, backgroundColor: 'rgba(255,255,255,0.03)' }}
                      whileTap={{ scale: 0.995 }}
                      className="group bg-app-surface border border-app-border rounded-2xl p-6 flex items-center justify-between hover:border-app-accent/50 transition-all cursor-pointer"
                      onClick={() => handleViewSession(session)}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-app-fg truncate max-w-[200px]">{session.subject}</span>
                          <span className="text-[10px] px-2 py-0.5 bg-app-accent/10 text-app-accent rounded-full font-bold uppercase tracking-widest">
                            {Math.round((session.score / session.totalQuestions) * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-app-muted font-bold uppercase tracking-widest">
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            {new Date(session.createdAt).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText size={10} />
                            {session.totalQuestions} Questions
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <ChevronRight size={18} className="text-app-muted group-hover:text-app-accent transition-colors" />
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {showAboutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAboutModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-app-bg border border-app-border rounded-3xl overflow-hidden shadow-2xl p-8 space-y-8"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-app-accent flex items-center justify-center text-app-accent-fg shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                    <PenTool size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-app-fg">About Creator</h3>
                    <p className="text-[10px] text-app-accent font-bold uppercase tracking-widest">Architect of LOCK iNN</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAboutModal(false)}
                  className="p-2 text-app-muted hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-widest">The Identity</h4>
                  <p className="text-sm text-app-fg leading-relaxed">
                    Developed by <span className="text-app-accent font-bold">pratrxx</span>, a visionary developer focused on bridging the gap between artificial intelligence and pedagogical excellence.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-app-muted uppercase tracking-widest">The Vision</h4>
                  <p className="text-sm text-app-fg leading-relaxed">
                    LOCK iNN (Learning Node v2.0) is designed to empower students through autonomous study nodes, providing instant feedback and personalized learning paths using state-of-the-art LLM architectures.
                  </p>
                </div>

                <div className="pt-4 flex flex-col gap-4">
                  <div className="flex gap-4">
                    <a href="https://github.com/pratrxx" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 bg-app-surface border border-app-border rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-app-accent transition-all">
                      <Github size={14} />
                      GitHub
                    </a>
                    <a href="https://youtube.com/@pratrxx" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 bg-app-surface border border-app-border rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-app-accent transition-all">
                      <Youtube size={14} />
                      YouTube
                    </a>
                    <a href="https://instagram.com/pratrxx" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 bg-app-surface border border-app-border rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-app-accent transition-all">
                      <Instagram size={14} />
                      Instagram
                    </a>
                  </div>
                  <button 
                    onClick={() => {
                      setShowAboutModal(false);
                      setTutorialStep(0);
                      setTutorialProgress(0);
                      setShowTutorial(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-app-accent/10 border border-app-accent/20 rounded-xl text-[10px] font-bold uppercase tracking-widest text-app-accent hover:bg-app-accent/20 transition-all"
                  >
                    <Sparkles size={14} />
                    Replay Systems Onboarding
                  </button>
                </div>
              </div>

              <div className="text-[60px] font-black italic text-app-accent/5 absolute bottom-4 right-4 select-none pointer-events-none tracking-tighter uppercase leading-none">
                pratrxx
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-app-bg border border-app-border rounded-3xl overflow-hidden shadow-2xl p-8 space-y-8"
            >
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="font-bold text-app-fg text-lg">
                    {authMode === 'login' ? 'Welcome Back' : authMode === 'signup' ? 'Create Account' : 'Reset Password'}
                  </h3>
                  <p className="text-[10px] text-app-accent font-bold uppercase tracking-widest">
                    {authMode === 'login' ? 'Secure Portal Access' : authMode === 'signup' ? 'Initialize Node Profile' : 'System Recovery'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowAuthModal(false)}
                  className="p-2 text-app-muted hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-app-muted uppercase tracking-widest pl-2">Email Address</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-app-surface border border-app-border rounded-xl p-4 text-xs text-app-fg focus:border-app-accent outline-none transition-all"
                    placeholder="nexus@example.com"
                  />
                </div>

                {authMode !== 'reset' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-app-muted uppercase tracking-widest pl-2">Password</label>
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full bg-app-surface border border-app-border rounded-xl p-4 text-xs text-app-fg focus:border-app-accent outline-none transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {authError && (
                  <p className={`text-[10px] font-bold uppercase tracking-wider text-center ${authError.includes('sent') ? 'text-green-400' : 'text-red-400'}`}>
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-4 bg-app-accent text-app-accent-fg text-[10px] font-bold rounded-xl uppercase tracking-widest hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <div className="w-4 h-4 border-2 border-app-accent-fg/30 border-t-app-accent-fg rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn size={14} />
                      {authMode === 'login' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Link'}
                    </>
                  )}
                </button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-app-border"></div></div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                  <span className="bg-app-bg px-4 text-app-muted font-bold">Or continue with</span>
                </div>
              </div>

              <button
                onClick={handleGoogleSignIn}
                className="w-full py-4 bg-app-surface border border-app-border hover:border-app-accent/30 text-app-fg text-[10px] font-bold rounded-xl uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                Google Network
              </button>

              <div className="text-center space-y-2">
                {authMode === 'login' ? (
                  <>
                    <p className="text-[10px] text-app-muted uppercase tracking-widest">
                      New user? <button onClick={() => { setAuthMode('signup'); setAuthError(null); }} className="text-app-accent hover:underline">Register Node</button>
                    </p>
                    <button onClick={() => { setAuthMode('reset'); setAuthError(null); }} className="text-[10px] text-app-muted uppercase tracking-widest hover:text-app-accent">Forgot password?</button>
                  </>
                ) : (
                  <p className="text-[10px] text-app-muted uppercase tracking-widest">
                    Existing member? <button onClick={() => { setAuthMode('login'); setAuthError(null); }} className="text-app-accent hover:underline">Access Portal</button>
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SRS Management Modal */}
      <AnimatePresence>
        {showSrsModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSrsModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-app-bg border border-app-border rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-app-border flex justify-between items-center bg-app-surface">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-app-accent/20 text-app-accent flex items-center justify-center shadow-lg">
                    <Activity size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-app-fg tracking-tight">Adaptive Knowledge Pool</h3>
                    <p className="text-[10px] text-app-muted font-bold uppercase tracking-[0.2em] mt-1">Manage your personalized spaced repetition dataset</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {srsPool.length > 0 && (
                    <button 
                      onClick={resetAllSrs}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold rounded-full uppercase tracking-widest transition-all"
                    >
                      Reset All
                    </button>
                  )}
                  <button 
                    onClick={() => setShowSrsModal(false)}
                    className="p-2 text-app-muted hover:text-white transition-all bg-white/5 rounded-full"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
                {srsPool.length === 0 ? (
                  <div className="text-center py-20 space-y-4">
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-app-border flex items-center justify-center mx-auto opacity-20">
                      <Clock size={32} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-app-fg opacity-60">Your Knowledge Pool is Empty</p>
                      <p className="text-sm text-app-muted max-w-xs mx-auto">Missed questions will automatically populate here for future optimization.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-6">
                    {srsPool.map((item, idx) => (
                      <motion.div 
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        whileHover={{ scale: 1.005, borderColor: 'rgba(56, 189, 248, 0.2)' }}
                        className="p-6 bg-app-surface border border-app-border rounded-2xl group transition-all flex flex-col md:flex-row gap-8 items-start relative overflow-hidden"
                      >
                        {/* Status tag */}
                        <div className={`absolute top-0 right-0 px-3 py-1 text-[8px] font-black uppercase tracking-[0.2em] rounded-bl-xl ${item.nextReviewDate && item.nextReviewDate <= Date.now() ? 'bg-app-accent text-black' : 'bg-white/5 text-app-muted'}`}>
                          {item.nextReviewDate && item.nextReviewDate <= Date.now() ? 'Due for Review' : 'Scheduled'}
                        </div>

                        <div className="flex-1 space-y-4">
                          <p className="text-sm font-bold text-app-fg leading-relaxed">
                            {item.question}
                          </p>
                          <div className="flex flex-wrap gap-4 pt-2">
                             <div className="space-y-1">
                               <span className="text-[8px] font-black text-app-muted uppercase tracking-widest block">Interval (Days)</span>
                               <input 
                                 type="number" 
                                 value={item.interval || 0}
                                 onChange={(e) => updateSrsItem(item.id, { interval: Math.max(0, parseInt(e.target.value) || 0) })}
                                 className="w-20 bg-app-bg border border-app-border rounded-lg px-2 py-1.5 text-xs text-app-fg focus:border-app-accent outline-none"
                               />
                             </div>
                             <div className="space-y-1">
                               <span className="text-[8px] font-black text-app-muted uppercase tracking-widest block">Ease Factor</span>
                               <input 
                                 type="number" 
                                 step="0.1"
                                 value={item.easeFactor || 2.5}
                                 onChange={(e) => updateSrsItem(item.id, { easeFactor: Math.max(1.3, parseFloat(e.target.value) || 2.5) })}
                                 className="w-20 bg-app-bg border border-app-border rounded-lg px-2 py-1.5 text-xs text-app-fg focus:border-app-accent outline-none"
                               />
                             </div>
                             <div className="space-y-1">
                               <span className="text-[8px] font-black text-app-muted uppercase tracking-widest block">Repetitions</span>
                               <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-app-fg">
                                 {item.repetitions || 0}
                               </div>
                             </div>
                             <div className="space-y-1">
                               <span className="text-[8px] font-black text-app-muted uppercase tracking-widest block">Next Review</span>
                               <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-app-fg">
                                 {item.nextReviewDate ? new Date(item.nextReviewDate).toLocaleDateString() : 'N/A'}
                               </div>
                             </div>
                          </div>
                        </div>

                        <div className="flex md:flex-col gap-3 shrink-0 pt-4 md:pt-0">
                          <button 
                            onClick={() => resetSrsItem(item.id)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-app-surface border border-app-border hover:border-app-accent/50 text-[10px] font-bold text-app-fg rounded-xl uppercase tracking-widest transition-all"
                          >
                            <RotateCcw size={12} />
                            Reset Parameters
                          </button>
                          <button 
                            onClick={() => removeSrsItem(item.id)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 hover:bg-red-500/10 text-red-400 border border-transparent hover:border-red-500/30 text-[10px] font-bold rounded-xl uppercase tracking_widest transition-all"
                          >
                            <X size={12} />
                            Remove
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Terms & Conditions Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTermsModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-app-bg border border-app-border rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-app-border flex justify-between items-center bg-app-surface">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-app-accent/20 text-app-accent flex items-center justify-center shadow-lg">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-app-fg tracking-tight">Terms & Legal</h3>
                    <p className="text-[10px] text-app-muted font-bold uppercase tracking-[0.2em] mt-1">Operational guidelines & Intellectual Property</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowTermsModal(false)}
                  className="p-2 text-app-muted hover:text-white transition-all bg-white/5 rounded-full"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <section className="space-y-4">
                  <h4 className="flex items-center gap-2 text-[10px] font-black text-app-accent uppercase tracking-widest">
                    <Shield size={14} />
                    Copyright Claim
                  </h4>
                  <div className="p-6 rounded-2xl bg-app-accent/5 border border-app-accent/10">
                    <p className="text-sm text-app-fg leading-relaxed">
                      &copy; {new Date().getFullYear()} <span className="font-bold text-app-accent">pratrxx</span>. All Rights Reserved.
                    </p>
                    <p className="text-sm text-app-fg leading-relaxed mt-4">
                      The software known as <span className="font-bold">LOCK iNN</span> (v2.0), including its visual interface, underlying algorithms, specific pedagogical methodologies (Adaptive Study Nodes), and proprietary LLM orchestration patterns, is the sole intellectual property of <span className="font-bold">pratrxx</span>.
                    </p>
                    <p className="text-sm text-app-fg leading-relaxed mt-4">
                      Any unauthorized reproduction, modification, or distribution of this software, in part or in whole, is strictly prohibited and protected under international copyright law.
                    </p>
                  </div>
                </section>

                <section className="space-y-4">
                  <h4 className="flex items-center gap-2 text-[10px] font-black text-app-accent uppercase tracking-widest">
                    <CheckCircle2 size={14} />
                    Terms of Service
                  </h4>
                  <div className="space-y-4 text-sm text-app-fg/80 leading-relaxed">
                    <p>
                      1. <span className="font-bold text-app-fg">Usage License:</span> Users are granted a non-exclusive, non-transferable license to access and use the platform for personal, non-commercial educational purposes.
                    </p>
                    <p>
                      2. <span className="font-bold text-app-fg">Data Processing:</span> LOCK iNN utilizes artificial intelligence to process user-provided content. While we strive for accuracy, the output is for informational purposes and should be verified by the user.
                    </p>
                    <p>
                      3. <span className="font-bold text-app-fg">Account Security:</span> Users are responsible for maintaining the confidentiality of their node access credentials. pratrxx is not liable for unauthorized access resulting from user negligence.
                    </p>
                    <p>
                      4. <span className="font-bold text-app-fg">Service Availability:</span> We reserve the right to modify, suspend, or terminate the specialized study environment at any time without prior notice for system maintenance or security protocol updates.
                    </p>
                  </div>
                </section>

                <div className="pt-4 p-4 border border-app-border rounded-xl bg-app-surface/50">
                  <p className="text-[9px] text-app-muted uppercase tracking-widest text-center">
                    Document ID: LCKINN-LEG-2026-ALPHA
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowPasswordModal(false);
                setPdfFile(null);
                setPdfPassword('');
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-app-bg border border-app-border rounded-3xl overflow-hidden shadow-2xl p-8 space-y-6"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-app-accent/20 text-app-accent flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.2)]">
                  <Shield size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-app-fg tracking-tight">Protected Document</h3>
                  <p className="text-[10px] text-app-accent font-bold uppercase tracking-[0.2em]">Security Protocol Required</p>
                </div>
                <p className="text-sm text-app-muted leading-relaxed">
                  The document <span className="text-app-fg font-bold">"{pdfFile?.name}"</span> is encrypted. Enter the credential to initialize parsing.
                </p>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pdfFile) processPdf(pdfFile, pdfPassword);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-app-muted uppercase tracking-widest pl-2">Document Password</label>
                  <input
                    type="password"
                    autoFocus
                    required
                    value={pdfPassword}
                    onChange={(e) => setPdfPassword(e.target.value)}
                    className="w-full bg-app-surface border border-app-border rounded-xl p-4 text-xs text-app-fg focus:border-app-accent outline-none transition-all placeholder:text-app-muted/30"
                    placeholder="Enter security key..."
                  />
                </div>

                {pdfParsingError && (
                  <motion.p 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] font-bold uppercase tracking-wider text-center text-red-400"
                  >
                    {pdfParsingError}
                  </motion.p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPdfFile(null);
                      setPdfPassword('');
                    }}
                    className="flex-1 py-4 bg-app-surface border border-app-border text-app-fg text-[10px] font-bold rounded-xl uppercase tracking-widest hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isParsingPDF || !pdfPassword}
                    className="flex-1 py-4 bg-app-accent text-app-accent-fg text-[10px] font-bold rounded-xl uppercase tracking-widest hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isParsingPDF ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <LogIn size={14} />
                        Decipher
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(56, 189, 248, 0.2);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(56, 189, 248, 0.4);
        }
      `}</style>
      <PrivacyPolicy />
    </div>
  );
}
