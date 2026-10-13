import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { notify } from './notify';
import { supabase } from '../supabase';

type SessionLike = Pick<Session, 'access_token' | 'refresh_token' | 'user'>;

const getApiUrl = () => process.env.EXPO_PUBLIC_FASHION_API_URL?.replace(/\/$/, '') || 'http://localhost:8080';

// _layout, 로그인 화면, 인증 상태 리스너가 같은 세션으로 동시에 호출해도 한 번만 처리한다.
let lastSyncedToken: string | null = null;
let syncInFlight: Promise<void> | null = null;

// 주소창에서 로그인 관련 값(code, access_token, error 등)만 지운다. 다른 화면의 주소 파라미터는 건드리지 않는다.
const AUTH_QUERY_KEYS = ['code', 'state', 'error', 'error_code', 'error_description'];

const clearAuthParamsFromUrl = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of AUTH_QUERY_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (/access_token=|error=/.test(url.hash)) {
    url.hash = '';
    changed = true;
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString());
};

/**
 * 웹에서 구글 로그인 후 돌아왔을 때 처리한다.
 * 주소의 ?code= / #access_token= 은 supabase 클라이언트(detectSessionInUrl)가 자동으로 세션으로 바꾸므로
 * 여기서는 코드를 다시 교환하지 않고, 에러만 확인한 뒤 만들어진 세션을 동기화한다.
 */
export const handleGlobalOAuthRedirect = async (): Promise<boolean> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash ? window.location.hash.substring(1) : '');
    const errorDesc =
      searchParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');

    if (errorDesc) {
      console.error('구글 로그인 에러:', errorDesc);
      clearAuthParamsFromUrl();
      notify('구글 로그인 실패', errorDesc);
      return false;
    }

    // getSession()은 클라이언트 초기화(주소의 code/token 처리 포함)가 끝날 때까지 기다린 뒤 세션을 돌려준다.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await syncSessionToStorageAndDB(session);
      return true;
    }
  } catch (err) {
    console.error('구글 로그인 리다이렉트 처리 예외:', err);
  }

  return false;
};

const runSync = async (session: SessionLike) => {
  const user = session.user;
  const accessToken = session.access_token;
  const provider = (user.app_metadata?.provider as string | undefined) || 'email';

  // 이메일 계정은 로그인할 때 프로필을 이미 저장했으므로 토큰만 최신으로 맞춘다.
  if (provider === 'email') {
    await AsyncStorage.setItem('userToken', accessToken);
    lastSyncedToken = accessToken;
    return;
  }

  const email = (user.email || '').trim().toLowerCase();
  let nickname =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (email.includes('@') ? email.split('@')[0] : '') ||
    'textyle-user';

  // 회원 등록은 스프링 서버(/api/auth/social-login)와 DB 트리거가 맡는다. 브라우저에서 users 테이블에 직접 쓰지 않는다.
  try {
    const res = await fetch(`${getApiUrl()}/api/auth/social-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        refreshToken: session.refresh_token || '',
        email,
        nickname,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.nickname) nickname = data.nickname;
    } else {
      console.warn('소셜 로그인 동기화 실패:', res.status);
    }
  } catch (err) {
    console.warn('소셜 로그인 동기화 요청 실패 (로그인 세션은 유지):', err);
  }

  await AsyncStorage.multiSet([
    ['userToken', accessToken],
    ['userEmail', email],
    ['userNickname', nickname],
    ['userProvider', provider],
  ]);
  lastSyncedToken = accessToken;
  clearAuthParamsFromUrl();
};

export const syncSessionToStorageAndDB = async (session: SessionLike | null | undefined): Promise<void> => {
  if (!session?.access_token || !session.user) return;
  if (session.access_token === lastSyncedToken) return;

  if (syncInFlight) {
    await syncInFlight;
    if (session.access_token === lastSyncedToken) return;
  }

  syncInFlight = runSync(session).finally(() => {
    syncInFlight = null;
  });
  await syncInFlight;
};
