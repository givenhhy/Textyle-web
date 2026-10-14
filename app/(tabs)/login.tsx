import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notify } from '../../lib/notify';
import { supabase } from '../../supabase';
import { handleGlobalOAuthRedirect, syncSessionToStorageAndDB } from '../../lib/authSync';
import { clearLoginTokens, saveLoginTokens } from '../../lib/auth';

export default function LoginScreen() {
  const [session, setSession] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [nickname, setNickname] = useState('');
  const [authProvider, setAuthProvider] = useState('이메일 (Spring Boot)');
  const [authProcessing, setAuthProcessing] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return (
        window.location.search.includes('code=') ||
        window.location.hash.includes('access_token=')
      );
    }
    return false;
  });

  // 앱 시작 시 저장된 토큰 확인 및 OAuth 리다이렉트 처리
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const hasOAuth =
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        (window.location.search.includes('code=') || window.location.hash.includes('access_token='));

      if (hasOAuth) {
        setAuthProcessing(true);
      }

      try {
        // 1. URL에 OAuth code(?code=...) 또는 hash(#access_token=...)가 있으면 세션 획득 및 DB 등록
        await handleGlobalOAuthRedirect();
        // 2. AsyncStorage 토큰 확인
        await checkToken();
      } finally {
        if (isMounted) {
          setAuthProcessing(false);
        }
      }
    };

    initAuth();

    // 3. Supabase 인증 상태 변경 리스너
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && currentSession) {
        if (isMounted) setAuthProcessing(true);
        try {
          await syncSessionToStorageAndDB(currentSession);
          await checkToken();
        } finally {
          if (isMounted) setAuthProcessing(false);
        }
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const checkToken = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const savedEmail = await AsyncStorage.getItem('userEmail');
      const savedNickname = await AsyncStorage.getItem('userNickname');
      const savedProvider = await AsyncStorage.getItem('userProvider');

      if (token) {
        if (savedEmail) setEmail(savedEmail);
        if (savedNickname) setNickname(savedNickname);
        if (savedProvider) setAuthProvider(savedProvider === 'google' ? 'Google' : '이메일 (Spring Boot)');
        setSession(true);
      }
    } catch (e) {
      console.log('토큰 확인 실패', e);
    }
  };

  /**
   * 구글 OAuth 세션 동기화 (백엔드 DB에 유저 자동 등록/동기화)
   */
  const syncOAuthUser = async (oSession: any) => {
    if (!oSession) return;
    await syncSessionToStorageAndDB(oSession);
    await checkToken();
    setShowEmailForm(false);
    setGoogleLoading(false);
  };

  /**
   * 구글 로그인 실행
   */
  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      const redirectUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/login`
          : 'http://localhost:8081/login';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        notify('구글 로그인 실패', error.message);
        setGoogleLoading(false);
      }
    } catch (err: any) {
      notify('오류', '구글 로그인 중 문제가 발생했습니다.');
      setGoogleLoading(false);
    }
  };

  const signInWithEmail = async () => {
    if (!email.trim() || !password) {
      notify('입력 필요', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const API_URL = process.env.EXPO_PUBLIC_FASHION_API_URL?.replace(/\/$/, '') || 'http://localhost:8080';
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // refresh token까지 저장해야 1시간 뒤에도 토큰이 자동 갱신된다 (lib/auth.ts)
        await saveLoginTokens(data.accessToken, data.refreshToken);
        await AsyncStorage.setItem('userEmail', data.email || email.trim().toLowerCase());
        if (data.nickname) await AsyncStorage.setItem('userNickname', data.nickname);
        await AsyncStorage.setItem('userProvider', 'email');

        setNickname(data.nickname || '회원');
        setAuthProvider('이메일 (Spring Boot)');
        setSession(true);
      } else {
        const err = await response.json();
        notify('로그인 실패', err.error || '이메일이나 비밀번호가 틀렸습니다.');
      }
    } catch (error) {
      notify('네트워크 에러', '서버에 연결할 수 없습니다.');
    }
    setLoading(false);
  };

  const signOut = async () => {
    // 저장된 토큰·프로필과 Supabase 세션을 함께 지운다 (이 기기만 로그아웃)
    await clearLoginTokens();
    setSession(false);
    setPassword('');
    setShowEmailForm(false);
    setAuthProvider('이메일 (Spring Boot)');
  };

  const showDeleteAccountNotice = () => {
    notify('회원탈퇴', '회원탈퇴 기능은 현재 구현 중입니다.');
  };

  if (authProcessing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.authProcessingContainer}>
          <ActivityIndicator size="large" color="#3E6AE1" />
          <Text style={styles.authProcessingTitle}>로그인 처리 중입니다</Text>
          <Text style={styles.authProcessingSubtitle}>
            계정 정보를 확인하고 있습니다.{'\n'}잠시만 기다려주세요...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    if (showEmailForm) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView style={styles.keyboardContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.emailScreenContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.backIconButton} onPress={() => setShowEmailForm(false)} activeOpacity={0.72}>
                <Ionicons name="chevron-back" size={28} color="#171A20" />
              </TouchableOpacity>
              <View style={styles.emailScreenHeader}>
                <Text style={styles.emailScreenTitle}>이메일로 로그인</Text>
                <Text style={styles.emailScreenSubtitle}>가입한 이메일과 비밀번호를 입력해주세요.</Text>
              </View>
              <View style={styles.emailForm}>
                <TextInput
                  style={styles.input}
                  placeholder="이메일 주소"
                  placeholderTextColor="#A0A0A0"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading && !googleLoading}
                />
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="비밀번호"
                    placeholderTextColor="#A0A0A0"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading && !googleLoading}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color="#8E8E8E"
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, (loading || googleLoading) && styles.disabledButton]}
                  onPress={signInWithEmail}
                  disabled={loading || googleLoading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={styles.buttonLoadingRow}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={[styles.primaryButtonText, { marginLeft: 8 }]}>로그인 중...</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>로그인</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>또는</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={[styles.googleLoginButton, (loading || googleLoading) && styles.disabledButton]}
                  onPress={signInWithGoogle}
                  disabled={loading || googleLoading}
                  activeOpacity={0.8}
                >
                  {googleLoading ? (
                    <View style={styles.googleButtonContent}>
                      <ActivityIndicator size="small" color="#EA4335" />
                      <Text style={styles.googleLoginButtonText}>Google 로그인 창으로 이동 중...</Text>
                    </View>
                  ) : (
                    <View style={styles.googleButtonContent}>
                      <FontAwesome name="google" size={19} color="#EA4335" />
                      <Text style={styles.googleLoginButtonText}>Google로 계속하기</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.authContent} bounces={false}>
          <View style={styles.guestHero}>
            <Text style={styles.guestTitle}>나만의 패션을{'\n'}완성해보세요.</Text>

            {/* 구글 로그인 버튼 (최우선 배치) */}
            <TouchableOpacity
              style={[styles.googleLoginButton, (loading || googleLoading) && styles.disabledButton]}
              onPress={signInWithGoogle}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <View style={styles.googleButtonContent}>
                  <ActivityIndicator size="small" color="#EA4335" />
                  <Text style={styles.googleLoginButtonText}>Google 로그인 창으로 이동 중...</Text>
                </View>
              ) : (
                <View style={styles.googleButtonContent}>
                  <FontAwesome name="google" size={20} color="#EA4335" />
                  <Text style={styles.googleLoginButtonText}>Google로 계속하기</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* 기존 이메일 로그인 버튼 */}
            <TouchableOpacity
              style={styles.guestLoginButton}
              onPress={() => setShowEmailForm(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.guestLoginButtonText}>이메일로 로그인</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionBlock}>
            <TouchableOpacity style={styles.signUpInlineButton} onPress={() => router.push('/signup')} activeOpacity={0.72}>
              <Text style={styles.signUpInlineText}>아직 계정이 없으신가요? 회원가입</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.guestMenu}>
            <Text style={styles.kicker}>고객 지원</Text>
            <TouchableOpacity style={styles.guestMenuRow} activeOpacity={0.72}>
              <Text style={styles.guestMenuText}>공지사항</Text>
              <Ionicons name="chevron-forward" size={20} color="#D0D1D2" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.guestMenuRow} activeOpacity={0.72}>
              <Text style={styles.guestMenuText}>이용 가이드</Text>
              <Ionicons name="chevron-forward" size={20} color="#D0D1D2" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.profileContent}>
        <View style={styles.memberHero}>
          <Text style={styles.memberName}>{nickname}님, 반가워요!</Text>
          <View style={styles.memberSummaryCard}>
            <View style={styles.memberAvatarBox}>
              <Ionicons name="person-circle-outline" size={52} color="#C0C0C0" />
              <Text style={styles.memberAvatarLabel}>내 프로필</Text>
            </View>
            <View style={styles.memberInfoBox}>
              <View style={styles.memberInfoRow}>
                <Text style={styles.memberInfoLabel}>이메일</Text>
                <Text style={styles.memberInfoValue}>{email}</Text>
              </View>
              <View style={styles.memberDivider} />
              <View style={styles.memberInfoRow}>
                <Text style={styles.memberInfoLabel}>가입 방식</Text>
                <Text style={styles.memberInfoValue}>{authProvider}</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.memberMenu}>
          <TouchableOpacity style={styles.memberMenuRow} onPress={signOut} activeOpacity={0.72}>
            <Text style={styles.memberMenuText}>로그아웃</Text>
            <Ionicons name="chevron-forward" size={18} color="#D0D1D2" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.memberMenuRow} onPress={showDeleteAccountNotice} activeOpacity={0.72}>
            <Text style={styles.deleteMenuText}>회원탈퇴</Text>
            <Ionicons name="chevron-forward" size={18} color="#D0D1D2" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  keyboardContainer: { flex: 1 },
  authContent: { flexGrow: 1, paddingTop: 82, paddingBottom: 36 },
  guestHero: { paddingHorizontal: 28, paddingBottom: 38, borderBottomWidth: 8, borderBottomColor: '#F4F4F4' },
  guestTitle: { color: '#171A20', fontSize: 26, lineHeight: 36, fontWeight: '600', marginBottom: 28 },

  googleLoginButton: {
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E4E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLoginButtonText: {
    color: '#1F1F1F',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    marginLeft: 10,
  },

  guestLoginButton: { minHeight: 56, borderRadius: 8, backgroundColor: '#3E6AE1', alignItems: 'center', justifyContent: 'center' },
  guestLoginButtonText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  actionBlock: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 12, paddingHorizontal: 28, paddingTop: 22 },
  signUpInlineButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#F4F4F4' },
  signUpInlineText: { color: '#393C41', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  emailScreenContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 18, paddingBottom: 36 },
  backIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  emailScreenHeader: { marginTop: 42, marginBottom: 24 },
  emailScreenTitle: { color: '#171A20', fontSize: 28, lineHeight: 36, fontWeight: '600' },
  emailScreenSubtitle: { marginTop: 8, color: '#5C5E62', fontSize: 14, lineHeight: 20 },
  emailForm: { gap: 10, marginTop: 2 },
  input: { minHeight: 52, backgroundColor: '#FFFFFF', paddingHorizontal: 14, borderRadius: 6, fontSize: 16, borderWidth: 1, borderColor: '#EEEEEE', color: '#171A20' },
  passwordContainer: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  passwordInput: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#171A20',
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: { minHeight: 52, borderRadius: 6, backgroundColor: '#3E6AE1', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: '#8E8E8E',
    fontWeight: '500',
  },

  disabledButton: { opacity: 0.68 },
  guestMenu: { paddingHorizontal: 28, paddingTop: 28 },
  guestMenuRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  guestMenuText: { color: '#171A20', fontSize: 19, lineHeight: 25, fontWeight: '600' },
  kicker: { color: '#3E6AE1', fontSize: 22, lineHeight: 28, fontWeight: '600', marginBottom: 18 },
  profileContent: { flexGrow: 1, backgroundColor: '#FFFFFF', paddingBottom: 42 },
  memberHero: { paddingHorizontal: 24, paddingTop: 86, paddingBottom: 24, backgroundColor: '#F4F4F4' },
  memberName: { color: '#171A20', fontSize: 31, lineHeight: 39, fontWeight: '600', marginBottom: 20 },
  memberSummaryCard: { flexDirection: 'row', gap: 12 },
  memberAvatarBox: { width: 122, minHeight: 128, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  memberAvatarLabel: { color: '#8E8E8E', fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 10 },
  memberInfoBox: { flex: 1, minHeight: 128, borderRadius: 8, backgroundColor: '#FFFFFF', paddingHorizontal: 16, justifyContent: 'center' },
  memberInfoRow: { minHeight: 48, justifyContent: 'center' },
  memberInfoLabel: { color: '#8E8E8E', fontSize: 10, lineHeight: 15, marginBottom: 3 },
  memberInfoValue: { color: '#171A20', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  memberDivider: { height: 1, backgroundColor: '#EEEEEE' },
  memberMenu: { paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 8, borderBottomColor: '#F4F4F4' },
  memberMenuRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberMenuText: { color: '#171A20', fontSize: 18, lineHeight: 25, fontWeight: '600' },
  deleteMenuText: { color: '#B42318', fontSize: 18, lineHeight: 25, fontWeight: '600' },

  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authProcessingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  authProcessingTitle: {
    color: '#171A20',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  authProcessingSubtitle: {
    color: '#5C5E62',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
