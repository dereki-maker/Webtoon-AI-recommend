"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/utils/supabase";
import Link from "next/link";
import { NAVER_WEBTOON_DB } from "../../src/config/naver_data";

// 상수 설정
const ITEMS_PER_PAGE = 40;

interface WebtoonData {
  title: string;
  platform: string;
  genres: string[];
  status: string;
  aiScore: number;
  userAvgScore: number;
  reviewCount: number;
}

export default function LibraryPage() {
  // 1. [State] 기본 상태 선언
  const [allWebtoons, setAllWebtoons] = useState<WebtoonData[]>([]);
  const [sortBy, setSortBy] = useState<'ai' | 'user'>('ai');
  const [selectedGenre, setSelectedGenre] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [showTopButton, setShowTopButton] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 2. [Memo] 파생 데이터 연산 (이 위치가 효과보다 위에 있어야 에러가 안 납니다)
  
  // 전체 데이터에서 장르 목록 추출
  const genreList = useMemo(() => {
    const set = new Set<string>();
    allWebtoons.forEach(w => w.genres.forEach(g => set.add(g)));
    return ["전체", ...Array.from(set).sort()];
  }, [allWebtoons]);

  // 필터링 및 검색 결과 (무한 스크롤의 기준 데이터)
  const filteredWebtoons = useMemo(() => {
    return allWebtoons.filter(w => {
      const matchGenre = selectedGenre === "전체" || w.genres.includes(selectedGenre);
      const matchSearch = w.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchGenre && matchSearch;
    });
  }, [allWebtoons, selectedGenre, searchQuery]);

  // 실제로 화면에 렌더링할 슬라이싱된 데이터
  const displayedWebtoons = useMemo(() => 
    filteredWebtoons.slice(0, visibleCount), 
  [filteredWebtoons, visibleCount]);


  // 3. [Data Loading] 데이터 로드 로직
  const loadLibraryData = async () => {
    setLoading(true);
    const lines = NAVER_WEBTOON_DB.trim().split("\n");
    
    const staticData: WebtoonData[] = lines
      .filter(line => line.includes("|"))
      .map(line => {
        const parts = line.split("|").map(s => s.trim());
        const titlePart = parts[0].split(". ");
        const title = titlePart.length > 1 ? titlePart[1] : titlePart[0];
        
        return {
          title,
          platform: parts[1],
          genres: parts[2]?.split(", ").map(g => g.trim()) || [],
          status: parts[3],
          aiScore: parseFloat(parts[4]?.replace("점", "")) || 0,
          userAvgScore: 0,
          reviewCount: 0
        };
      });

    try {
      const { data: feedbackData, error } = await supabase
        .from('feedbacks')
        .select('webtoon_title, rating');

      let merged = [...staticData];
      if (!error && feedbackData) {
        const stats = feedbackData.reduce((acc: any, curr) => {
          if (!acc[curr.webtoon_title]) acc[curr.webtoon_title] = { sum: 0, count: 0 };
          acc[curr.webtoon_title].sum += curr.rating;
          acc[curr.webtoon_title].count += 1;
          return acc;
        }, {});

        merged = staticData.map(item => {
          const stat = stats[item.title];
          return {
            ...item,
            userAvgScore: stat ? stat.sum / stat.count : 0,
            reviewCount: stat ? stat.count : 0
          };
        });
      }

      merged.sort((a, b) => sortBy === 'ai' ? b.aiScore - a.aiScore : b.userAvgScore - a.userAvgScore);
      setAllWebtoons(merged);
    } catch (err) { console.error("데이터 로드 중 오류:", err); }
    setLoading(false);
  };

  // 4. [Side Effects] 부수 효과 처리
  
  // 초기 로드 및 정렬 변경 시
  useEffect(() => { loadLibraryData(); }, [sortBy]);

  // 필터/검색 시 노출 개수 초기화
  useEffect(() => { setVisibleCount(ITEMS_PER_PAGE); }, [selectedGenre, searchQuery, sortBy]);

  // 무한 스크롤 감지
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredWebtoons.length) {
          setVisibleCount(prev => prev + ITEMS_PER_PAGE);
        }
      },
      { threshold: 0.1 }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, visibleCount, filteredWebtoons.length]);

  // Top 버튼 노출 로직
  useEffect(() => {
    const handleScroll = () => setShowTopButton(window.scrollY > 500);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans relative">
      {/* 홈 바로가기 */}
      <div className="absolute top-10 left-6">
        <Link href="/" className="bg-white text-slate-600 text-[20px] font-bold px-5 py-2.5 rounded-full shadow-sm border border-slate-100 hover:bg-slate-50 transition-all flex items-center gap-2 active:scale-95">← 홈으로</Link>
      </div>

      <div className="max-w-7xl mx-auto pt-16">
        <header className="flex flex-col gap-6 mb-12">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6">
            <div className="w-full md:w-auto text-center md:text-left">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">별점 저장소 📚</h1>
              <p className="text-slate-500 font-medium mt-1">총 {filteredWebtoons.length}개의 분석 데이터를 로드했습니다.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <input 
                type="text" 
                placeholder="찾으시는 작품이 있나요?" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-5 py-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm text-sm outline-none focus:ring-2 focus:ring-blue-400 transition-all md:w-64"
              />
              <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
                <button onClick={() => setSortBy('ai')} className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${sortBy === 'ai' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>AI 별점</button>
                <button onClick={() => setSortBy('user')} className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black transition-all ${sortBy === 'user' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>독자 별점</button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 scrollbar-hide">
            {genreList.map(genre => (
              <button key={genre} onClick={() => setSelectedGenre(genre)} className={`px-4 py-1.5 rounded-full text-[12px] font-bold border transition-all ${selectedGenre === genre ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-white text-slate-400 border-slate-100 hover:text-blue-500"}`}>
                {genre === "전체" ? "ALL" : `#${genre}`}
              </button>
            ))}
          </div>
        </header>

        {/* 메인 그리드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {displayedWebtoons.map((item, index) => (
            <Link 
              key={`${item.title}-${index}`} 
              href={`/community/${encodeURIComponent(item.title)}`} // 상세 페이지 주소 생성
              className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[220px] group"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded tracking-tighter">{item.platform}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded ${item.status === '완결' ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-500'}`}>{item.status}</span>
                </div>
                {/* group-hover를 써서 마우스를 올리면 제목 색이 바뀌게 센스를 더해봤습니다 */}
                <h3 className="text-[18px] font-black text-slate-800 leading-tight mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">{item.title}</h3>
                <div className="flex flex-wrap gap-1 mb-4">
                  {item.genres.slice(0, 3).map(g => (
                    <span key={g} className="text-[10px] font-bold text-slate-300">#{g}</span>
                  ))}
                </div>
              </div>
                
              <div className="pt-4 border-t border-slate-50 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-tighter">AI Score</span>
                  <span className="text-[18px] font-black text-yellow-500">★ {item.aiScore.toFixed(1)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">User Score</span>
                  <span className={`text-[18px] font-black ${item.userAvgScore > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                    👤 {item.userAvgScore > 0 ? item.userAvgScore.toFixed(1) : "0.0"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* 무한 스크롤 감지 보초(Sentinel) */}
        <div ref={sentinelRef} className="h-40 flex items-center justify-center">
          {visibleCount < filteredWebtoons.length ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 text-xs font-bold">더 불러오는 중...</p>
            </div>
          ) : (
            <p className="text-slate-300 font-bold">마지막 작품입니다. 😊</p>
          )}
        </div>
      </div>

      {/* Top 버튼 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-10 right-10 p-4 bg-slate-900 text-white rounded-full shadow-2xl transition-all duration-500 z-50 hover:bg-blue-600 active:scale-90 ${showTopButton ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>
    </main>
  );
}