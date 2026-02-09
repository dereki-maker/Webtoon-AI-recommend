"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase"; 
import Link from "next/link"; 

// --- 데이터 타입 정의 ---
interface Webtoon {
  title: string;
  platform: string;
  status: string;
  genres: string[];
  score: number;
}

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
  
  // 인증 관련 상태
  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const savedSeen = localStorage.getItem("seen-webtoons");
    if (savedSeen) setSeenList(JSON.parse(savedSeen));

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    let updatedSeen = [...seenList];
    if (results.length > 0) {
      const currentTitles = results.map(w => w.title);
      updatedSeen = Array.from(new Set([...updatedSeen, ...currentTitles]));
      setSeenList(updatedSeen);
      localStorage.setItem("seen-webtoons", JSON.stringify(updatedSeen));
    }

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userInput, seenList: updatedSeen }),
      });

      const data = await response.json();
      const rawResult = data.result || "";
      const cleanJson = rawResult.replace(/```json|```/g, "").trim();

      if (!cleanJson) throw new Error("AI 응답 비어있음");

      const parsedData = JSON.parse(cleanJson);
      if (parsedData.recommendations) {
        setResults(parsedData.recommendations);

        // 추천 결과 DB 저장 (Upsert)
        await supabase.from('webtoons').upsert(
          parsedData.recommendations.map((w: Webtoon) => ({
            title: w.title,
            platform: w.platform,
            genres: w.genres,
            ai_score: w.score,
            status: w.status
          })),
          { onConflict: 'title' }
        );
      }
    } catch (error) {
      console.error("추천 실패:", error);
      alert("추천 정보를 가져오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center p-6 md:p-20 font-sans relative">
      {/* 상단 네비게이션 섹션 */}
      <div className="absolute top-6 left-6 z-40">
        <Link href="/library" className="bg-white text-slate-600 text-[18px] font-bold px-6 py-2.5 rounded-full shadow-sm border border-slate-100 hover:bg-slate-50 transition-all flex items-center gap-2 active:scale-95">
          별점 저장소 📚
        </Link>
      </div>

      <div className="absolute top-6 right-6 z-40">
        {user ? (
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100">
            <span className="text-xs font-bold text-slate-600">{user.email}님</span>
            <button onClick={handleLogout} className="text-[10px] text-red-400 font-bold hover:text-red-600 transition-colors">로그아웃</button>
          </div>
        ) : (
          <button onClick={() => setIsAuthModalOpen(true)} className="bg-blue-600 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg hover:bg-blue-700 transition-all active:scale-95">로그인 / 회원가입</button>
        )}
      </div>

      <header className="text-center mb-12">
        <h1 className="text-5xl font-black text-blue-600 mb-4 tracking-tight">볼 거 없나</h1>
        <p className="text-slate-500 text-lg font-medium">취향을 입력하면 웹툰을 추천해드립니다.</p>
      </header>

      {/* 입력 폼 섹션 */}
      <section className="w-full max-w-2xl bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <textarea
            className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-400 outline-none text-slate-800 text-[20px] placeholder:text-slate-400 resize-none"
            rows={3}
            placeholder="어떤 스타일의 웹툰을 찾으시나요?"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className={`w-full font-bold py-4 rounded-2xl transition-all shadow-lg active:scale-95 ${results.length > 0 ? "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200" : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200"} disabled:bg-slate-300`}
          >
            {loading ? "분석 중..." : results.length > 0 ? "다시 추천받기 🔄" : "추천 받기 🚀"}
          </button>
        </form>
      </section>

      {/* 추천 결과 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-16 w-full max-w-6xl">
        {results.map((webtoon, index) => (
          <WebtoonCard key={`${webtoon.title}-${index}`} webtoon={webtoon} user={user} />
        ))}
      </div>

      {/* 통합 커뮤니티 보드 (추천된 모든 작품 리뷰 요약) */}
      {results.length > 0 && (
        <section className="w-full max-w-6xl mt-20 animate-in fade-in slide-in-from-bottom-5 duration-700">
          <CommunityBoard currentUser={user} recommendedTitles={results.map(r => r.title)} />
        </section>
      )}

      {isAuthModalOpen && <AuthModal onClose={() => setIsAuthModalOpen(false)} />}
    </main>
  );
}

// --- 인증 모달 컴포넌트 ---
function AuthModal({ onClose }: { onClose: () => void }) {
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("saved-email");
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isLoginView) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("회원가입 성공!");
      }
      if (rememberMe) localStorage.setItem("saved-email", email);
      else localStorage.removeItem("saved-email");
      onClose();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md p-8 rounded-[2.5rem] shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-300 hover:text-slate-600">✕</button>
        <h2 className="text-2xl font-black text-slate-900 mb-8">{isLoginView ? "다시 오셨군요! 👋" : "반가워요! ✨"}</h2>
        <form onSubmit={handleAuth} className="space-y-4">
          <input type="email" placeholder="이메일 주소" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-400 outline-none text-sm transition-all" />
          <input type="password" placeholder="비밀번호" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-400 outline-none text-sm transition-all" />
          <div className="flex items-center gap-2 px-1">
            <input type="checkbox" id="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="remember" className="text-xs font-bold text-slate-500 cursor-pointer">이메일 기억하기</label>
          </div>
          <button type="submit" disabled={authLoading} className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg disabled:bg-slate-300 mt-4">{authLoading ? "처리 중..." : (isLoginView ? "로그인" : "회원가입")}</button>
        </form>
        <button onClick={() => setIsLoginView(!isLoginView)} className="w-full mt-6 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors">{isLoginView ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}</button>
      </div>
    </div>
  );
}

// --- 커뮤니티 게시판 컴포넌트 ---
function CommunityBoard({ currentUser, recommendedTitles }: { currentUser: any, recommendedTitles: string[] }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'latest' | 'likes'>('latest');

  const fetchReviews = async () => {
    let query = supabase
      .from('feedbacks')
      .select('*')
      .in('webtoon_title', recommendedTitles);

    if (sortBy === 'likes') {
      query = query.order('likes', { ascending: false }).order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (!error) setReviews(data || []);
  };

  useEffect(() => {
    fetchReviews();
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feedbacks' },
        () => fetchReviews()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [recommendedTitles, sortBy]);

  const handleReaction = async (id: string, type: 'like' | 'dislike') => {
    if (!currentUser) return alert("로그인이 필요한 기능입니다!");
    const { error } = await supabase.from('reaction_logs').upsert({ 
      user_id: currentUser.id, 
      feedback_id: id, 
      reaction_type: type 
    });
    if (error) alert(`이미 평가하신 댓글입니다.`);
    else fetchReviews();
  };

  const handleReplySubmit = async (parentId: string, webtoonTitle: string, text: string) => {
    if (!text.trim()) return;
    const { error } = await supabase.from('feedbacks').insert([
      { webtoon_title: webtoonTitle, comment: text, user_id: currentUser.id, parent_id: parentId, rating: 0 }
    ]);
    if (!error) fetchReviews();
  };

  const parentReviews = reviews.filter(r => !r.parent_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 self-end mb-2">
        <button onClick={() => setSortBy('latest')} className={`text-[12px] font-bold px-3 py-1 rounded-full transition-all ${sortBy === 'latest' ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>최신순</button>
        <button onClick={() => setSortBy('likes')} className={`text-[12px] font-bold px-3 py-1 rounded-full transition-all ${sortBy === 'likes' ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>인기순 🔥</button>
      </div>

      {parentReviews.map((review) => (
        <ReviewItem key={review.id} review={review} replies={reviews.filter(r => r.parent_id === review.id)} currentUser={currentUser} onReaction={handleReaction} onReplySubmit={handleReplySubmit} refresh={fetchReviews} />
      ))}
      {parentReviews.length === 0 && <div className="text-center py-20 text-slate-300 font-bold">아직 리뷰가 없어요.</div>}
    </div>
  );
}

// --- 개별 리뷰 아이템 컴포넌트 ---
function ReviewItem({ review, replies, currentUser, onReaction, onReplySubmit, refresh }: any) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(review.comment);

  const TEXT_LIMIT = 80;
  const isMyPost = currentUser && currentUser.id === review.user_id;

  const handleUpdate = async () => {
    const { error } = await supabase.from('feedbacks').update({ comment: editContent }).eq('id', review.id);
    if (!error) { setIsEditing(false); refresh(); }
  };

  const handleDelete = async () => {
    if (!confirm("정말 이 리뷰를 삭제하시겠습니까?")) return;
    const { error } = await supabase.from('feedbacks').delete().eq('id', review.id);
    if (!error) refresh();
  };

  return (
    <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100 transition-all hover:shadow-md">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <Link href={`/community/${encodeURIComponent(review.webtoon_title)}`} className="text-[13px] font-black text-blue-500 uppercase tracking-tighter hover:underline">{review.webtoon_title}</Link>
          <div className="mt-1">
            {isEditing ? (
              <div className="space-y-2">
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-3 bg-slate-50 border-none rounded-xl text-[18px] outline-none focus:ring-1 focus:ring-blue-200" />
                <div className="flex gap-2 justify-end"><button onClick={() => setIsEditing(false)} className="text-[12px] font-bold text-slate-400">취소</button><button onClick={handleUpdate} className="text-[12px] font-bold text-blue-600">저장하기</button></div>
              </div>
            ) : (
              <>
                <p className="text-slate-800 font-medium text-[20px] leading-snug">{isExpanded ? review.comment : review.comment.slice(0, TEXT_LIMIT)}{!isExpanded && review.comment.length > TEXT_LIMIT && "..."}</p>
                {review.comment.length > TEXT_LIMIT && <button onClick={() => setIsExpanded(!isExpanded)} className="text-[13px] font-bold text-blue-400 mt-1 hover:underline">{isExpanded ? "접기" : "더 보기"}</button>}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-[10px] text-slate-300 font-bold">{new Date(review.created_at).toLocaleDateString()}</div>
          {isMyPost && !isEditing && (
            <div className="flex gap-2"><button onClick={() => setIsEditing(true)} className="text-[11px] font-bold text-slate-400 hover:text-blue-500">수정</button><button onClick={handleDelete} className="text-[11px] font-bold text-slate-400 hover:text-red-500">삭제</button></div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4">
        <button onClick={() => onReaction(review.id, 'like')} className="flex items-center gap-1.5 text-[15px] font-bold text-slate-400 hover:text-blue-500 transition-colors">👍 <span className="text-slate-900">{review.likes || 0}</span></button>
        <button onClick={() => onReaction(review.id, 'dislike')} className="flex items-center gap-1.5 text-[15px] font-bold text-slate-400 hover:text-red-500 transition-colors">👎 <span className="text-slate-900">{review.dislikes || 0}</span></button>
        <button onClick={() => setShowReplies(!showReplies)} className={`text-[15px] font-bold transition-colors ${showReplies ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>{showReplies ? "답글 닫기" : `답글 ${replies.length}개 보기`}</button>
      </div>
      {showReplies && (
        <div className="mt-4 pt-4 border-t border-slate-50 animate-in fade-in slide-in-from-top-2">
          {replies.map((reply: any) => (
            <div key={reply.id} className="ml-8 mt-4 pl-4 border-l-2 border-slate-100 py-1 flex justify-between items-start">
              <div className="flex-1"><p className="text-[15px] text-slate-600 font-medium">{reply.comment}</p><div className="text-[10px] text-slate-300 font-bold mt-1">{new Date(reply.created_at).toLocaleDateString()}</div></div>
              {currentUser && currentUser.id === reply.user_id && <button onClick={async () => { if(confirm("삭제?")) { await supabase.from('feedbacks').delete().eq('id', reply.id); refresh(); }}} className="text-[10px] font-bold text-slate-300 hover:text-red-400">삭제</button>}
            </div>
          ))}
          {currentUser ? (
            <div className="mt-6 flex gap-2"><input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="답글을 남겨주세요..." className="flex-1 p-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-200" /><button onClick={() => { onReplySubmit(review.id, review.webtoon_title, replyText); setReplyText(""); }} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition-all">등록</button></div>
          ) : <div className="mt-4 text-center text-[10px] text-slate-400 font-bold">답글을 남기려면 로그인이 필요합니다.</div>}
        </div>
      )}
    </div>
  );
}

// --- ⭐ 수정된 WebtoonCard 컴포넌트 (0.5 별점 시스템 & 링크 기능) ---
function WebtoonCard({ webtoon, user }: { webtoon: Webtoon, user: any }) {
  const [rating, setRating] = useState(0); 
  const [comment, setComment] = useState("");
  const [mySavedRating, setMySavedRating] = useState<number | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [userAvgRating, setUserAvgRating] = useState<number | null>(null);

  const getStorageKey = () => user ? `review-${user.id}-${webtoon.title}` : `review-guest-${webtoon.title}`;

  const fetchAverageRating = async () => {
    try {
      const { data, error } = await supabase.from('feedbacks').select('rating').eq('webtoon_title', webtoon.title).not('rating', 'eq', 0);
      if (!error && data && data.length > 0) {
        setUserAvgRating(data.reduce((acc, curr) => acc + curr.rating, 0) / data.length);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) setMySavedRating(parsed[0].rating);
    } else setMySavedRating(null);
    fetchAverageRating();
  }, [webtoon.title, user?.id]);

  const handleReviewSubmit = async () => {
    if (!user) return alert("로그인 필요!");
    if (rating === 0 || !comment.trim()) return alert("입력 필요!");
    try {
      const { error } = await supabase.from('feedbacks').insert([{ webtoon_title: webtoon.title, rating, comment, user_id: user.id }]);
      if (error) throw error;
      localStorage.setItem(getStorageKey(), JSON.stringify([{ rating, comment }]));
      setMySavedRating(rating);
      setShowFeedbackForm(false);
      fetchAverageRating();
      alert("성공적으로 기록되었습니다!");
    } catch (error) { alert("저장 실패"); }
  };

  return (
    <div className="bg-white p-7 rounded-[2rem] shadow-lg border border-slate-100 hover:shadow-2xl transition-all duration-300 flex flex-col min-h-[380px] relative group overflow-hidden">
      
      {/* 🖱️ [Link 추가] 작품 정보 영역 클릭 시 상세 커뮤니티 이동 */}
      <Link href={`/community/${encodeURIComponent(webtoon.title)}`} className="flex-1 cursor-pointer">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-md uppercase tracking-wider">{webtoon.platform}</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${webtoon.status === '완결' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>{webtoon.status}</span>
          </div>
        </div>

        <div className="flex justify-between items-start mb-3">
          <h3 className="text-[25px] font-black text-slate-900 leading-tight truncate flex-1 mr-2 group-hover:text-blue-600 transition-colors">
            {webtoon.title}
          </h3>
          <div className="flex flex-col items-end gap-1">
            <div className="text-[20px] font-black text-yellow-500">★ {webtoon.score.toFixed(1)}</div>
            {userAvgRating && (
              <div className="text-right border-t border-slate-50 pt-1">
                <span className="block text-[10px] font-black text-slate-400 uppercase leading-none">독자 별점</span>
                <div className="text-[18px] font-black text-slate-700"> 👤 {userAvgRating.toFixed(1)}</div>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-1 mb-4">
          {webtoon.genres.map((genre) => (
            <span key={genre} className="text-[14px] text-slate-400 font-semibold italic">#{genre}</span>
          ))}
        </div>
        <div className="text-[11px] font-bold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">상세 리뷰 보러가기 →</div>
      </Link>

      {/* 🔽 피드백 영역 (이벤트 전파 방지 처리) */}
      <div className="mt-auto pt-4 border-t border-slate-50 relative z-10">
        {mySavedRating !== null && !showFeedbackForm && (
          <div className="flex items-center justify-between bg-blue-600 text-white px-4 py-3 rounded-xl shadow-md">
            <span className="text-sm font-bold">내 별점</span>
            <span className="text-lg font-black flex items-center gap-1">★ {mySavedRating.toFixed(1)}</span>
          </div>
        )}

        {mySavedRating === null && !showFeedbackForm && (
          <div className="flex flex-col items-center py-1">
            <p className="text-[15px] font-bold text-slate-500 mb-2 italic">추천 결과가 마음에 드시나요?</p>
            <div className="flex gap-2 w-full">
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); alert("감사합니다! 😊"); }} className="flex-1 py-2.5 rounded-lg bg-slate-50 text-slate-400 text-[15px] font-bold hover:bg-slate-100">동의</button>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFeedbackForm(true); }} className="flex-1 py-2.5 rounded-lg bg-slate-900 text-white text-[15px] font-bold hover:bg-slate-800">비동의</button>
            </div>
          </div>
        )}

        {showFeedbackForm && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between px-1">
              {/* ⭐ 0.5 단위 별점 선택기 */}
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((starIdx) => (
                  <div key={starIdx} className="relative w-7 h-7 flex items-center justify-center">
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRating(starIdx - 0.5); }} className="absolute left-0 w-1/2 h-full z-20" />
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRating(starIdx); }} className="absolute right-0 w-1/2 h-full z-20" />
                    <span className={`text-2xl absolute pointer-events-none transition-all ${rating >= starIdx ? 'text-yellow-400' : (rating === starIdx - 0.5 ? 'text-yellow-400' : 'text-slate-200')}`}>
                      {rating === starIdx - 0.5 ? '⯪' : '★'}
                    </span>
                  </div>
                ))}
              </div>
              <span className="text-xs font-black text-blue-600">{rating.toFixed(1)}점</span>
            </div>
            <div className="relative">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="의견을 남겨주세요." className="w-full p-2.5 pr-10 text-[15px] bg-slate-50 border-none rounded-xl outline-none h-12 focus:ring-1 focus:ring-blue-100" />
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReviewSubmit(); }} className="absolute bottom-1.5 right-1.5 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-90 transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
            </div>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowFeedbackForm(false); }} className="w-full text-[15px] text-slate-400 font-bold hover:underline">취소</button>
          </div>
        )}
      </div>
    </div>
  );
}