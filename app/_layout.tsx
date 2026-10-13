import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { handleGlobalOAuthRedirect, syncSessionToStorageAndDB } from '../lib/authSync';
import { supabase } from '../supabase';

export default function RootLayout() {
  useEffect(() => {
    // 앱 진입 시 URL에 포함된 PKCE code 또는 hash 토큰을 감지하여 세션 복구 및 DB 자동 등록
    handleGlobalOAuthRedirect();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        await syncSessionToStorageAndDB(session);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 탭 네비게이션이 들어있는 (tabs) 폴더를 부를 때, 중복되는 상단 헤더를 숨깁니다 */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="product"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}