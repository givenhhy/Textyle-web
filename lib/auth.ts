import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../supabase';

// 로그인 토큰 관리
// - 스프링 로그인은 Supabase 토큰(access_token 1시간 유효, refresh_token)을 돌려준다.
// - access_token만 저장하면 1시간 뒤 찜/북마크 API가 401이 되므로,
//   refresh_token과 함께 Supabase 세션으로 등록해 만료 전후에 자동으로 새 토큰을 받는다.
// - 'userToken'에는 항상 최신 access_token을 넣어 둔다(로그인 여부 확인용, 기존 코드 호환).
const TOKEN_KEY = 'userToken';

export class AuthExpiredError extends Error {
  constructor() {
    super('로그인이 만료되었습니다. 다시 로그인해주세요.');
    this.name = 'AuthExpiredError';
  }
}

export async function saveLoginTokens(accessToken: string, refreshToken?: string | null) {
  await AsyncStorage.setItem(TOKEN_KEY, accessToken);
  if (!refreshToken) return;
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error && data.session?.access_token) {
      await AsyncStorage.setItem(TOKEN_KEY, data.session.access_token);
    }
  } catch (error) {
    console.warn('로그인 세션 등록 실패:', error);
  }
}

// API에 보낼 access_token. 만료됐으면 refresh_token으로 새로 받아 온다.
export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  try {
    const { data } = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      return token;
    }
  } catch (error) {
    console.warn('토큰 확인/갱신 실패:', error);
  }
  // 세션이 없으면(예전 방식으로 로그인한 경우) 저장된 토큰을 그대로 쓴다. 강제 갱신 실패면 없음.
  return forceRefresh ? null : AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearLoginTokens() {
  await AsyncStorage.multiRemove([TOKEN_KEY, 'userEmail', 'userNickname']);
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('로그인 세션 정리 실패:', error);
  }
}

// 로그인이 필요한 API 호출. 401이면 토큰을 한 번 새로 받아 다시 시도하고,
// 그래도 401이면 저장된 로그인 정보를 지우고 AuthExpiredError를 던진다.
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new AuthExpiredError();

  const send = (accessToken: string) =>
    fetch(url, {
      ...init,
      headers: { ...((init.headers as Record<string, string>) || {}), Authorization: `Bearer ${accessToken}` },
    });

  let response = await send(token);
  if (response.status === 401) {
    const refreshed = await getAccessToken(true);
    if (refreshed && refreshed !== token) {
      response = await send(refreshed);
    }
    if (response.status === 401) {
      await clearLoginTokens();
      throw new AuthExpiredError();
    }
  }
  return response;
}
