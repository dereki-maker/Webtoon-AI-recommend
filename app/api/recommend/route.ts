import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { NAVER_WEBTOON_DB } from "@/src/config/naver_data";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


export async function POST(request: Request) {
  console.log("--- API 요청 수신됨 ---"); // 터미널 확인용

  try {
    const { prompt,seenList } = await request.json();
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    // 1. 키 존재 여부 확인
    if (!apiKey) {
      console.error("❌ 에러: API 키가 없습니다! .env.local 파일을 확인하세요.");
      return NextResponse.json({ error: "API 키 누락" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
        temperature: 0.0, // 0에 가까우면 일관적/딱딱함, 1에 가까우면 자유로움
        topP: 0.95,
        maxOutputTokens: 1000, // 답변의 최대 길이를 제한
    }
    });

    const fullPrompt = `
    당신은 대한민국 웹툰 비평가입니다. 아래 지침을 엄격히 준수하여 JSON으로 응답하세요.
    반드시 참조 데이터베이스에 근거하여 답변해야합니다. 사용자가 이미 읽은 작품은 
    추천하지 마세요.

    [참조 데이터베이스]
    ${NAVER_WEBTOON_DB}

    다음은 사용자가 이미 읽은 작품 리스트입니다: [${seenList.join(", ")}].

    [엄격 지침1]
    1. 반드시 참조 데이터베이스에서 정보를 확인하고 추천하세요.
    2. 추천할 때 반드시 별점이 높아야할 필요는 없습니다. 
    3. 사용자가 이미 읽은 작품 리스트에 있는 작품은 추천하지 마세요.
    4. 3개의 웹툰을 추천합니다.
    5. 사용자의 요구: "${prompt}"를 정확히 반영합니다.
    6. 한국어로 답변합니다. 반드시 아래 JSON 형식으로만 응답하세요.

    [응답 JSON 형식 예시]
    {
      "recommendations": [
        {
          "title": "정확한 제목",
          "platform": "네이버/카카오/레진 등 플랫폼 명",
          "status": "완결/연재중",
          "genres": [로맨스/판타지/무협/코미디/느와르/학원/액션/스릴러/BL/GL 등] 3개,
          "score": 엄격 지침에 따른 별점(0.0~5.0),
        }
      ]
    }

    [실제 사용자 요청]
    사용자의 요구: "${prompt}"
    AI 답변:
    `;
    
    let retryCount = 0;
    const maxRetries = 3; // 최대 3번 재시도
    let text = "";

    while (retryCount <= maxRetries) {
      try {
        console.log(`🤖 제미나이 AI에게 요청을 보냅니다... (시도 ${retryCount + 1})`);
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        text = response.text();
        break; // 성공 시 루프 탈출
      } catch (error: any) {
        // 429 에러(Too Many Requests)이고 아직 재시도 횟수가 남았다면
        if (error.status === 429 && retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 2000; // 2초, 4초, 8초...
          console.warn(`⚠️ 429 에러 발생! ${waitTime}ms 후 재시도합니다.`);
          await sleep(waitTime);
          retryCount++;
        } else {
          // 429가 아니거나 재시도 한도를 넘었으면 에러를 밖으로 던짐
          throw error;
        }
      }
    }

    console.log("✅ AI 응답 성공!");
    return NextResponse.json({ result: text });

  } catch (error: any) {
  console.error("실제 에러 로그:", error); // 서버 터미널에 상세 로그 출력
  return NextResponse.json({ 
    error: error.message || "알 수 없는 에러", 
    detail: error // 에러 객체 전체를 프론트엔드로 전달
  }, { status: 500 });
}
}