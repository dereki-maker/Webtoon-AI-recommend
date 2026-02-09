"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase"; 

// 데이터 타입 정의
interface Webtoon {
  title: string;
  platform: string;
  status: string;
  genres: string[];
  score: number;
}

// 리뷰 데이터 타입
interface Review {
  rating: number;
  comment: string;
  date: string;
}

export default function Home() {
  const [userInput, setUserInput] = useState("");
  const [results, setResults] = useState<Webtoon[]>([]);
  const [loading, setLoading] = useState(false);
  const [seenList, setSeenList] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    // 세션 체크 (로그인 상태 확인)
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    getSession();

    // 로그인 상태 변화 감지 (실시간 동기화)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const savedSeen = localStorage.getItem("seen-webtoons");
    if (savedSeen) setSeenList(JSON.parse(savedSeen));

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
  if (!email || !email.includes('@')) {
    alert("올바른 이메일 주소를 입력해주세요!");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: email, // 사용자가 입력한 이메일 변수 사용
    options: {
      emailRedirectTo: window.location.origin,
    }
  });

  if (error) {
    alert("에러 발생: " + error.message);
  } else {
    alert(`${email}로 로그인 링크를 보냈어요! 메일함을 확인해주세요. 📧`);
  }
};

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userInput, seenList: seenList }),
      });
      const data = await response.json();
      const cleanJson = (data.result || "").replace(/```json|```/g, "").trim();
      const parsedData = JSON.parse(cleanJson);
      if (parsedData.recommendations) setResults(parsedData.recommendations);
    } catch (error) {
      console.error("추천 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExclude = (title: string) => {
    const updatedSeen = [...seenList, title];
    setSeenList(updatedSeen);
    localStorage.setItem("seen-webtoons", JSON.stringify(updatedSeen));
    handleSubmit(); 
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center p-6 md:p-20 font-sans relative">
      
      {/* 3. 상단 로그인 섹션 (추가) */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
  {user ? (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-slate-600">{user.email}님</span>
      <button onClick={handleLogout} className="text-[10px] bg-slate-200 text-slate-500 px-3 py-1.5 rounded-full font-bold">로그아웃</button>
    </div>
  ) : (
    <div className="flex gap-2">
      <input 
        type="email" 
        placeholder="이메일 입력" 
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="text-[10px] border border-slate-200 px-3 py-2 rounded-full outline-none focus:ring-1 focus:ring-blue-400"
      />
      <button onClick={handleLogin} className="bg-blue-600 text-white text-[10px] font-bold px-4 py-2 rounded-full shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
        로그인 링크 발송
      </button>
    </div>
  )}
</div>

      <header className="text-center mb-12">
        <h1 className="text-5xl font-black text-blue-600 mb-4 tracking-tight">볼 거 없나</h1>
        <p className="text-slate-500 text-lg font-medium">취향을 입력하면 웹툰을 추천해드립니다.</p>
      </header>

      <section className="w-full max-w-2xl bg-white p-8 rounded-3xl shadow-xl shadow-blue-100 border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <textarea
            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-400 outline-none transition-all text-slate-800 text-lg placeholder:text-slate-400 resize-none"
            rows={3}
            placeholder="뇌빼고 볼만한 거 추천해줘"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:bg-slate-300"
          >
            {loading ? "AI가 분석 중..." : "추천 리포트 생성하기"}
          </button>
        </form>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-16 w-full max-w-6xl">
        {results.map((webtoon, index) => (
          <WebtoonCard 
            key={`${webtoon.title}-${index}`} 
            webtoon={webtoon} 
            onExclude={() => handleExclude(webtoon.title)}
            isLoggedIn={!!user} // 4. 로그인 여부 전달
          />
        ))}
      </div>
    </main>
  );
}

// --- 개별 웹툰 카드 컴포넌트 ---
function WebtoonCard({ webtoon, onExclude, isLoggedIn }: { webtoon: Webtoon, onExclude: () => void, isLoggedIn: boolean }) {
  const [rating, setRating] = useState(0); 
  const [comment, setComment] = useState("");
  const [mySavedRating, setMySavedRating] = useState<number | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`review-${webtoon.title}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) setMySavedRating(parsed[0].rating);
    }
  }, [webtoon.title]);

  const handleReviewSubmit = async () => {
    // 5. 로그인 체크 로직 (추가)
    if (!isLoggedIn) {
      alert("로그인이 필요한 서비스입니다! 상단 버튼을 눌러주세요.");
      return;
    }

    if (rating === 0 || !comment.trim()) {
      alert("별점과 한줄평을 모두 남겨주세요!");
      return;
    }

    try {
      // 현재 세션의 유저 ID 가져오기
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('feedbacks')
        .insert([
          { 
            webtoon_title: webtoon.title, 
            rating: rating, 
            comment: comment,
            user_id: user?.id // 6. DB에 유저 ID 기록 (추가)
          }
        ]);

      if (error) throw error;

      const newReview = { rating, comment, date: new Date().toLocaleDateString() };
      const existing = JSON.parse(localStorage.getItem(`review-${webtoon.title}`) || "[]");
      localStorage.setItem(`review-${webtoon.title}`, JSON.stringify([newReview, ...existing]));
      
      setMySavedRating(rating);
      setComment("");
      setRating(0);
      setShowFeedbackForm(false);
      alert("성공적으로 기록되었습니다! 🚀");
    } catch (error) {
      console.error("DB 에러:", error);
      alert("데이터베이스 저장에 실패했습니다. (SQL user_id 컬럼을 확인하세요)");
    }
  };

  return (
    <div className="bg-white p-7 rounded-[2rem] shadow-lg border border-slate-100 hover:shadow-2xl transition-all duration-300 flex flex-col min-h-[380px] relative">
       {/* (기존 버튼 및 컨텐츠들...) */}
       <button 
        onClick={(e) => { e.stopPropagation(); onExclude(); }}
        className="absolute top-6 right-6 z-30 bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 text-[10px] font-bold px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
      >
        <span>이미 봄</span>
        <span className="text-xs">✕</span>
      </button>

      <div className="flex justify-between items-center mb-4 pr-16">
        <div className="flex flex-wrap gap-2">
          <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">{webtoon.platform}</span>
          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${webtoon.status === '완결' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>{webtoon.status}</span>
        </div>
      </div>

      <div className="flex justify-between items-baseline mb-2">
        <h3 className="text-2xl font-black text-slate-900 truncate flex-1">{webtoon.title}</h3>
        <div className="text-2xl font-black text-yellow-500 ml-2">★ {webtoon.score.toFixed(1)}</div>
      </div>
      
      <div className="flex flex-wrap gap-1.5 mb-6">
        {webtoon.genres.map((genre) => (
          <span key={genre} className="text-[10px] text-slate-400 font-semibold italic">#{genre}</span>
        ))}
      </div>

      <div className="mt-auto pt-6 border-t border-slate-50">
        {mySavedRating !== null && !showFeedbackForm && (
          <div className="flex items-center justify-between bg-blue-600 text-white px-5 py-4 rounded-2xl shadow-md">
            <span className="text-sm font-bold">내 별점</span>
            <span className="text-2xl font-black">★ {mySavedRating.toFixed(1)}</span>
          </div>
        )}

        {mySavedRating === null && !showFeedbackForm && (
          <div className="flex flex-col items-center py-2 animate-in fade-in slide-in-from-bottom-2">
            <p className="text-sm font-bold text-slate-600 mb-3">별점에 동의하십니까?</p>
            <div className="flex gap-2 w-full">
              <button onClick={() => alert("감사합니다! 😊")} className="flex-1 py-3 rounded-xl bg-slate-50 text-slate-400 text-sm font-bold hover:bg-emerald-50 hover:text-emerald-600 transition-colors">동의</button>
              <button onClick={() => setShowFeedbackForm(true)} className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-red-500 transition-colors">비동의</button>
            </div>
          </div>
        )}

        {showFeedbackForm && (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
               <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((starIdx) => (
                    <div key={starIdx} className="relative w-7 h-7 flex items-center justify-center">
                      <button onClick={() => setRating(starIdx - 0.5)} className="absolute left-0 w-1/2 h-full z-20" />
                      <button onClick={() => setRating(starIdx)} className="absolute right-0 w-1/2 h-full z-20" />
                      <span className={`text-2xl absolute pointer-events-none ${rating >= starIdx ? 'text-yellow-400' : (rating === starIdx - 0.5 ? 'text-yellow-400' : 'text-slate-200')}`}>
                        {rating === starIdx - 0.5 ? '⯪' : '★'}
                      </span>
                    </div>
                ))}
              </div>
              <span className="text-sm font-black text-blue-600">{rating.toFixed(1)}점</span>
            </div>
            <div className="relative">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="본인만의 의견을 남겨주세요." className="w-full p-3 pr-12 text-xs bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 outline-none resize-none h-16" />
              <button onClick={handleReviewSubmit} className="absolute bottom-2 right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
            <button onClick={() => setShowFeedbackForm(false)} className="w-full text-[10px] text-slate-400 font-bold hover:underline">취소</button>
          </div>
        )}
      </div>
    </div>
  );
}