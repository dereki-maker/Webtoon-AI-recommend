"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/utils/supabase";
import Link from "next/link";
import { NAVER_WEBTOON_DB } from "@/src/config/naver_data"; 

export default function CommunityDetailPage() {
  const params = useParams();
  const title = decodeURIComponent(params.title as string);
  
  const [user, setUser] = useState<any>(null);
  const [userAvgRating, setUserAvgRating] = useState<number>(0);
  const [reviewCount, setReviewCount] = useState(0);

  const webtoonInfo = useMemo(() => {
    const lines = NAVER_WEBTOON_DB.trim().split("\n");
    const foundLine = lines.find(line => line.includes(` ${title} |`));
    if (foundLine) {
      const parts = foundLine.split("|").map(s => s.trim());
      return {
        aiScore: parts[4]?.replace("점", ""),
        platform: parts[1],
        genres: parts[2]
      };
    }
    return null;
  }, [title]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    fetchStats();
  }, [title]);

  const fetchStats = async () => {
    const { data, error } = await supabase
      .from('feedbacks')
      .select('rating')
      .eq('webtoon_title', title)
      .not('rating', 'eq', 0);

    if (!error && data && data.length > 0) {
      const sum = data.reduce((acc, curr) => acc + curr.rating, 0);
      setUserAvgRating(sum / data.length);
      setReviewCount(data.length);
    } else {
      setUserAvgRating(0);
      setReviewCount(0);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* 좌측 상단 네비게이션 */}
      <nav className="p-6 flex gap-3 max-w-7xl mx-auto">
        <Link href="/" className="bg-white px-5 py-2 rounded-full shadow-sm text-[15px] font-bold text-slate-400 hover:text-blue-600 transition-all active:scale-95">홈으로 </Link>
        <Link href="/library" className="bg-white px-5 py-2 rounded-full shadow-sm text-[15px] font-bold text-slate-400 hover:text-blue-600 transition-all active:scale-95">📚 별점 저장소</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 mt-10">
        {/* 헤더 섹션: 제목(좌) / 별점(우-수직스택) */}
        <header className="mb-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-slate-100">
            <div className="flex-1">
              <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-tight">
                {title}
              </h1>
              <div className="flex items-center gap-3 mt-4">
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-md text-[10px] font-black uppercase tracking-tighter">
                  {webtoonInfo?.platform}
                </span>
                <span className="text-slate-400 text-sm font-medium">{webtoonInfo?.genres}</span>
              </div>
            </div>

            {/* 수직 배치된 별점 영역 */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest leading-none">AI 별점</span>
                <span className="text-3xl font-black text-slate-900 leading-none"> {webtoonInfo?.aiScore || "0.0"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none">독자 별점 ({reviewCount})</span>
                <span className="text-3xl font-black text-slate-900 leading-none"> {userAvgRating.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </header>

        {/* 게시판 영역 (제목 및 구분선 삭제) */}
        <section>
          <CommunityBoard currentUser={user} webtoonTitle={title} onUpdateStats={fetchStats} />
        </section>
      </div>
    </main>
  );
}

// --- 별점 선택 기능이 포함된 커뮤니티 게시판 ---
function CommunityBoard({ currentUser, webtoonTitle, onUpdateStats }: any) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'likes' | 'latest' | 'replies'>('likes');
  const [newComment, setNewComment] = useState("");
  const [newRating, setNewRating] = useState(0); 

  const fetchReviews = async () => {
    const { data, error } = await supabase.from('feedbacks').select('*').eq('webtoon_title', webtoonTitle);
    if (!error && data) {
      const sorted = [...data].sort((a, b) => {
        if (sortBy === 'likes') return (b.likes || 0) - (a.likes || 0);
        if (sortBy === 'latest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sortBy === 'replies') {
          const aR = data.filter(r => r.parent_id === a.id).length;
          const bR = data.filter(r => r.parent_id === b.id).length;
          return bR - aR;
        }
        return 0;
      });
      setReviews(sorted);
    }
  };

  useEffect(() => {
    fetchReviews();
    const channel = supabase.channel(`live-${webtoonTitle}`).on('postgres_changes', { event: '*', schema: 'public', table: 'feedbacks' }, () => {
      fetchReviews();
      onUpdateStats();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [webtoonTitle, sortBy]);

  const handleWriteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return alert("로그인 필요!");
    if (!newComment.trim()) return alert("내용을 입력해주세요!");

    const { error } = await supabase.from('feedbacks').insert([{ 
      webtoon_title: webtoonTitle, comment: newComment, user_id: currentUser.id, rating: newRating 
    }]);

    if (!error) {
      setNewComment("");
      setNewRating(0);
      fetchReviews();
      onUpdateStats();
    }
  };

  const handleReaction = async (id: string, type: 'like' | 'dislike') => {
    if (!currentUser) return alert("로그인이 필요합니다!");
    const { error } = await supabase.from('reaction_logs').upsert({ 
      user_id: currentUser.id, feedback_id: id, reaction_type: type 
    });
    if (error) alert("이미 평가하셨습니다.");
    else fetchReviews();
  };

  const handleReplySubmit = async (parentId: string, text: string) => {
    if (!text.trim()) return;
    const { error } = await supabase.from('feedbacks').insert([
      { webtoon_title: webtoonTitle, comment: text, user_id: currentUser.id, parent_id: parentId, rating: 0 }
    ]);
    if (!error) fetchReviews();
  };

  const parentReviews = reviews.filter(r => !r.parent_id);

  return (
    <div className="flex flex-col gap-10">
      {/* ✍️ 리뷰 작성 카드 (별점 0.5 단위 지원) */}
      <form onSubmit={handleWriteSubmit} className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Your Rating</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((starIdx) => (
                <div key={starIdx} className="relative w-7 h-7 flex items-center justify-center">
                  {/* 왼쪽 절반 (0.5점) */}
                  <button type="button" onClick={() => setNewRating(starIdx - 0.5)} className="absolute left-0 w-1/2 h-full z-20 cursor-pointer" />
                  {/* 오른쪽 절반 (1.0점) */}
                  <button type="button" onClick={() => setNewRating(starIdx)} className="absolute right-0 w-1/2 h-full z-20 cursor-pointer" />
                  {/* 별 아이콘 */}
                  <span className={`text-2xl absolute pointer-events-none transition-all ${newRating >= starIdx ? 'text-yellow-400' : (newRating === starIdx - 0.5 ? 'text-yellow-400' : 'text-slate-200')}`}>
                    {newRating === starIdx - 0.5 ? '⯪' : '★'}
                  </span>
                </div>
              ))}
            </div>
            {newRating > 0 && <span className="text-sm font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{newRating.toFixed(1)}점</span>}
          </div>

          <textarea 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={currentUser ? "작품에 대한 솔직한 리뷰를 들려주세요." : "로그인 후 리뷰를 남길 수 있습니다."}
            disabled={!currentUser}
            className="w-full p-6 bg-slate-50 border-none rounded-3xl focus:ring-2 focus:ring-blue-400 outline-none text-slate-800 text-lg resize-none h-32 transition-all"
          />
        </div>
        <div className="flex justify-end mt-4">
          <button type="submit" disabled={!currentUser || !newComment.trim()} className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:bg-slate-200">
            리뷰 등록
          </button>
        </div>
      </form>

      {/* 정렬 필터 */}
      <div className="flex justify-end gap-2 px-2">
        {[
          { id: 'likes', label: '인기순 🔥' },
          { id: 'latest', label: '최신순' },
          { id: 'replies', label: '답글순' }
        ].map((btn) => (
          <button key={btn.id} onClick={() => setSortBy(btn.id as any)} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${sortBy === btn.id ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-400 border border-slate-100"}`}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* 리뷰 리스트 */}
      <div className="space-y-6">
        {parentReviews.map((review) => (
          <ReviewItem 
            key={review.id} 
            review={review} 
            replies={reviews.filter(r => r.parent_id === review.id)}
            currentUser={currentUser}
            onReaction={handleReaction}
            onReplySubmit={handleReplySubmit}
            refresh={fetchReviews}
          />
        ))}
      </div>
    </div>
  );
}

// --- 개별 리뷰 아이템 ---
function ReviewItem({ review, replies, currentUser, onReaction, onReplySubmit, refresh }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(review.comment);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");

  const isMyPost = currentUser?.id === review.user_id;

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 transition-all hover:shadow-md">
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1">
          {review.rating > 0 && (
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-yellow-400 text-lg">★</span>
              <span className="text-sm font-black text-slate-800">{review.rating.toFixed(1)}</span>
            </div>
          )}
          {isEditing ? (
            <div className="space-y-3">
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl outline-none border-none text-lg" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setIsEditing(false)} className="text-xs font-bold text-slate-400">취소</button>
                <button onClick={async () => { await supabase.from('feedbacks').update({ comment: editContent }).eq('id', review.id); setIsEditing(false); refresh(); }} className="text-xs font-bold text-blue-600">저장</button>
              </div>
            </div>
          ) : (
            <p className="text-slate-800 text-xl font-medium leading-relaxed pr-6">{review.comment}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-slate-300 font-bold mb-2 uppercase tracking-tighter">{new Date(review.created_at).toLocaleDateString()}</div>
          {isMyPost && !isEditing && (
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsEditing(true)} className="text-[11px] font-bold text-slate-400 hover:text-blue-500">수정</button>
              <button onClick={async () => { if(confirm("삭제?")) { await supabase.from('feedbacks').delete().eq('id', review.id); refresh(); }}} className="text-[11px] font-bold text-slate-400 hover:text-red-500">삭제</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button onClick={() => onReaction(review.id, 'like')} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-blue-500 transition-colors">
          👍 <span className="text-slate-900">{review.likes || 0}</span>
        </button>
        <button onClick={() => onReaction(review.id, 'dislike')} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-red-500 transition-colors">
          👎 <span className="text-slate-900">{review.dislikes || 0}</span>
        </button>
        <button onClick={() => setShowReplies(!showReplies)} className="text-sm font-bold text-blue-500 hover:underline">
          답글 {replies.length}
        </button>
      </div>

      {showReplies && (
        <div className="mt-8 pt-6 border-t border-slate-50 animate-in fade-in slide-in-from-top-2">
          {replies.map((reply: any) => (
            <div key={reply.id} className="ml-8 mb-4 pl-4 border-l-2 border-slate-100 py-1 flex justify-between items-start">
              <p className="text-[16px] text-slate-600 font-medium">{reply.comment}</p>
              {currentUser?.id === reply.user_id && (
                <button onClick={async () => { if(confirm("삭제?")) { await supabase.from('feedbacks').delete().eq('id', reply.id); refresh(); }}} className="text-[10px] font-bold text-slate-300 hover:text-red-400">삭제</button>
              )}
            </div>
          ))}
          {currentUser && (
            <div className="mt-6 flex gap-2 ml-8">
              <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="답글 작성..." className="flex-1 p-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-1 focus:ring-blue-200" />
              <button onClick={() => { onReplySubmit(review.id, replyText); setReplyText(""); }} className="px-5 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-blue-600">등록</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}