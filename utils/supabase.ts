import { createClient } from '@supabase/supabase-js';

// .env.local에 저장한 환경변수를 불러옵니다.
// 뒤에 붙은 '!'는 "이 변수가 반드시 존재한다"고 타입스크립트에게 알려주는 확신(Non-null assertion)입니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 전역적으로 사용할 Supabase 클라이언트를 생성합니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);