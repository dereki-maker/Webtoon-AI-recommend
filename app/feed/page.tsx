"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/utils/supabase";
import Link from "next/link";

const ITEMS_PER_PAGE = 20;

export default function GlobalFeedPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'latest' | 'likes'>('latest');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [loading, setLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchAllReviews = async () => {
    setLoading(true);
    let query = supabase
      .from('feedbacks')
      .select('*, reply_count:feedbacks!parent_id(count)') 
      .is('parent_id', null);

    if (sortBy === 'likes') {
      query = query.order('likes', { ascending: false }).order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    
    if (!error && data) {
      const formattedData = data.map(item => ({
        ...item,
        replyCount: item.reply_count[0]?.count || 0
      }));
      setReviews(formattedData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllReviews();
  }, [sortBy]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < reviews.length) {
          setVisibleCount(prev => prev + ITEMS_PER_PAGE);
        }
      },
      { threshold: 0.1 }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [visibleCount, reviews.length]);

  const displayedReviews = reviews.slice(0, visibleCount);

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans relative">
      <div className="absolute top-6 left-6 z-40 flex gap-3">
        <Link href="/" className="bg-white text-slate-600 text-[16px] font-bold px-5 py-2.5 rounded-full shadow-sm border border-slate-100 hover:bg-slate-50 transition-all active:scale-95">← 홈으로</Link>
        <Link href="/library" className="bg-white text-slate-600 text-[16px] font-bold px-5 py-2.5 rounded-full shadow-sm border border-slate-100 hover:bg-slate-50 transition-all flex items-center gap-2 active:scale-95">별점 저장소 📚</Link>
      </div>

      <div className="max-w-6xl mx-auto pt-16 mb-8 flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">리뷰 저장소</h1>
          <p className="text-slate-500 font-medium mt-1">사용자들이 남긴 최신 별점과 한줄평을 확인하세요.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
          <button onClick={() => setSortBy('latest')} className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${sortBy === 'latest' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>최신순</button>
          <button onClick={() => setSortBy('likes')} className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${sortBy === 'likes' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>인기순 🔥</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
        {/* 📋 게시판 헤더: 요청하신 순서대로 재배치 */}
        <div className="hidden md:grid grid-cols-12 gap-4 bg-slate-50 p-5 border-b border-slate-100 text-[13px] font-black text-slate-400 uppercase tracking-widest">
          <div className="col-span-2">작품명</div>
          <div className="col-span-5 text-center">리뷰 내용</div>
          <div className="col-span-1 text-center">추천</div>
          <div className="col-span-1 text-center">답글</div>
          <div className="col-span-1 text-center">별점</div>
          <div className="col-span-2 text-center">작성일</div>
        </div>

        <div className="divide-y divide-slate-50">
          {displayedReviews.map((review) => (
            <Link 
              key={review.id} 
              href={`/community/${encodeURIComponent(review.webtoon_title)}#review-${review.id}`}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 p-5 items-center hover:bg-blue-50/50 transition-colors group"
            >
              {/* 1. 작품명 */}
              <div className="col-span-1 md:col-span-2">
                <span className="text-[12px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-md line-clamp-1 block w-fit">{review.webtoon_title}</span>
              </div>

              {/* 2. 리뷰 내용 */}
              <div className="col-span-1 md:col-span-5">
                <p className="text-slate-700 font-medium text-[16px] md:text-[15px] line-clamp-1 md:line-clamp-2">{review.comment}</p>
              </div>

              {/* 3. 추천(좋아요) */}
              <div className="col-span-1 md:col-span-1 text-center">
                <span className={`text-[13px] font-black ${review.likes > 0 ? 'text-blue-500' : 'text-slate-200'}`}>{review.likes || 0}</span>
              </div>

              {/* 4. 답글 개수 */}
              <div className="col-span-1 md:col-span-1 text-center">
                <span className={`text-[13px] font-bold ${review.replyCount > 0 ? 'text-slate-800' : 'text-slate-200'}`}>
                  {review.replyCount}
                </span>
              </div>

              {/* 5. 별점 */}
              <div className="col-span-1 md:col-span-1 text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-yellow-400 text-sm">★</span>
                  <span className="text-[14px] font-black text-slate-800">{review.rating > 0 ? review.rating.toFixed(1) : "-"}</span>
                </div>
              </div>

              {/* 6. 작성일 */}
              <div className="col-span-1 md:col-span-2 text-center">
                <span className="text-[12px] font-bold text-slate-300">{new Date(review.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>

        <div ref={sentinelRef} className="py-12 text-center bg-white border-t border-slate-50">
          {loading ? (
            <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          ) : visibleCount >= reviews.length ? (
            <p className="text-slate-300 font-bold text-sm">마지막 리뷰입니다. 😊</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}