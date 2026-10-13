import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

export const handleGlobalOAuthRedirect = async (): Promise<boolean> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash ? window.location.hash.substring(1) : '');

    // 1. 에러 체크
    const errorDesc =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');

    if (errorDesc) {
      console.error('❌ Google OAuth 에러 발생:', decodeURIComponent(errorDesc));
      alert('구글 로그인 실패: ' + decodeURIComponent(errorDesc));
      return false;
    }

    // 2. PKCE code 확인 (?code=...)
    const code = searchParams.get('code');
    if (code) {
      console.log('🔥 PKCE code 감지됨, exchangeCodeForSession 진행 중... code:', code);
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('❌ PKCE exchangeCodeForSession 실패:', error.message);
      } else if (data?.session) {
        console.log('✅ PKCE 세션 획득 성공:', data.session.user.email);
        await syncSessionToStorageAndDB(data.session);
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        return true;
      }
    }

    // 3. Hash access_token 확인 (#access_token=...) (Implicit Flow)
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken) {
      console.log('🔥 Hash access_token 감지됨, 유저 정보 조회...');
      const { data: userData } = await supabase.auth.getUser(accessToken);
      if (userData?.user) {
        await syncSessionToStorageAndDB({
          access_token: accessToken,
          refresh_token: refreshToken || '',
          user: userData.user,
        });
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        return true;
      }
    }

    // 4. 기존 Supabase 세션 감지
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession) {
      await syncSessionToStorageAndDB(existingSession);
      return true;
    }
  } catch (err) {
    console.error('Global OAuth redirect 처리 예외:', err);
  }

  return false;
};

export const syncSessionToStorageAndDB = async (oSession: any) => {
  if (!oSession || !oSession.access_token || !oSession.user) return;

  const user = oSession.user;
  const accessToken = oSession.access_token;
  const refreshToken = oSession.refresh_token || '';
  const email = (user.email || '').trim().toLowerCase();

  const autoNickname =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (email.includes('@') ? email.split('@')[0] : '') ||
    'textyle-user';

  let finalNickname = autoNickname;

  // 1. Supabase PostgreSQL users 테이블에 직접 upsert (백엔드 배포 여부와 무관하게 DB에 즉시 등록 보장!)
  try {
    const { error: dbError } = await supabase.from('users').upsert({
      id: user.id,
      email: email,
      nickname: autoNickname,
    });
    if (dbError) {
      console.warn('⚠️ Supabase users 테이블 직접 upsert 경고:', dbError.message);
    } else {
      console.log('✅ Supabase users 테이블에 DB 등록 완료:', email);
    }
  } catch (dbErr) {
    console.warn('Supabase DB 직접 연동 예외:', dbErr);
  }

  // 2. 스프링 부트 소셜 로그인 API 호출 (배포 서버 지원 시)
  try {
    const API_URL = process.env.EXPO_PUBLIC_FASHION_API_URL?.replace(/\/$/, '') || 'http://localhost:8080';
    const res = await fetch(`${API_URL}/api/auth/social-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        refreshToken,
        email,
        nickname: autoNickname,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.nickname) finalNickname = data.nickname;
    }
  } catch (backendErr) {
    console.warn('백엔드 소셜 API 호출 실패 (무시하고 로컬 세션 유지):', backendErr);
  }

  // 3. AsyncStorage 세션 저장
  await AsyncStorage.setItem('userToken', accessToken);
  await AsyncStorage.setItem('userEmail', email);
  await AsyncStorage.setItem('userNickname', finalNickname);
  await AsyncStorage.setItem('userProvider', 'google');

  // 4. 주소창 정리 (code=..., access_token=... 제거)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history) {
    window.history.replaceState(null, '', window.location.pathname);
  }
};
